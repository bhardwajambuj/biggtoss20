"""A change of the stats data format must back the log files up first.

These tests must pass before deploy. They check that:
  - backup_logs makes dated, verified copies and never changes or replaces
    the originals or an earlier backup
  - the server takes such a backup before it writes the first line under a
    new playlog.SCHEMA_VERSION, and writes nothing if the backup fails
  - the play-log format cannot change without a new SCHEMA_VERSION
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import backup_logs  # noqa: E402
import playlog  # noqa: E402

# Fingerprint of playlog.SCHEMA for every version of the format that has existed.
# If test_schema_is_pinned_to_its_version fails you changed the format: raise
# playlog.SCHEMA_VERSION and add the new fingerprint here. Never edit an old entry.
SCHEMA_FINGERPRINTS = {
    1: "fe6fb8aa222d39f1b6720f43e2c87f96820cd0a93d93330c11b5df27319eb5a1",
}

SEED = [
    {"e": "boot", "ts": 1000.0},
    {"e": "join", "ts": 1001.0, "sid": "old-1", "u": "abcdefghijkl", "house": "AAAAA", "pub": 0, "char": "X", "n": 1},
    {"e": "leave", "ts": 1061.0, "sid": "old-1", "dur": 60.0, "trp": 10, "slaps": 2, "n": 0},
]


def _fingerprint(path: Path) -> tuple:
    data = path.read_bytes()
    return (len(data), hashlib.sha256(data).hexdigest(), path.stat().st_mtime_ns)


def _tree(root: Path) -> dict:
    return {str(p.relative_to(root)): _fingerprint(p) for p in sorted(root.rglob("*")) if p.is_file()}


class _Logs(unittest.TestCase):
    """A scratch folder with a play history, a visitor log and a rotated, compressed visitor log."""

    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        (self.dir / "play").mkdir()
        (self.dir / "visits").mkdir()
        self.play = self.dir / "play" / "history.jsonl"
        self.play.write_text("".join(json.dumps(ev) + "\n" for ev in SEED), encoding="utf-8")
        self.visits = self.dir / "visits" / "visits.log"
        self.visits.write_text('{"ts": 1, "request": {"uri": "/"}}\n' * 50, encoding="utf-8")
        self.rotated = self.dir / "visits" / "visits.log-2026-11-26.gz"
        with gzip.open(self.rotated, "wt", encoding="utf-8") as fh:
            fh.write('{"ts": 0, "request": {"uri": "/"}}\n' * 20)
        self.rolled = self.dir / "visits" / "visits-2026-11-25T10-00-00.000.log.gz"     # Caddy's naming
        with gzip.open(self.rolled, "wt", encoding="utf-8") as fh:
            fh.write('{"ts": -1, "request": {"uri": "/"}}\n' * 10)
        (self.dir / "visits" / "other.log").write_text("not ours\n", encoding="utf-8")
        self.sources = [self.play, self.visits, self.rotated, self.rolled]
        self.backups = self.dir / "play" / "backups"
        self.before = {p: _fingerprint(p) for p in self.sources}

    def groups(self) -> list:
        return [("play", backup_logs.log_files(str(self.play))), ("access", backup_logs.log_files(str(self.visits)))]

    def assert_sources_untouched(self) -> None:
        self.assertEqual(self.before, {p: _fingerprint(p) for p in self.sources}, "a backup must not change the originals")


class BackupScriptTests(_Logs):
    def test_backup_is_dated_complete_and_verified(self) -> None:
        m = backup_logs.take(str(self.backups), self.groups(), label="manual")
        today = time.strftime("%Y-%m-%d", time.gmtime())
        self.assertEqual(m["name"], today + "_manual")
        snap = self.backups / m["name"]
        self.assertEqual(sorted(e["file"] for e in m["files"]),
                         ["access/visits-2026-11-25T10-00-00.000.log.gz", "access/visits.log",
                          "access/visits.log-2026-11-26.gz", "play/history.jsonl"])
        for e in m["files"]:
            copy = snap / e["file"]
            self.assertEqual(copy.read_bytes(), Path(e["from"]).read_bytes())
            self.assertEqual(hashlib.sha256(copy.read_bytes()).hexdigest(), e["sha256"])
            self.assertEqual(copy.stat().st_mode & 0o222, 0, "backup copies are read-only")
        self.assertEqual(backup_logs.verify(str(snap)), [])
        self.assertEqual([p.name for p in self.backups.iterdir() if p.name.endswith(".partial")], [])
        self.assert_sources_untouched()

    def test_a_new_backup_never_replaces_an_earlier_one(self) -> None:
        first = backup_logs.take(str(self.backups), self.groups(), label="manual")
        kept = _tree(self.backups / first["name"])
        with self.visits.open("at", encoding="utf-8") as fh:
            fh.write('{"ts": 2, "request": {"uri": "/new"}}\n')
        second = backup_logs.take(str(self.backups), self.groups(), label="manual")
        self.assertNotEqual(first["name"], second["name"])
        self.assertTrue(second["name"].startswith(first["name"] + "_"))
        self.assertEqual(kept, _tree(self.backups / first["name"]), "the earlier backup must stay byte-identical")
        self.assertEqual(len(backup_logs.snapshots(str(self.backups))), 2)

    def test_no_room_on_disk_fails_and_changes_nothing(self) -> None:
        with self.assertRaises(backup_logs.BackupError):
            backup_logs.take(str(self.backups), self.groups(), min_free=1 << 62)
        self.assertEqual(backup_logs.snapshots(str(self.backups)), [])
        self.assert_sources_untouched()

    def test_refuses_to_back_up_its_own_folder(self) -> None:
        m = backup_logs.take(str(self.backups), self.groups())
        inside = str(self.backups / m["name"] / "play" / "history.jsonl")
        with self.assertRaises(backup_logs.BackupError):
            backup_logs.take(str(self.backups), [("play", [inside])])

    def test_verify_notices_a_damaged_copy(self) -> None:
        m = backup_logs.take(str(self.backups), self.groups())
        copy = self.backups / m["name"] / "access" / "visits.log"
        copy.chmod(0o600)
        with copy.open("r+b") as fh:        # damage a scratch copy made by this test
            fh.write(b"X")
        self.assertEqual(len(backup_logs.verify(str(self.backups / m["name"]))), 1)

    def test_command_line(self) -> None:
        cmd = [sys.executable, str(ROOT / "backup_logs.py"), "--session-log", str(self.play),
               "--access-log", str(self.visits), "--label", "before cleanup"]
        run = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        names = [m["name"] for m in backup_logs.snapshots(str(self.backups))]
        self.assertEqual(names, [time.strftime("%Y-%m-%d", time.gmtime()) + "_before-cleanup"])
        listing = subprocess.run(cmd + ["--list"], capture_output=True, text=True)
        self.assertEqual(listing.returncode, 0, listing.stderr)
        self.assertIn("4 files", listing.stdout)
        self.assertEqual(len(backup_logs.snapshots(str(self.backups))), 1, "--list must not take a backup")
        self.assert_sources_untouched()

    def test_script_cannot_delete_or_overwrite(self) -> None:
        src = (ROOT / "backup_logs.py").read_text(encoding="utf-8")
        for pat in (r"os\.remove\s*\(", r"unlink\s*\(", r"rmtree\s*\(", r"\brmdir\s*\(", r"truncate\s*\(",
                    r"os\.replace\s*\(", r"shutil\.move\s*\("):
            self.assertNotRegex(src, pat)
        # files are only read, or created in exclusive mode (which fails if the file exists)
        opens = [line for line in src.splitlines() if re.search(r"\bopen\(", line)]
        modes = [re.findall(r"""["']([rwxabt+]+)["']""", line) for line in opens]
        for line, found in zip(opens, modes):
            self.assertEqual(len(found), line.count("open("), "every open() must state its mode: " + line.strip())
        self.assertEqual(sorted({m for found in modes for m in found}), ["rb", "rt", "x", "xb"])


class SchemaChangeBackupTests(_Logs):
    """The server backs the logs up before the first line in a new format."""

    def setUp(self) -> None:
        super().setUp()
        self.seed = self.play.read_bytes()
        self._version = playlog.SCHEMA_VERSION
        self._min_free = backup_logs.MIN_FREE
        self._reset()
        os.environ["SESSION_LOG"] = str(self.play)
        self.addCleanup(self._restore)

    def _reset(self) -> None:
        if playlog._fh is not None:
            playlog._fh.close()
        playlog._fh = None
        playlog.SESSIONS = []
        playlog.ACTIVE = {}
        playlog.storage, playlog.path, playlog.backup, playlog.problem = "off", None, None, None

    def _restore(self) -> None:
        self._reset()
        os.environ.pop("SESSION_LOG", None)
        playlog.SCHEMA_VERSION = self._version
        backup_logs.MIN_FREE = self._min_free

    def _names(self) -> list:
        return [m["name"] for m in backup_logs.snapshots(str(self.backups))]

    def test_first_start_backs_up_before_writing(self) -> None:
        playlog.open_log(str(self.visits))
        name = "%s_schema-v%d" % (time.strftime("%Y-%m-%d", time.gmtime()), playlog.SCHEMA_VERSION)
        self.assertEqual(self._names(), [name])
        snap = self.backups / name
        self.assertEqual((snap / "play" / "history.jsonl").read_bytes(), self.seed,
                         "the backup must hold the history exactly as it was before this version wrote to it")
        self.assertEqual((snap / "access" / "visits.log").read_bytes(), self.visits.read_bytes())
        for old in (self.rotated, self.rolled):
            self.assertEqual((snap / "access" / old.name).read_bytes(), old.read_bytes())
        live = self.play.read_bytes()
        self.assertTrue(live.startswith(self.seed))
        self.assertEqual(json.loads(live[len(self.seed):])["v"], playlog.SCHEMA_VERSION)
        self.assertEqual(playlog.stats()["backup"]["name"], name)
        self.assertEqual(playlog.stats()["schema"], playlog.SCHEMA_VERSION)

    def test_restart_on_the_same_version_takes_no_new_backup(self) -> None:
        playlog.open_log(str(self.visits))
        kept = _tree(self.backups)
        self._reset()
        playlog.open_log(str(self.visits))
        self.assertEqual(kept, _tree(self.backups))
        self.assertEqual(len(self._names()), 1)
        self.assertEqual(playlog.backup["name"], self._names()[0])

    def test_new_version_backs_up_everything_written_so_far(self) -> None:
        playlog.open_log(str(self.visits))
        playlog.end(playlog.start("abcdefghijkl", "BBBBB", True, "Y", 1))
        self._reset()
        written = self.play.read_bytes()
        kept = _tree(self.backups)

        playlog.SCHEMA_VERSION = self._version + 1          # a deploy that changes the format
        playlog.open_log(str(self.visits))
        new = [n for n in self._names() if n.endswith("_schema-v%d" % (self._version + 1))]
        self.assertEqual(len(new), 1, self._names())
        self.assertEqual((self.backups / new[0] / "play" / "history.jsonl").read_bytes(), written)
        live = self.play.read_bytes()
        self.assertTrue(live.startswith(written), "history is only ever appended to")
        self.assertEqual(json.loads(live[len(written):])["v"], self._version + 1)
        for rel, fp in kept.items():
            self.assertEqual(_fingerprint(self.backups / rel), fp, "older backups stay byte-identical")

    def test_no_backup_means_nothing_is_written(self) -> None:
        backup_logs.MIN_FREE = 1 << 62                      # the backup cannot succeed
        playlog.open_log(str(self.visits))
        self.assertEqual(playlog.storage, "off")
        self.assertIn("backed up", playlog.problem)
        playlog.end(playlog.start("abcdefghijkl", "BBBBB", True, "Y", 1))
        playlog.tick()
        self.assertEqual(self.play.read_bytes(), self.seed)
        self.assertEqual(self._names(), [])
        self.assertFalse(playlog.stats()["tracking"])
        self.assertIn("backed up", playlog.stats()["problem"])
        self.assert_sources_untouched()

    def test_server_hands_the_visitor_log_to_the_backup(self) -> None:
        src = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertRegex(src, r"playlog\.open_log\(ACCESS_LOG\)")


class SchemaPinTests(unittest.TestCase):
    """The format cannot change quietly: it is tied to SCHEMA_VERSION."""

    def test_schema_is_pinned_to_its_version(self) -> None:
        got = hashlib.sha256(json.dumps(playlog.SCHEMA, sort_keys=True).encode()).hexdigest()
        self.assertIn(playlog.SCHEMA_VERSION, SCHEMA_FINGERPRINTS,
                      "new SCHEMA_VERSION: add its fingerprint (%s) to SCHEMA_FINGERPRINTS" % got)
        self.assertEqual(
            got, SCHEMA_FINGERPRINTS[playlog.SCHEMA_VERSION],
            "playlog.SCHEMA changed without a new version. Raise playlog.SCHEMA_VERSION and add fingerprint %s; "
            "the server then backs the log files up before it uses the new format." % got)
        self.assertEqual(playlog.SCHEMA_VERSION, max(SCHEMA_FINGERPRINTS), "versions only go up")

    def test_every_written_line_follows_the_schema(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        log = Path(tmp.name) / "history.jsonl"
        if playlog._fh is not None:
            playlog._fh.close()
        playlog._fh, playlog.SESSIONS, playlog.ACTIVE = None, [], {}
        os.environ["SESSION_LOG"] = str(log)
        self.addCleanup(os.environ.pop, "SESSION_LOG", None)

        def close() -> None:
            if playlog._fh is not None:
                playlog._fh.close()
            playlog._fh, playlog.SESSIONS, playlog.ACTIVE = None, [], {}
        self.addCleanup(close)

        playlog.open_log()
        r = playlog.start("abcdefghijkl", "AAAAA", False, "X", 1)
        playlog.switch(r, "Y")
        playlog.tick()
        playlog.end(r, 5, 1, 0)
        seen = set()
        for line in log.read_text(encoding="utf-8").splitlines():
            ev = json.loads(line)
            self.assertEqual(tuple(ev), playlog.SCHEMA[ev["e"]])
            seen.add(ev["e"])
        self.assertEqual(seen, set(playlog.SCHEMA), "every kind of event is covered by this test")

    def test_fields_outside_the_schema_are_refused(self) -> None:
        with self.assertRaises(ValueError):
            playlog._write("tick", ts=1.0, extra=1)
        with self.assertRaises(ValueError):
            playlog._write("join", ts=1.0)


if __name__ == "__main__":
    unittest.main()
