#!/usr/bin/env python3
"""Dated, verified backups of the stats log files.

The game calls this by itself: whenever the play-history format changes
(playlog.SCHEMA_VERSION), the existing log files are copied into a folder
named by date BEFORE anything is written in the new format:

    <play log folder>/backups/2026-11-27_schema-v1/
        MANIFEST.json            what was copied, sizes and SHA-256 checksums
        play/<play history files>
        access/<visitor log files>

It can also be run by hand at any time, as the user the game runs as:

    python3 backup_logs.py                 # folder ends in _manual
    python3 backup_logs.py --label before-cleanup

Rules this file keeps:
  - the log files are only ever opened for reading
  - a backup never replaces or changes an earlier backup
  - nothing is ever deleted, not even an unfinished backup (it stays behind
    as <name>.partial so it can be looked at)
  - every copy is read back and compared with what was read from the original
"""

import glob
import hashlib
import json
import os
import shutil
import sys
import time

MIN_FREE = 256 * 1024 * 1024     # never fill the disk: this much must stay free after the copy
MANIFEST = "MANIFEST.json"
_CHUNK = 1 << 20


class BackupError(Exception):
    """The backup could not be completed and verified."""


def log_files(base):
    """A log file and its rotated or compressed siblings.

    For base "visits.log" that is visits.log, visits.log.1, visits.log-2026-11-26.gz
    (logrotate style) and visits-2026-11-26T10-00-00.000.log.gz (how Caddy
    names the files it rolls).
    """
    if not base:
        return []
    stem, ext = os.path.splitext(base)
    found = set(glob.glob(glob.escape(base) + "*"))
    if ext:
        found.update(glob.glob(glob.escape(stem) + "-*" + glob.escape(ext) + "*"))
    return [p for p in sorted(found) if os.path.isfile(p) and not os.path.islink(p)]


def _sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for block in iter(lambda: fh.read(_CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def _copy(src, dst):
    """Copy src to a file that must not exist yet. Returns (bytes, sha256) of what was read."""
    h, n = hashlib.sha256(), 0
    with open(src, "rb") as fin, open(dst, "xb") as fout:
        for block in iter(lambda: fin.read(_CHUNK), b""):
            h.update(block)
            fout.write(block)
            n += len(block)
        fout.flush()
        os.fsync(fout.fileno())
    return n, h.hexdigest()


def snapshots(root):
    """Manifests of every finished backup under root, oldest first."""
    out = []
    try:
        names = sorted(os.listdir(root))
    except OSError:
        return out
    for name in names:
        if name.endswith(".partial"):
            continue
        try:
            with open(os.path.join(root, name, MANIFEST), "rt", encoding="utf-8") as fh:
                m = json.load(fh)
        except (OSError, ValueError):
            continue
        if isinstance(m, dict):
            m["name"] = name
            out.append(m)
    out.sort(key=lambda m: m.get("created") or 0)
    return out


def take(root, groups, label="manual", schema=None, key=None, min_free=None):
    """Copy the given files into a new dated folder under root and verify them.

    groups is a list of (folder name, [file paths]). Returns the manifest.
    Raises BackupError if anything could not be copied and verified; in that
    case nothing that existed before has been changed.
    """
    min_free = MIN_FREE if min_free is None else min_free
    label = "".join(c if c.isalnum() or c in "._-" else "-" for c in str(label))[:40] or "manual"
    try:
        root = os.path.realpath(root)
        files = []
        for group, paths in groups:
            for p in sorted(set(paths)):
                if not os.path.isfile(p) or os.path.islink(p):
                    continue
                if os.path.realpath(p).startswith(root + os.sep):
                    raise BackupError("refusing to back up %s: it is inside the backup folder" % p)
                files.append((group, p))
        os.makedirs(root, mode=0o700, exist_ok=True)
        need = sum(os.path.getsize(p) for _, p in files)
        free = shutil.disk_usage(root).free
        if free - need < min_free:
            raise BackupError("not enough disk space for a backup: %d MB needed, %d MB free, %d MB must stay free"
                              % (need >> 20, free >> 20, min_free >> 20))
        now = time.time()
        name = "%s_%s" % (time.strftime("%Y-%m-%d", time.gmtime(now)), label)
        if os.path.lexists(os.path.join(root, name)) or os.path.lexists(os.path.join(root, name + ".partial")):
            name += "_" + time.strftime("%H%M%S", time.gmtime(now))      # same date and label: keep both
        tmp = os.path.join(root, name + ".partial")
        os.mkdir(tmp, 0o700)                 # fails rather than reuse an existing folder
        entries = []
        for group, p in files:
            os.makedirs(os.path.join(tmp, group), mode=0o700, exist_ok=True)
            dst = os.path.join(tmp, group, os.path.basename(p))
            st = os.stat(p)
            size, digest = _copy(p, dst)
            if os.path.getsize(dst) != size or _sha(dst) != digest:
                raise BackupError("the copy of %s does not match the original" % p)
            os.utime(dst, ns=(st.st_atime_ns, st.st_mtime_ns))
            os.chmod(dst, 0o400)
            entries.append({"file": group + "/" + os.path.basename(p), "from": os.path.abspath(p),
                            "size": size, "sha256": digest, "mtime": round(st.st_mtime, 2)})
        manifest = {"created": round(now, 2), "date": name[:10], "label": label, "schema": schema, "key": key,
                    "files": entries, "bytes": sum(e["size"] for e in entries)}
        with open(os.path.join(tmp, MANIFEST), "x", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=1)
            fh.flush()
            os.fsync(fh.fileno())
        os.rename(tmp, os.path.join(root, name))      # only a complete, verified backup gets its final name
    except OSError as e:
        raise BackupError("backup failed: %s" % e)
    manifest["name"] = name
    manifest["path"] = os.path.join(root, name)
    return manifest


def ensure_for_schema(root, version, groups, key=None):
    """Make sure a backup taken for this version of the data format exists.

    Returns (manifest, True) if one was taken now, (manifest, False) if the
    logs were already backed up for this version. `key` tells apart several
    play logs that share one backup folder.
    """
    for m in reversed(snapshots(root)):
        if m.get("schema") == version and m.get("key") == key:
            return m, False
    return take(root, groups, label="schema-v%s" % version, schema=version, key=key), True


def verify(path):
    """Re-check a finished backup against its manifest. Returns a list of problems."""
    bad = []
    try:
        with open(os.path.join(path, MANIFEST), "rt", encoding="utf-8") as fh:
            m = json.load(fh)
    except (OSError, ValueError) as e:
        return ["no readable manifest: %s" % e]
    for e in m.get("files", []):
        p = os.path.join(path, e["file"])
        try:
            if os.path.getsize(p) != e["size"] or _sha(p) != e["sha256"]:
                bad.append("%s does not match its checksum" % e["file"])
        except OSError as err:
            bad.append("%s: %s" % (e["file"], err))
    return bad


def main(argv):
    import argparse
    import playlog
    ap = argparse.ArgumentParser(description="Take a dated, verified backup of the stats log files.")
    ap.add_argument("--label", default="manual", help="what the backup is for; becomes part of the folder name")
    ap.add_argument("--session-log", help="play history file (default: where the game keeps it)")
    ap.add_argument("--access-log", default=os.environ.get("ACCESS_LOG", "/var/log/caddy/access.log"),
                    help="visitor log file (default: %(default)s)")
    ap.add_argument("--dest", help="backup folder (default: 'backups' next to the play history)")
    ap.add_argument("--list", action="store_true", help="list and re-verify the existing backups, take no new one")
    a = ap.parse_args(argv)
    play = a.session_log or next((p for _, p in playlog._candidates() if os.path.isfile(p)), None)
    dest = a.dest or (os.path.join(os.path.dirname(os.path.abspath(play)), "backups") if play else None)
    if not dest:
        print("No play history found; say where backups should go with --dest", file=sys.stderr)
        return 2
    if a.list:
        status = 0
        for m in snapshots(dest):
            bad = verify(os.path.join(dest, m["name"]))
            print("%-36s %3d files %10d bytes  %s" % (m["name"], len(m.get("files", [])), m.get("bytes", 0),
                                                     "OK" if not bad else "PROBLEM: " + "; ".join(bad)))
            status = status or (1 if bad else 0)
        return status
    try:
        m = take(dest, [("play", log_files(play)), ("access", log_files(a.access_log))], label=a.label,
                 key=os.path.abspath(play) if play else None)
    except BackupError as e:
        print("BACKUP FAILED: %s" % e, file=sys.stderr)
        return 1
    print("Backup written and verified: %s (%d files, %d bytes)" % (m["path"], len(m["files"]), m["bytes"]))
    for e in m["files"]:
        print("  %s  %d bytes  sha256 %s" % (e["file"], e["size"], e["sha256"][:16]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
