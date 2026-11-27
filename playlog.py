"""Play history: who joined which house and for how long.

Every join and leave is appended to a JSON-lines file that is never rewritten,
truncated or rotated by this code, so the history survives restarts and
deploys. Players are identified by an anonymous random id that their browser
keeps; no IP addresses or names are stored.

File format, one JSON object per line (the exact fields are in SCHEMA below):
    {"e":"boot","ts":...,"v":format version}            server started
    {"e":"join","ts":...,"sid":...,"u":...,"house":...,"pub":0|1,"char":...,"n":players in the house}
    {"e":"char","ts":...,"sid":...,"char":...}          switched character without leaving
    {"e":"leave","ts":...,"sid":...,"dur":seconds,"trp":...,"slaps":...,"n":players left}
    {"e":"tick","ts":...}                               heartbeat while anyone is playing

If the server dies without writing a leave (crash, kill -9), the session is
closed at the last timestamp seen before the next boot; the heartbeat keeps
that within about a minute of the truth.

Changing the format: edit SCHEMA and raise SCHEMA_VERSION. The next time the
server starts it copies the existing log files into a dated backup folder
(see backup_logs.py) before it writes a single line in the new format. If
that backup cannot be made, nothing is written at all.
"""

import json
import os
import re
import time

import backup_logs

# The data model of the play log: every event and the fields it carries.
# _write() refuses anything else, and tests/test_schema_backup.py pins this
# table to SCHEMA_VERSION, so the format cannot change without a new version
# number, and a new version number always triggers a backup first.
SCHEMA_VERSION = 1
SCHEMA = {
    "boot": ("e", "ts", "v"),
    "join": ("e", "ts", "sid", "u", "house", "pub", "char", "n"),
    "char": ("e", "ts", "sid", "char"),
    "leave": ("e", "ts", "sid", "dur", "trp", "slaps", "n"),
    "tick": ("e", "ts"),
}

VISIT_GAP = 30 * 60      # back within this many seconds = the same visit (covers reconnects and deploys)
PID_RE = re.compile(r"^[a-z0-9]{12,32}$")

_fh = None
_boot = "%x" % int(time.time() * 1000)
_seq = 0
SESSIONS = []            # every session ever, in join order
ACTIVE = {}              # sid -> session still in progress
storage = "off"          # "custom" | "home" | "repo" | "off"
path = None
backup = None            # manifest of the backup taken for this SCHEMA_VERSION
problem = None           # why nothing is being saved, when storage is "off"


def _candidates():
    env = os.environ.get("SESSION_LOG")
    if env:
        yield "custom", env
    home = os.path.expanduser("~")
    if home and home not in ("~", "/"):
        # Outside the code checkout on purpose: a deploy that replaces or
        # cleans the checkout must not take the history with it.
        yield "home", os.path.join(home, ".bigtoss", "sessions.jsonl")
    yield "repo", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "sessions.jsonl")


def _load(p):
    """Rebuild SESSIONS from an existing log."""
    opened, last_ts = {}, 0.0

    def cut():      # sessions that never got a leave: close them at the last sign of life
        for r in opened.values():
            r["dur"] = max(0.0, last_ts - r["ts"])
        opened.clear()

    try:
        fh = open(p, "rt", encoding="utf-8", errors="replace")
    except OSError:
        return
    with fh:
        for line in fh:
            try:
                ev = json.loads(line)
                ts = float(ev["ts"])
                kind = ev["e"]
            except (ValueError, KeyError, TypeError):
                continue
            if kind == "boot":
                cut()
            elif kind == "join":
                r = {"sid": str(ev.get("sid")), "ts": ts, "u": str(ev.get("u") or ""), "house": str(ev.get("house") or "?"),
                     "pub": 1 if ev.get("pub") else 0, "char": str(ev.get("char") or "?"), "dur": None}
                r["segs"] = [(ts, r["char"])]
                opened[r["sid"]] = r
                SESSIONS.append(r)
            elif kind == "char":
                r = opened.get(str(ev.get("sid")))
                if r and ev.get("char"):
                    r["char"] = str(ev["char"])
                    r["segs"].append((ts, r["char"]))
            elif kind == "leave":
                r = opened.pop(str(ev.get("sid")), None)
                if r:
                    d = ev.get("dur")
                    r["dur"] = max(0.0, float(d) if isinstance(d, (int, float)) else ts - r["ts"])
            last_ts = max(last_ts, ts)
    cut()


def _write(kind, **fields):
    names = SCHEMA[kind][1:]
    if set(fields) != set(names):
        raise ValueError("play log event %r does not match SCHEMA" % kind)
    if _fh is None:
        return
    ev = {"e": kind}
    for k in names:
        ev[k] = fields[k]
    try:
        _fh.write(json.dumps(ev, separators=(",", ":")) + "\n")
        _fh.flush()
    except OSError:
        pass


def open_log(access_log=None):
    """Pick a writable location, load what is already there and start appending.

    Before the first line is written under a new SCHEMA_VERSION, the existing
    play history (and the visitor log `access_log`, with its rotated files) is
    copied to a dated backup folder next to the play log.
    """
    global _fh, storage, path, backup, problem
    if _fh is not None:
        return
    problem = "no writable place for the play log (set SESSION_LOG)"
    for kind, p in _candidates():
        try:
            os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
            fh = open(p, "at", encoding="utf-8")      # append only: existing history is kept
        except OSError:
            continue
        full = os.path.abspath(p)
        try:
            backup, _ = backup_logs.ensure_for_schema(
                os.path.join(os.path.dirname(full), "backups"), SCHEMA_VERSION,
                [("play", backup_logs.log_files(full)), ("access", backup_logs.log_files(access_log))], key=full)
        except backup_logs.BackupError as e:
            # No verified backup, so the history must not get lines in the new format.
            fh.close()
            problem = "the log files could not be backed up before using data format v%d: %s" % (SCHEMA_VERSION, e)
            return
        _load(p)
        _fh, storage, path, problem = fh, kind, p, None
        _write("boot", ts=round(time.time(), 2), v=SCHEMA_VERSION)
        return


def start(pid, house, public, char, players):
    """A player entered a house. Returns the session to hand back to end()."""
    global _seq
    _seq += 1
    if not (isinstance(pid, str) and PID_RE.match(pid)):
        pid = ""
    r = {"sid": "%s-%d" % (_boot, _seq), "ts": time.time(), "u": pid, "house": house,
         "pub": 1 if public else 0, "char": char, "dur": None}
    r["segs"] = [(r["ts"], char)]      # (since when, character): grows when the player switches
    SESSIONS.append(r)
    ACTIVE[r["sid"]] = r
    _write("join", ts=round(r["ts"], 2), sid=r["sid"], u=pid, house=house, pub=r["pub"], char=char, n=players)
    return r


def switch(r, char):
    """The player became another character without leaving the house."""
    if not r or r["dur"] is not None or r["char"] == char:
        return
    t = time.time()
    r["char"] = char
    r["segs"].append((t, char))
    _write("char", ts=round(t, 2), sid=r["sid"], char=char)


def end(r, trp=0, slaps=0, players=0, at=None):
    """The player left. `at` backdates the end to when they were last heard
    from, for connections that went quiet and then timed out."""
    if not r or r["dur"] is not None:
        return
    t = time.time()
    if at is not None:
        t = min(t, max(at, r["ts"]))
    r["dur"] = max(0.0, t - r["ts"])
    ACTIVE.pop(r["sid"], None)
    _write("leave", ts=round(t, 2), sid=r["sid"], dur=round(r["dur"], 1), trp=trp, slaps=slaps, n=players)


def tick():
    """Heartbeat, so a crash loses at most the time since the last one."""
    if ACTIVE:
        _write("tick", ts=round(time.time(), 2))


def close_all():
    """Clean shutdown: everyone still playing gets a proper leave record."""
    for r in list(ACTIVE.values()):
        end(r)


# ------------------------------------------------------------------- reports
def _median(xs):
    xs = sorted(xs)
    n = len(xs)
    if not n:
        return 0.0
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def _mask(code, public):
    """Private house codes work as invite passwords, so reports only hint at them."""
    return code if public else code[:2] + "***"


def stats(since=None, recent=40):
    """Summary for the stats page. `since` is a unix time, or None for everything.

    A visit is one sitting by one player: sessions less than VISIT_GAP apart
    (a reconnect, a house change, a server restart) are the same visit. A
    returning player is one with a second visit, i.e. who came back after
    being away for longer than that.
    """
    now = time.time()
    visits, last = [], {}
    houses, cur = [], {}
    for r in SESSIONS:
        d = r["dur"] if r["dur"] is not None else max(0.0, now - r["ts"])
        end_ts = r["ts"] + d
        active = r["dur"] is None
        v = last.get(r["u"]) if r["u"] else None
        if v and r["ts"] - v["end"] <= VISIT_GAP:
            v["play"] += d
            v["end"] = max(v["end"], end_ts)
            v["active"] = v["active"] or active
            v["house"], v["pub"], v["char"] = r["house"], r["pub"], r["char"]
            v["houses"].add(r["house"])
        else:
            v = {"u": r["u"], "start": r["ts"], "end": end_ts, "play": d, "n": (v["n"] + 1) if v else 1,
                 "active": active, "house": r["house"], "pub": r["pub"], "char": r["char"], "houses": {r["house"]},
                 "chars": {}}
            visits.append(v)
            if r["u"]:
                last[r["u"]] = v
        segs = r["segs"]
        for i, (t0, ch) in enumerate(segs):     # play time per character, switches included
            t1 = segs[i + 1][0] if i + 1 < len(segs) else end_ts
            v["chars"][ch] = v["chars"].get(ch, 0.0) + max(0.0, min(t1, end_ts) - t0)
        # one "house" is a stretch during which a house code was never empty
        h = cur.get(r["house"])
        if h is None or r["ts"] > h["end"] + 5:
            h = cur[r["house"]] = {"code": r["house"], "pub": r["pub"], "start": r["ts"], "end": end_ts,
                                   "who": set(), "joins": 0, "play": 0.0, "ev": [], "active": False}
            houses.append(h)
        h["end"] = max(h["end"], end_ts)
        h["who"].add(r["u"] or r["sid"])
        h["joins"] += 1
        h["play"] += d
        h["active"] = h["active"] or active
        h["ev"] += ((r["ts"], 1), (end_ts, -1))

    for h in houses:
        n = peak = 0
        for _, step in sorted(h["ev"], key=lambda e: (e[0], e[1])):     # leaves before joins at the same instant
            n += step
            peak = max(peak, n)
        h["peak"] = peak

    win = [v for v in visits if since is None or v["start"] >= since]
    hwin = [h for h in houses if since is None or h["start"] >= since]
    known = {v["u"] for v in win if v["u"]}
    returning = {v["u"] for v in win if v["u"] and v["n"] >= 2}
    fresh = {v["u"] for v in win if v["u"] and v["n"] == 1}
    plays = [v["play"] for v in win]

    days = {}
    for v in win:
        day = time.strftime("%Y-%m-%d", time.gmtime(v["start"]))
        d = days.setdefault(day, {"t": day, "visits": 0, "play": 0.0, "who": set(), "back": set()})
        d["visits"] += 1
        d["play"] += v["play"]
        if v["u"]:
            d["who"].add(v["u"])
            if v["n"] >= 2:
                d["back"].add(v["u"])
    daily = [{"t": d["t"], "visits": d["visits"], "players": len(d["who"]), "returning": len(d["back"]),
              "avg_play": round(d["play"] / d["visits"], 1), "total_play": round(d["play"])}
             for d in sorted(days.values(), key=lambda d: d["t"], reverse=True)[:60]]

    # Most played characters: a character counts once per visit it was played in,
    # so reconnects do not inflate it; ties go to the one played for longer.
    chars = {}
    for v in win:
        for ch, play in v["chars"].items():
            c = chars.setdefault(ch, {"char": ch, "visits": 0, "play": 0.0, "who": set()})
            c["visits"] += 1
            c["play"] += play
            c["who"].add(v["u"] or v["start"])
    ranked = sorted(chars.values(), key=lambda c: (-c["visits"], -c["play"], c["char"]))

    return {
        "tracking": storage != "off",
        "storage": storage,
        "problem": problem if storage == "off" else None,
        "schema": SCHEMA_VERSION,
        "backup": {"name": backup["name"], "at": round(backup.get("created") or 0),
                   "files": len(backup.get("files", [])), "bytes": backup.get("bytes", 0)} if backup else None,
        "since": round(SESSIONS[0]["ts"]) if SESSIONS else None,
        "visit_gap_min": VISIT_GAP // 60,
        "visits": len(win),
        "players": len(known),
        "untracked_visits": sum(1 for v in win if not v["u"]),
        "new_players": len(fresh),
        "returning_players": len(returning),
        "returning_pct": round(100 * len(returning) / len(known)) if known else 0,
        "avg_play": round(sum(plays) / len(plays), 1) if plays else 0,
        "median_play": round(_median(plays), 1),
        "total_play": round(sum(plays)),
        "playing_now": len(ACTIVE),
        "houses": len(hwin),
        "shared_houses": sum(1 for h in hwin if h["peak"] >= 2),
        "max_together": max((h["peak"] for h in hwin), default=0),
        "top_char": ranked[0]["char"] if ranked else None,
        "characters": [{"char": c["char"], "visits": c["visits"], "players": len(c["who"]), "play": round(c["play"])}
                       for c in ranked],
        "daily": daily,
        "recent": [{"t": round(v["start"]), "house": _mask(v["house"], v["pub"]), "pub": v["pub"], "char": v["char"],
                    "play": round(v["play"]), "n": v["n"], "active": v["active"], "who": v["u"][:4] if v["u"] else "",
                    "houses": len(v["houses"])}
                   for v in reversed(win[-recent:])],
        "house_list": [{"t": round(h["start"]), "code": _mask(h["code"], h["pub"]), "pub": h["pub"], "players": len(h["who"]),
                        "peak": h["peak"], "joins": h["joins"], "play": round(h["play"]),
                        "open": round(h["end"] - h["start"]), "active": h["active"]}
                       for h in reversed(hwin[-recent:])],
    }
