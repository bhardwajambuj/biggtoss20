#!/usr/bin/env python3
"""Bigg Toss server: static files + WebSocket game rooms + bot housemates.

Zero dependencies: runs on the Python 3 standard library.

    python3 server.py            # http://localhost:8020
    PORT=9000 python3 server.py
"""

import asyncio
import base64
import gzip
import hashlib
import json
import math
import os
import random
import re
import struct
import time
from urllib.parse import urlsplit, unquote

import world

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
PORT = int(os.environ.get("PORT", "8020"))
HOST = os.environ.get("HOST", "0.0.0.0")

with open(os.path.join(ROOT, "data", "cast.json"), encoding="utf-8") as _f:
    _DATA = json.load(_f)
CAST = _DATA["cast"]
CAST_IDS = [c["id"] for c in CAST]
N = len(CAST_IDS)
# The host is not a contestant: nobody can play him, he has no health, lives
# or TRP, and he is sent to clients next to (not inside) the contestant arrays.
HOST_CHAR = _DATA["host"]
HOST_I = N
HOST_LINES = len(HOST_CHAR["quips"])
HOST_BLOCKS = len(HOST_CHAR["block"])

WORLD_JSON = json.dumps(world.as_json(), separators=(",", ":")).encode()

TICK = 1 / 12
MAXHP = 5
SLAP_RANGE = 76
SLAP_CD = 0.42
SWITCH_CD = 4.0
HOP_T = 0.42          # seconds a bot takes to hop on/off furniture
BOT_SPEED = 118
CHASE_SPEED = 158
HOST_SPEED = 92       # the host strolls, he does not hurry
MAX_CLIENTS = 3000
MAX_HOUSES = 400
CODE_RE = re.compile(r"^[A-Z0-9]{3,8}$")
NICK_RE = re.compile(r"[^A-Za-z0-9 _\-]")
ROOM_WEIGHTS = [("garden", 30), ("living", 26), ("kitchen", 12), ("bed", 12),
                ("bath", 8), ("conf", 3), ("r20", 4), ("r2x", 5)]

MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
}

# Caddy access logs (JSON lines). Override for local/dev.
ACCESS_LOG = os.environ.get("ACCESS_LOG", "/var/log/caddy/access.log")
_STATS_SKIP = {"/stats", "/api/stats", "/healthz", "/favicon.ico"}
_stats_cache = {}  # window -> (expires_at, payload)


def now():
    return time.monotonic()


def _wall():
    return time.time()


def _parse_stats_window(raw):
    """Return earliest unix ts to include, or None for all history."""
    if not raw or raw in ("all", "forever", "history"):
        return None
    units = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}
    if len(raw) < 2 or raw[-1] not in units:
        return _wall() - 86400
    try:
        return _wall() - float(raw[:-1]) * units[raw[-1]]
    except ValueError:
        return _wall() - 86400


def _access_log_paths():
    import glob
    base = ACCESS_LOG
    paths = sorted(glob.glob(base + "*"))
    return [p for p in paths if os.path.isfile(p)]


def _open_access_log(path):
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "rt", encoding="utf-8", errors="replace")


def live_snapshot():
    """Who is playing right now (no IPs)."""
    houses = []
    for h in HOUSES.values():
        players = []
        for e in h.ents:
            if not e.client:
                continue
            players.append({
                "char": CAST[e.i]["short"] if e.i < len(CAST) else str(e.i),
                "nick": e.nick or "",
                "trp": e.trp,
            })
        if players:
            houses.append({
                "code": h.code,
                "public": bool(h.public),
                "players": players,
                "count": len(players),
            })
    houses.sort(key=lambda x: (-x["count"], x["code"]))
    return {
        "online": sum(1 for c in CLIENTS if c.ent),
        "connections": len(CLIENTS),
        "houses": len(HOUSES),
        "active_houses": houses,
        "as_of": int(_wall()),
    }


def collect_stats(window="all"):
    """Aggregate Caddy access logs. Public payload never includes raw IPs."""
    since = _parse_stats_window(window)
    cache_key = window or "all"
    hit = _stats_cache.get(cache_key)
    if hit and hit[0] > _wall():
        payload = dict(hit[1])
        payload["live"] = live_snapshot()
        return payload

    pages = 0
    games = 0
    other = 0
    page_ips = set()
    game_ips = set()
    all_ips = set()
    by_hour = {}
    by_hour_active = {}  # page load or game join only
    by_day = {}
    first_ts = last_ts = None
    events = 0
    paths = _access_log_paths()

    for path in paths:
        try:
            fh = _open_access_log(path)
        except OSError:
            continue
        with fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                ts = e.get("ts")
                if not isinstance(ts, (int, float)):
                    continue
                if since is not None and ts < since:
                    continue
                req = e.get("request") or {}
                uri = (req.get("uri") or "/").split("?")[0]
                if uri in _STATS_SKIP or uri.startswith("/apple-touch"):
                    continue
                status = int(e.get("status") or 0)
                ip = (req.get("client_ip") or req.get("remote_ip") or "").split("%")[0]
                # strip IPv6-mapped prefix if present
                if ip.startswith("::ffff:"):
                    ip = ip[7:]
                events += 1
                first_ts = ts if first_ts is None else min(first_ts, ts)
                last_ts = ts if last_ts is None else max(last_ts, ts)
                hour = time.strftime("%Y-%m-%d %H:00", time.gmtime(ts))
                day = time.strftime("%Y-%m-%d", time.gmtime(ts))
                if ip:
                    all_ips.add(ip)
                    by_hour.setdefault(hour, set()).add(ip)
                    by_day.setdefault(day, set()).add(ip)
                is_page = uri in ("/", "") and status < 400
                is_game = uri.startswith("/ws") and status in (101, 200)
                if is_page:
                    pages += 1
                    if ip:
                        page_ips.add(ip)
                        by_hour_active.setdefault(hour, set()).add(ip)
                elif is_game:
                    games += 1
                    if ip:
                        game_ips.add(ip)
                        by_hour_active.setdefault(hour, set()).add(ip)
                else:
                    other += 1

    def _fill_hours(active_map, start_ts, end_ts):
        """Continuous hourly series with zeros for quiet hours."""
        if start_ts is None or end_ts is None:
            return []
        # Align to hour boundaries (UTC)
        t0 = int(start_ts) - (int(start_ts) % 3600)
        t1 = int(end_ts) - (int(end_ts) % 3600)
        if since is not None:
            t0 = max(t0, int(since) - (int(since) % 3600))
        out = []
        t = t0
        # Cap length so the chart stays readable
        max_buckets = 72 if since is None else 24 * 31
        while t <= t1 and len(out) < max_buckets:
            label = time.strftime("%Y-%m-%d %H:00", time.gmtime(t))
            out.append({"t": label, "users": len(active_map.get(label, ())), "distinct": len(active_map.get(label, ()))})
            t += 3600
        return out

    end_bound = last_ts if last_ts is not None else _wall()
    start_bound = first_ts if first_ts is not None else end_bound
    if since is not None:
        start_bound = since
    hourly_active = _fill_hours(by_hour_active, start_bound, end_bound)
    hour_series = [{"t": k, "distinct": len(by_hour[k])} for k in sorted(by_hour)]
    day_series = [{"t": k, "distinct": len(by_day[k])} for k in sorted(by_day)]
    if since is None and len(hour_series) > 72:
        hour_series = hour_series[-72:]
    if since is None and len(hourly_active) > 72:
        hourly_active = hourly_active[-72:]

    payload = {
        "window": cache_key,
        "events": events,
        "from": int(first_ts) if first_ts else None,
        "to": int(last_ts) if last_ts else None,
        "generated_at": int(_wall()),
        "pages": pages,
        "distinct_visitors": len(page_ips),
        "game_sessions": games,
        "distinct_players": len(game_ips),
        "distinct_ips": len(all_ips),
        "other_requests": other,
        "hourly_active": hourly_active,
        "by_hour": hour_series,
        "by_day": day_series,
        "log_files": len(paths),
        "logging_since_note": "Access logging started 2026-11-27; earlier traffic was not recorded.",
    }
    _stats_cache[cache_key] = (_wall() + 8, payload)
    out = dict(payload)
    out["live"] = live_snapshot()
    return out


# ------------------------------------------------------------------ entities
class Ent:
    def __init__(self, i):
        self.i = i
        self.x, self.y = world.random_point(_weighted_room())
        self.f = random.choice((1, -1))
        self.client = None
        self.nick = ""
        self.hp = MAXHP
        self.lives = 2
        self.trp = 0
        self.slaps = 0
        self.seat = -1
        self.seat_t = 0.0
        self.stun = 0.0
        self.air = 0.0
        self.next_slap = 0.0
        self.regen_at = 0.0
        self.ko_until = 0.0
        self.ko_kind = 0
        self.ko_dest = None
        self.acc = 0.0
        # bot brain
        t = now()
        self.path = []
        self.wait = t + random.uniform(0, 4)
        self.want_seat = -1
        self.target = -1
        self.rev_until = 0.0
        self.rev_hits = 0
        self.repath = 0.0
        self.next_say = t + random.uniform(4, 22)
        self.next_drama = t + random.uniform(10, 40)
        self.perch = None        # (floor x, floor y, top x, top y) while standing on furniture
        self.want_perch = None
        self.hop = None          # (x0, y0, x1, y1, t0, getting_on)
        self.next_bop = 0.0
        # host only
        self.host = i == HOST_I
        self.talk_until = 0.0
        self.next_block = 0.0
        self.deck = []
        if self.host:
            for _ in range(20):
                if not world.in_water(self.x, self.y):
                    break
                self.x, self.y = world.random_point(_weighted_room())
            self.next_say = t + random.uniform(3, 6)

    def grounded(self):
        """Forget any furniture-hopping state (KO, takeover, teleport)."""
        self.perch = self.want_perch = self.hop = None


def _weighted_room():
    total = sum(w for _, w in ROOM_WEIGHTS)
    r = random.uniform(0, total)
    for rid, w in ROOM_WEIGHTS:
        r -= w
        if r <= 0:
            return rid
    return "garden"


class House:
    def __init__(self, code, public):
        self.code = code
        self.public = public
        self.ents = [Ent(i) for i in range(N)]     # contestants only
        self.host = Ent(HOST_I)
        self.clients = set()
        self.seats = {}
        self.dirty = True

    # -- messaging
    def cast(self, obj):
        text = json.dumps(obj, separators=(",", ":"))
        for c in list(self.clients):
            c.send(text)

    def roster(self):
        return {"t": "r", "e": [
            [1 if e.client else 0, e.nick, e.hp, e.lives, e.trp, e.seat, e.slaps]
            for e in self.ents]}

    def snapshot(self):
        p = []
        for e in self.ents:
            p += (round(e.x), round(e.y), e.f)
        return {"t": "s", "p": p, "h": self.host_pos()}

    def host_pos(self):
        h = self.host
        return [round(h.x), round(h.y), h.f]

    def humans(self):
        return sum(1 for e in self.ents if e.client)

    # -- seats
    def sit(self, e, si, t):
        if si in self.seats or e.seat >= 0:
            return False
        s = world.SEATS[si]
        self.seats[si] = e.i
        e.seat = si
        e.seat_t = t
        e.x, e.y = s["x"], s["y"]
        if s["f"]:
            e.f = s["f"]
        e.path = []
        self.dirty = True
        if s["k"] == "throne":
            self.cast({"t": "bb", "k": "captain", "i": e.i})
        return True

    def unseat(self, e):
        if e.seat < 0:
            return
        s = world.SEATS[e.seat]
        self.seats.pop(e.seat, None)
        e.seat = -1
        e.x, e.y = s["ex"], s["ey"]
        self.dirty = True

    # -- slapping
    def slap(self, a, t, reach=SLAP_RANGE):
        if t < a.next_slap or t < a.stun or a.ko_until or a.seat >= 0:
            return
        a.next_slap = t + SLAP_CD
        best, bd = None, reach
        for e in self.ents:
            if e is a or e.ko_until or t < e.air:
                continue
            d = math.hypot(e.x - a.x, (e.y - a.y) * 1.5)
            if d < bd:
                best, bd = e, d
        if best is None:
            miss = {"t": "slap", "a": a.i, "v": -1}
            hs = self.host
            if math.hypot(hs.x - a.x, (hs.y - a.y) * 1.5) < reach:
                # The host is never a victim: the swing is waved away and he
                # has something to say about it.
                miss["h"] = 1
                self.host_block(a, t)
            self.cast(miss)
            return
        v = best
        self.unseat(v)
        dx, dy = v.x - a.x, v.y - a.y
        d = math.hypot(dx, dy) or 1.0
        nx, ny = dx / d, dy / d
        if abs(dx) > 2:
            a.f = 1 if dx > 0 else -1
        v.hp -= 1
        v.stun = t + 0.8
        v.regen_at = t + 6
        a.trp += 10
        a.slaps += 1
        ko = 0
        if v.hp <= 0:
            v.lives -= 1
            if v.lives > 0:
                ko = 1
                v.ko_dest = (world.SPAWN_2X[0] + random.uniform(-70, 70), world.SPAWN_2X[1])
            else:
                ko = 2
                a.trp += 50
                v.ko_dest = (world.SPAWN_GATE[0] + random.uniform(-90, 90), world.SPAWN_GATE[1])
            v.ko_kind = ko
            v.ko_until = t + 1.2
            v.path = []
            v.target = -1
            v.grounded()
        elif not v.client:
            self.shove(v, nx, ny, 46)
            v.path = []
            v.want_seat = -1
            v.want_perch = None
            v.wait = t + 0.9
            if random.random() < 0.65:
                v.target = a.i
                v.rev_until = t + 4.5
                v.rev_hits = random.choice((1, 1, 2))
                v.repath = 0
        self.cast({"t": "slap", "a": a.i, "v": v.i, "nx": round(nx, 2), "ny": round(ny, 2), "ko": ko})
        self.dirty = True

    def shove(self, e, nx, ny, dist):
        """Knock e back up to dist px, sliding along walls and furniture
        instead of popping through them."""
        if world.blocked(e.x, e.y):
            return
        moved = 0.0
        while moved < dist:
            st = min(4.0, dist - moved)
            x, y = e.x + nx * st, e.y + ny * st
            if world.blocked(x, y):
                if not world.blocked(x, e.y):
                    y = e.y
                elif not world.blocked(e.x, y):
                    x = e.x
                else:
                    break
            e.x, e.y = x, y
            moved += st

    # -- simulation
    def tick(self, t, dt):
        for e in self.ents:
            if e.ko_until:
                if t >= e.ko_until:
                    self.resolve_ko(e, t)
                continue
            if e.hp < MAXHP and t >= e.regen_at:
                e.hp += 1
                e.regen_at = t + 4
                self.dirty = True
            if e.seat >= 0:
                self.seat_effects(e, t, dt)
            if not e.client:
                self.bot(e, t, dt)
        self.host_bot(self.host, t, dt)
        self.cast(self.snapshot())
        if self.dirty:
            self.dirty = False
            self.cast(self.roster())

    def resolve_ko(self, e, t):
        e.ko_until = 0.0
        e.hp = MAXHP
        if e.ko_kind == 2:
            e.lives = 2
            e.trp //= 2
        x, y = e.ko_dest
        if world.blocked(x, y):
            x, y = world.SPAWN_GATE if e.ko_kind == 2 else world.SPAWN_2X
        e.x, e.y = x, y
        e.stun = t + 0.4
        e.wait = t + random.uniform(1, 3)
        e.path = []
        e.grounded()
        if e.client:
            e.client.send_obj({"t": "tp", "x": round(x), "y": round(y)})
        self.dirty = True

    def seat_effects(self, e, t, dt):
        k = world.SEATS[e.seat]["k"]
        if k == "bed":
            if t - e.seat_t > 7:
                self.cast({"t": "bb", "k": "rooster", "i": e.i})
                self.unseat(e)
                e.trp = max(0, e.trp - 5)
                e.wait = t + 1
        elif k == "pod":
            if t - e.seat_t > 6:
                e.seat_t = t
                if e.lives < 2:
                    e.lives = 2
                    self.dirty = True
                    self.cast({"t": "bb", "k": "regain", "i": e.i})
        elif k == "throne":
            e.acc += dt
            if e.acc >= 1:
                e.acc -= 1
                e.trp += 3
                self.dirty = True

    def hop(self, e, t, on):
        gx, gy, tx, ty = e.perch
        x1, y1 = (tx, ty) if on else (gx, gy)
        e.hop = (e.x, e.y, x1, y1, t, on)
        if abs(x1 - e.x) > 2:
            e.f = 1 if x1 > e.x else -1
        e.air = t + 0.45
        self.cast({"t": "jump", "i": e.i})

    def bot(self, e, t, dt):
        if e.hop:
            x0, y0, x1, y1, t0, on = e.hop
            k = min(1.0, (t - t0) / HOP_T)
            e.x, e.y = x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
            if k >= 1:
                e.hop = None
                if on:
                    e.wait = t + random.uniform(3, 8)
                    e.next_bop = t + random.uniform(0.7, 2)
                else:
                    e.perch = None
                    e.wait = t + random.uniform(0.2, 1.2)
            return
        if t < e.stun:
            return
        if t >= e.next_say and e.seat < 0:
            e.next_say = t + random.uniform(10, 28)
            self.cast({"t": "say", "i": e.i, "q": random.randrange(1000)})
        if e.perch:
            # showing off on the furniture; hop down when bored or provoked
            if e.target >= 0 or t >= e.wait:
                self.hop(e, t, False)
            elif t >= e.next_bop:
                e.next_bop = t + random.uniform(0.9, 2.4)
                e.f = -e.f
                e.air = t + 0.45
                self.cast({"t": "jump", "i": e.i})
            return
        # revenge mode
        if e.target >= 0:
            e.want_perch = None
            v = self.ents[e.target]
            if t > e.rev_until or v.ko_until or e.rev_hits <= 0:
                e.target = -1
                e.path = []
                e.wait = t + random.uniform(0.3, 1.5)
            else:
                d = math.hypot(v.x - e.x, (v.y - e.y) * 1.5)
                if d < 56:
                    e.path = []
                    if abs(v.x - e.x) > 2:
                        e.f = 1 if v.x > e.x else -1
                    if t >= e.next_slap + 0.35:
                        self.slap(e, t)
                        e.rev_hits -= 1
                else:
                    if t >= e.repath:
                        e.repath = t + 0.5
                        e.path = world.find_path(e.x, e.y, v.x, v.y)
                    self.follow(e, dt, CHASE_SPEED)
                    if not e.path and d < 115 and t >= e.next_slap + 0.35 and world.blocked(v.x, v.y):
                        # as close as the floor allows and the target is up on
                        # furniture: leap and swing, so tables are not a safe zone
                        if abs(v.x - e.x) > 2:
                            e.f = 1 if v.x > e.x else -1
                        e.air = t + 0.45
                        self.cast({"t": "jump", "i": e.i})
                        self.slap(e, t, reach=120)
                        e.rev_hits -= 1
                return
        if e.seat >= 0:
            if t >= e.wait:
                self.unseat(e)
                e.wait = t + random.uniform(0.3, 1.2)
            return
        # random drama: slap whoever is standing too close
        if t >= e.next_drama:
            e.next_drama = t + 1.5
            for o in self.ents:
                if o is not e and not o.ko_until and math.hypot(o.x - e.x, (o.y - e.y) * 1.5) < 54:
                    self.slap(e, t)
                    e.next_drama = t + random.uniform(18, 50)
                    break
        if e.path:
            self.follow(e, dt, BOT_SPEED)
            if not e.path:
                if e.want_perch:
                    pc, e.want_perch = e.want_perch, None
                    if math.hypot(e.x - pc[0], e.y - pc[1]) < 6:
                        e.perch = pc
                        self.hop(e, t, True)
                        return
                if e.want_seat >= 0:
                    si, e.want_seat = e.want_seat, -1
                    if self.sit(e, si, t):
                        k = world.SEATS[si]["k"]
                        e.wait = t + (random.uniform(3, 9.5) if k == "bed" else random.uniform(4, 13))
                        return
                e.wait = t + random.uniform(0.4, 3.5)
            return
        if t < e.wait:
            return
        r = random.random()
        if r < 0.25:
            free = [i for i in range(len(world.SEATS)) if i not in self.seats]
            si = random.choice(free)
            s = world.SEATS[si]
            e.path = world.find_path(e.x, e.y, s["ex"], s["ey"])
            e.want_seat = si if e.path else -1
        elif r < 0.36:
            # go and stand on a bed, sofa or table
            pc = random.choice(world.PERCHES)
            if not any(o.perch == pc or o.want_perch == pc for o in self.ents):
                e.path = world.find_path(e.x, e.y, pc[0], pc[1])
                e.want_perch = pc if e.path else None
        elif r < 0.9:
            gx, gy = world.random_point(_weighted_room())
            e.path = world.find_path(e.x, e.y, gx, gy)
        else:
            e.wait = t + random.uniform(1, 4)
            if random.random() < 0.5:
                e.air = t + 0.45
                self.cast({"t": "jump", "i": e.i})
        if not e.path and t >= e.wait:
            e.wait = t + 1

    # -- the host
    def host_block(self, a, t):
        """Someone swung at the host: he turns to them and answers back."""
        hs = self.host
        if abs(a.x - hs.x) > 2:
            hs.f = 1 if a.x > hs.x else -1
        hs.talk_until = max(hs.talk_until, t + 1.6)
        if t >= hs.next_block:
            hs.next_block = t + 2.5
            hs.next_say = max(hs.next_say, t + 6)
            self.cast({"t": "say", "i": HOST_I, "q": 500 + random.randrange(HOST_BLOCKS)})

    def host_bot(self, e, t, dt):
        """Stroll around the house delivering dialogues. He never sits, climbs,
        slaps or gets slapped, so none of the contestant brain applies."""
        if t >= e.next_say:
            e.next_say = t + random.uniform(8, 15)
            if not e.deck:
                e.deck = random.sample(range(HOST_LINES), HOST_LINES)
            e.talk_until = t + 2.6
            # stop and say it to whoever is closest
            near = min(self.ents, key=lambda o: (o.x - e.x) ** 2 + (o.y - e.y) ** 2)
            if not near.ko_until and abs(near.x - e.x) > 2 and math.hypot(near.x - e.x, near.y - e.y) < 320:
                e.f = 1 if near.x > e.x else -1
            self.cast({"t": "say", "i": HOST_I, "q": e.deck.pop()})
        if t < e.talk_until:
            return
        if e.path:
            o = self.ents[e.target] if e.target >= 0 else None
            if o and (o.ko_until or math.hypot(o.x - e.x, o.y - e.y) < 88):
                e.path = []         # close enough to the player he came to see
            else:
                self.follow(e, dt, HOST_SPEED)
            if not e.path:
                e.target = -1
                e.wait = t + random.uniform(1.5, 5)
            return
        if t < e.wait:
            return
        path = []
        e.target = -1
        humans = [o for o in self.ents if o.client and not o.ko_until]
        if humans and random.random() < 0.5:
            o = random.choice(humans)       # drop in on a player
            path = world.find_path(e.x, e.y, o.x, o.y)
            if path:
                e.target = o.i
        if not path:
            gx, gy = world.random_point(_weighted_room())
            path = world.find_path(e.x, e.y, gx, gy)
        if self.wet(e.x, e.y, path):
            path = []                       # not in this blazer
            e.target = -1
        e.path = path
        if not path:
            e.wait = t + 0.5

    @staticmethod
    def wet(x, y, path):
        """Would walking this path from (x, y) take you through the pool?"""
        for px, py in path:
            n = max(1, int(math.hypot(px - x, py - y) / 12))
            for i in range(1, n + 1):
                if world.in_water(x + (px - x) * i / n, y + (py - y) * i / n):
                    return True
            x, y = px, py
        return False

    def follow(self, e, dt, speed):
        step = speed * dt
        if world.in_water(e.x, e.y):
            step *= 0.6
        while step > 0 and e.path:
            tx, ty = e.path[0]
            dx, dy = tx - e.x, ty - e.y
            d = math.hypot(dx, dy)
            if abs(dx) > 1.5:
                e.f = 1 if dx > 0 else -1
            if d <= step:
                nx, ny = tx, ty
            else:
                nx, ny = e.x + dx / d * step, e.y + dy / d * step
            # Last line of defence: never step into a wall, whatever the path says.
            if world.blocked_hard(nx, ny) or (world.blocked(nx, ny) and not world.blocked(e.x, e.y)):
                e.path = []
                return
            e.x, e.y = nx, ny
            if d <= step:
                e.path.pop(0)
                step -= d
            else:
                step = 0


HOUSES = {}
CLIENTS = set()


def new_code():
    while True:
        code = "".join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5))
        if code not in HOUSES:
            return code


def best_public(char_idx=None):
    best = None
    for h in HOUSES.values():
        if not h.public:
            continue
        if char_idx is not None and h.ents[char_idx].client:
            continue
        if best is None or h.humans() > best.humans():
            best = h
    return best


# ------------------------------------------------------------------- clients
class Client:
    def __init__(self, reader, writer):
        self.r = reader
        self.w = writer
        self.alive = True
        self.house = None
        self.ent = None
        self.last_say = 0.0
        self.last_switch = 0.0
        self.msgs = 0
        self.msg_t = 0.0

    def send(self, text):
        if not self.alive:
            return
        data = text.encode()
        n = len(data)
        if n < 126:
            hdr = bytes((0x81, n))
        elif n < 65536:
            hdr = bytes((0x81, 126)) + struct.pack(">H", n)
        else:
            hdr = bytes((0x81, 127)) + struct.pack(">Q", n)
        try:
            if self.w.transport.get_write_buffer_size() > 1 << 18:
                self.kill()
                return
            self.w.write(hdr + data)
        except Exception:
            self.alive = False

    def send_obj(self, obj):
        self.send(json.dumps(obj, separators=(",", ":")))

    def kill(self):
        self.alive = False
        try:
            self.w.close()
        except Exception:
            pass

    def leave(self):
        h, e = self.house, self.ent
        self.house = self.ent = None
        if not h:
            return
        h.clients.discard(self)
        if e and e.client is self:
            e.client = None
            e.nick = ""
            e.path = []
            e.target = -1
            e.grounded()
            e.wait = now() + random.uniform(1, 3)
            h.dirty = True
        if not h.clients:
            HOUSES.pop(h.code, None)

    # -- protocol
    def on_message(self, m):
        t = m.get("t")
        if t == "p":
            e = self.ent
            if not e or e.seat >= 0 or e.ko_until:
                return
            x, y, f = m.get("x"), m.get("y"), m.get("f")
            if not (isinstance(x, (int, float)) and isinstance(y, (int, float))):
                return
            if not (math.isfinite(x) and math.isfinite(y)) or not world.in_walk(x, y):
                return
            e.x = min(world.W, max(0, x))
            e.y = min(world.H, max(0, y))
            e.f = -1 if f == -1 else 1
        elif t == "slap":
            if self.ent:
                self.house.slap(self.ent, now())
        elif t == "jump":
            e = self.ent
            tn = now()
            if e and e.seat < 0 and not e.ko_until and tn >= e.air + 0.15:
                e.air = tn + 0.45
                self.house.cast({"t": "jump", "i": e.i})
        elif t == "sit":
            e, si = self.ent, m.get("s")
            if not e or e.ko_until or now() < e.stun:
                return
            if not isinstance(si, int) or not 0 <= si < len(world.SEATS):
                return
            s = world.SEATS[si]
            tx, ty, tw, th = s["t"]
            dx = max(tx - e.x, 0, e.x - (tx + tw))
            dy = max(ty - e.y, 0, e.y - (ty + th))
            if math.hypot(dx, dy) > 90:
                return
            self.house.sit(e, si, now())
        elif t == "stand":
            if self.ent:
                self.house.unseat(self.ent)
        elif t == "say":
            e, q = self.ent, m.get("q")
            tn = now()
            if e and isinstance(q, int) and 0 <= q < 1000 and tn - self.last_say > 1.2:
                self.last_say = tn
                self.house.cast({"t": "say", "i": e.i, "q": q})
        elif t == "peek":
            self.peek(m.get("house"))
        elif t == "join":
            self.join(m)
        elif t == "switch":
            self.switch(m)

    def peek(self, code):
        h = HOUSES.get(code) if isinstance(code, str) else None
        if h is None and not (isinstance(code, str) and CODE_RE.match(code)):
            h = best_public()
        taken = {}
        if h:
            taken = {str(e.i): e.nick for e in h.ents if e.client}
        self.send_obj({"t": "lobby", "taken": taken,
                       "online": sum(1 for c in CLIENTS if c.ent)})

    def join(self, m):
        if self.ent:
            return
        cid = m.get("c")
        if cid not in CAST_IDS:
            return
        idx = CAST_IDS.index(cid)
        code = m.get("house")
        nick = NICK_RE.sub("", str(m.get("nick") or ""))[:14].strip()
        h = None
        if isinstance(code, str) and CODE_RE.match(code):
            h = HOUSES.get(code)
            if h is None:
                if len(HOUSES) >= MAX_HOUSES:
                    self.send_obj({"t": "full"})
                    return
                h = HOUSES[code] = House(code, public=False)
            elif h.ents[idx].client:
                self.send_obj({"t": "taken", "taken": {str(e.i): e.nick for e in h.ents if e.client}})
                return
        else:
            h = best_public(idx)
            if h is None:
                if len(HOUSES) >= MAX_HOUSES:
                    self.send_obj({"t": "full"})
                    return
                code = new_code()
                h = HOUSES[code] = House(code, public=True)
        e = h.ents[idx]
        e.client = self
        e.nick = nick
        e.path = []
        e.target = -1
        e.want_seat = -1
        e.grounded()
        h.unseat(e)
        self.house, self.ent = h, e
        h.clients.add(self)
        h.dirty = True
        self.welcome()
        h.cast({"t": "bb", "k": "join", "i": idx})

    def welcome(self):
        h, e = self.house, self.ent
        self.send_obj({"t": "welcome", "you": e.i, "house": h.code, "x": round(e.x), "y": round(e.y),
                       "r": h.roster()["e"], "p": h.snapshot()["p"], "h": h.host_pos()})

    def switch(self, m):
        """Become another housemate without leaving the house.

        The two characters trade places and scores, so the player stays where
        they are and keeps their health, lives and TRP; switching is a costume
        change, not a way to dodge a beating. The old body goes back to the bots.
        """
        h, a = self.house, self.ent
        cid = m.get("c")
        if not a or cid not in CAST_IDS:
            return
        b = h.ents[CAST_IDS.index(cid)]
        if b is a:
            return
        tn = now()
        why = None
        if b.client:
            why = "taken"
        elif a.ko_until or b.ko_until:
            why = "ko"
        elif tn - self.last_switch < SWITCH_CD:
            why = "wait"
        if why:
            self.send_obj({"t": "noswitch", "why": why})
            return
        self.last_switch = tn
        h.unseat(a)
        h.unseat(b)
        for k in ("x", "y", "f", "hp", "lives", "trp", "slaps", "stun", "air", "next_slap", "regen_at", "acc"):
            va, vb = getattr(a, k), getattr(b, k)
            setattr(a, k, vb)
            setattr(b, k, va)
        b.client, b.nick = self, a.nick
        a.client, a.nick = None, ""
        for e in h.ents:
            # grudges follow the player, not the costume
            if e.target == a.i:
                e.target = b.i
            elif e.target == b.i:
                e.target = a.i
        for e in (a, b):
            e.path = []
            e.target = -1
            e.want_seat = -1
            e.rev_until = 0.0
            e.grounded()
        a.wait = tn + random.uniform(1, 3)
        self.ent = b
        h.dirty = True
        self.welcome()
        h.cast({"t": "bb", "k": "switch", "i": b.i, "o": a.i, "n": b.nick})


async def read_frame(reader):
    h = await reader.readexactly(2)
    op = h[0] & 0x0F
    n = h[1] & 0x7F
    if n == 126:
        n = struct.unpack(">H", await reader.readexactly(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", await reader.readexactly(8))[0]
    if n > 4096:
        raise ValueError("frame too large")
    mask = await reader.readexactly(4) if h[1] & 0x80 else None
    data = await reader.readexactly(n)
    if mask:
        data = bytes(b ^ mask[i & 3] for i, b in enumerate(data))
    return op, data


async def ws_session(reader, writer, headers):
    key = headers.get("sec-websocket-key")
    if not key or len(CLIENTS) >= MAX_CLIENTS:
        writer.write(b"HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
        return
    accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
    writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  "Sec-WebSocket-Accept: %s\r\n\r\n" % accept).encode())
    c = Client(reader, writer)
    CLIENTS.add(c)
    try:
        while c.alive:
            op, data = await asyncio.wait_for(read_frame(reader), 75)
            if op == 8:
                break
            if op == 9:
                writer.write(bytes((0x8A, len(data))) + data)
                continue
            if op != 1:
                continue
            t = now()
            if t - c.msg_t > 1:
                c.msg_t, c.msgs = t, 0
            c.msgs += 1
            if c.msgs > 60:
                continue
            try:
                m = json.loads(data.decode("utf-8"))
            except ValueError:
                continue
            if isinstance(m, dict):
                c.on_message(m)
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, ValueError, OSError):
        pass
    finally:
        c.alive = False
        CLIENTS.discard(c)
        c.leave()


# -------------------------------------------------------------------- static
_gz_cache = {}


def _respond(writer, status, body=b"", ctype="text/plain; charset=utf-8", extra="", head=False):
    hdr = ("HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nCache-Control: no-cache\r\n"
           "X-Content-Type-Options: nosniff\r\nConnection: close\r\n%s\r\n" % (status, ctype, len(body), extra))
    writer.write(hdr.encode() + (b"" if head else body))


def serve_static(writer, method, path, headers):
    head = method == "HEAD"
    if method not in ("GET", "HEAD"):
        return _respond(writer, "405 Method Not Allowed")
    if path == "/healthz":
        return _respond(writer, "200 OK", b"ok", head=head)
    if path == "/api/stats":
        window = "all"
        for part in (headers.get("x-bt-query") or "").split("&"):
            if part.startswith("window="):
                window = unquote(part.split("=", 1)[1])[:8] or "all"
                break
        body = json.dumps(collect_stats(window), separators=(",", ":")).encode()
        return _respond(writer, "200 OK", body, MIME[".json"],
                        "Cache-Control: no-store\r\n", head)
    if path in ("/stats", "/stats/"):
        path = "/stats.html"
    if path == "/favicon.ico":
        path = "/favicon.svg"
    gz_ok = "gzip" in headers.get("accept-encoding", "")
    if path == "/data/world.json":
        body, ctype, key = WORLD_JSON, MIME[".json"], ("world", 0)
    else:
        rel = unquote(path).lstrip("/") or "index.html"
        full = os.path.realpath(os.path.join(ROOT, rel))
        if not (full == ROOT or full.startswith(ROOT + os.sep)) or not os.path.isfile(full):
            return _respond(writer, "404 Not Found", b"Not found", head=head)
        ctype = MIME.get(os.path.splitext(full)[1].lower(), "application/octet-stream")
        with open(full, "rb") as f:
            body = f.read()
        key = (full, os.path.getmtime(full))
    extra = ""
    if gz_ok and (ctype.startswith("text/") or "json" in ctype or "svg" in ctype) and len(body) > 600:
        if key not in _gz_cache:
            _gz_cache[key] = gzip.compress(body, 6)
        body = _gz_cache[key]
        extra = "Content-Encoding: gzip\r\nVary: Accept-Encoding\r\n"
    _respond(writer, "200 OK", body, ctype, extra, head)


async def handle(reader, writer):
    try:
        line = await asyncio.wait_for(reader.readline(), 15)
        parts = line.decode("latin1").split()
        if len(parts) < 2:
            return
        method, target = parts[0], parts[1]
        headers = {}
        for _ in range(80):
            l = await asyncio.wait_for(reader.readline(), 15)
            if l in (b"\r\n", b"\n", b""):
                break
            k, _, v = l.decode("latin1").partition(":")
            headers[k.strip().lower()] = v.strip()
        split = urlsplit(target)
        path = split.path
        headers["x-bt-query"] = split.query or ""
        if path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            await ws_session(reader, writer, headers)
        else:
            serve_static(writer, method, path, headers)
            await writer.drain()
    except (asyncio.TimeoutError, ConnectionError, OSError, ValueError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def game_loop():
    last = now()
    while True:
        await asyncio.sleep(TICK)
        t = now()
        dt = min(0.25, t - last)
        last = t
        for h in list(HOUSES.values()):
            try:
                h.tick(t, dt)
            except Exception as ex:  # one bad house must not stop the others
                print("tick error in house %s: %r" % (h.code, ex), flush=True)


async def main():
    server = await asyncio.start_server(handle, HOST, PORT)
    print("Bigg Toss house is open: http://localhost:%d" % PORT, flush=True)
    asyncio.ensure_future(game_loop())
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
