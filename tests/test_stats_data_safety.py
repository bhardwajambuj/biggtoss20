"""Guards against accidental loss of visitor / play history.

These tests must pass before deploy. They check that:
  - stats and playlog only read or append existing data
  - deploy / logging configs never delete or purge history
  - the repo does not contain commands that wipe production log paths
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import re
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "deploy"


def _fingerprint(path: Path) -> dict:
    data = path.read_bytes()
    return {
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "mtime_ns": path.stat().st_mtime_ns,
    }


def _write_access_line(path: Path, ts: float, uri: str, ip: str, status: int = 200) -> None:
    ev = {
        "ts": ts,
        "status": status,
        "request": {
            "client_ip": ip,
            "uri": uri,
            "method": "GET",
            "host": "biggtoss.com",
        },
    }
    with path.open("at", encoding="utf-8") as fh:
        fh.write(json.dumps(ev) + "\n")


class AccessLogFingerprintTests(unittest.TestCase):
    """collect_stats must leave every access-log file byte-identical."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.log_dir = Path(self._tmpdir.name)
        self.access = self.log_dir / "access.log"
        self.rotated = self.log_dir / "access.log-2026-11-26"
        self.gz = self.log_dir / "access.log-2026-11-25.gz"

        now = time.time()
        _write_access_line(self.access, now - 60, "/", "1.1.1.1")
        _write_access_line(self.access, now - 30, "/ws", "2.2.2.2", status=101)
        _write_access_line(self.rotated, now - 86400, "/", "3.3.3.3")
        with gzip.open(self.gz, "wt", encoding="utf-8") as fh:
            fh.write(json.dumps({
                "ts": now - 172800,
                "status": 200,
                "request": {"client_ip": "4.4.4.4", "uri": "/", "method": "GET", "host": "biggtoss.com"},
            }) + "\n")

        # Import after env is set so ACCESS_LOG is picked up at module load…
        # server.py reads ACCESS_LOG at import time — patch the module attribute.
        import server
        self.server = server
        self._old_log = server.ACCESS_LOG
        self._old_cache = dict(server._stats_cache)
        server.ACCESS_LOG = str(self.access)
        server._stats_cache.clear()
        self.addCleanup(self._restore)

    def _restore(self) -> None:
        self.server.ACCESS_LOG = self._old_log
        self.server._stats_cache.clear()
        self.server._stats_cache.update(self._old_cache)

    def test_collect_stats_does_not_modify_any_log_files(self) -> None:
        before = {p.name: _fingerprint(p) for p in (self.access, self.rotated, self.gz)}
        payload = self.server.collect_stats("all")
        after = {p.name: _fingerprint(p) for p in (self.access, self.rotated, self.gz)}

        self.assertEqual(before, after, "collect_stats must not alter access log bytes")
        self.assertGreaterEqual(payload["pages"], 2)
        self.assertGreaterEqual(payload["game_sessions"], 1)
        self.assertEqual(payload["log_files"], 3)
        # Public payload must not leak IPs
        blob = json.dumps(payload)
        for ip in ("1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"):
            self.assertNotIn(ip, blob)

    def test_collect_stats_twice_still_preserves_files(self) -> None:
        before = {p.name: _fingerprint(p) for p in (self.access, self.rotated, self.gz)}
        self.server._stats_cache.clear()
        self.server.collect_stats("24h")
        self.server._stats_cache.clear()
        self.server.collect_stats("all")
        after = {p.name: _fingerprint(p) for p in (self.access, self.rotated, self.gz)}
        self.assertEqual(before, after)


class PlaylogAppendOnlyTests(unittest.TestCase):
    """playlog must append; existing session history must survive open_log."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.path = Path(self._tmpdir.name) / "sessions.jsonl"
        # Seed history as if from a previous process
        seed = [
            {"e": "boot", "ts": 1000.0},
            {"e": "join", "ts": 1001.0, "sid": "old-1", "u": "abcdefghijkl", "house": "AAAAA", "pub": 0, "char": "X", "n": 1},
            {"e": "leave", "ts": 1061.0, "sid": "old-1", "dur": 60.0, "trp": 10, "slaps": 2, "n": 0},
        ]
        with self.path.open("wt", encoding="utf-8") as fh:
            for ev in seed:
                fh.write(json.dumps(ev) + "\n")
        self.seed_bytes = self.path.read_bytes()
        self.seed_sha = hashlib.sha256(self.seed_bytes).hexdigest()

        import playlog
        self.playlog = playlog
        # Reset module globals for an isolated run
        playlog._fh = None
        playlog.SESSIONS = []
        playlog.ACTIVE = {}
        playlog.storage = "off"
        playlog.path = None
        os.environ["SESSION_LOG"] = str(self.path)
        self.addCleanup(os.environ.pop, "SESSION_LOG", None)
        self.addCleanup(self._close)

    def _close(self) -> None:
        pl = self.playlog
        if pl._fh is not None:
            try:
                pl._fh.close()
            except Exception:
                pass
        pl._fh = None

    def test_open_log_preserves_existing_bytes_as_prefix(self) -> None:
        self.playlog.open_log()
        data = self.path.read_bytes()
        self.assertTrue(
            data.startswith(self.seed_bytes),
            "open_log must keep prior history and only append",
        )
        self.assertGreater(len(data), len(self.seed_bytes))
        # Loaded sessions include the historical one
        self.assertTrue(any(s.get("sid") == "old-1" for s in self.playlog.SESSIONS))

    def test_stats_does_not_rewrite_file(self) -> None:
        self.playlog.open_log()
        before = _fingerprint(self.path)
        _ = self.playlog.stats(None)
        after = _fingerprint(self.path)
        self.assertEqual(before["sha256"], after["sha256"])
        self.assertEqual(before["size"], after["size"])


class DeployScriptSafetyTests(unittest.TestCase):
    """Deploy must never target visitor or play-history paths."""

    FORBIDDEN = [
        r"/var/log/caddy",
        r"access\.log",
        r"sessions\.jsonl",
        r"\.bigtoss",
        r"truncate",
        r">\s*/var/log",
        r"logrotate",
    ]

    def test_deploy_script_does_not_touch_stats_paths(self) -> None:
        script = (DEPLOY / "bigtoss-deploy.sh").read_text(encoding="utf-8")
        # Comments may mention protected paths as warnings — strip full-line comments
        code_lines = []
        for line in script.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            code_lines.append(line)
        code = "\n".join(code_lines)
        for pat in self.FORBIDDEN:
            self.assertIsNone(
                re.search(pat, code),
                f"deploy script must not reference destructive/stats path pattern: {pat}",
            )
        # rm is only allowed for Python bytecode under the app checkout
        for line in code_lines:
            if re.search(r"\brm\b", line):
                self.assertIn("__pycache__", line)
                self.assertIn("$APP", line)
        self.assertIn("systemctl restart bigtoss", code)
        self.assertIn("git reset --hard origin/main", code)


class LoggingRetentionConfigTests(unittest.TestCase):
    """Production logging configs must keep long history (never purge-early)."""

    MIN_ROLL_KEEP = 2000
    MIN_ROLL_KEEP_HOURS = 876000  # ~100 years
    MIN_LOGROTATE = 9999

    def test_caddyfile_retention_floor(self) -> None:
        text = (DEPLOY / "Caddyfile.production").read_text(encoding="utf-8")
        keeps = [int(x) for x in re.findall(r"roll_keep\s+(\d+)", text)]
        hours = [int(x) for x in re.findall(r"roll_keep_for\s+(\d+)h", text)]
        self.assertTrue(keeps, "Caddyfile must set roll_keep")
        self.assertTrue(hours, "Caddyfile must set roll_keep_for")
        self.assertTrue(all(k >= self.MIN_ROLL_KEEP for k in keeps), keeps)
        self.assertTrue(all(h >= self.MIN_ROLL_KEEP_HOURS for h in hours), hours)
        self.assertNotRegex(text, r"\bmaxage\b")

    def test_logrotate_never_deletes_by_age(self) -> None:
        text = (DEPLOY / "logrotate.caddy-bigtoss").read_text(encoding="utf-8")
        self.assertNotRegex(text, r"\bmaxage\b")
        rotates = [int(x) for x in re.findall(r"^\s*rotate\s+(\d+)", text, re.M)]
        self.assertTrue(rotates)
        self.assertTrue(all(r >= self.MIN_LOGROTATE for r in rotates), rotates)


class RepoSourceSafetyTests(unittest.TestCase):
    """Scan tracked source for commands that would wipe production stats data."""

    # Paths / files that hold historical visitor or play data
    PROTECTED = (
        r"/var/log/caddy",
        r"access\.log",
        r"sessions\.jsonl",
        r"~/\.bigtoss",
        r"\$HOME/\.bigtoss",
    )

    DANGEROUS_NEAR_PROTECTED = (
        r"\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?",
        r"\btruncate\b",
        r">\s*/var/log/caddy",
        r"unlink\s*\(",
        r"os\.remove\s*\(",
        r"Path\(.*\)\.unlink",
        r"shutil\.rmtree\s*\(",
        r"open\([^)]*[\"']w[\"']",  # write-truncate mode near protected names checked separately
    )

    SKIP_DIRS = {".git", ".cursor", "__pycache__", "node_modules"}

    def test_no_destructive_ops_on_protected_paths_in_source(self) -> None:
        offenders = []
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in self.SKIP_DIRS]
            for name in filenames:
                if not name.endswith((".py", ".sh", ".yml", ".yaml", ".mdc", ".md", ".txt")):
                    continue
                path = Path(dirpath) / name
                # Allow this test file and the preserve-stats rule to mention bad patterns
                if path.name in {"test_stats_data_safety.py", "preserve-stats-data.mdc"}:
                    continue
                if "deploy/bigtoss-deploy.sh" in str(path).replace("\\", "/"):
                    # covered by DeployScriptSafetyTests
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                for line_no, line in enumerate(text.splitlines(), 1):
                    stripped = line.strip()
                    if stripped.startswith("#") or stripped.startswith("//"):
                        continue
                    if not any(re.search(p, line) for p in self.PROTECTED):
                        continue
                    # Mentions a protected path — ensure the same line isn't destructive
                    for dang in self.DANGEROUS_NEAR_PROTECTED:
                        if re.search(dang, line):
                            offenders.append(f"{path.relative_to(ROOT)}:{line_no}: {line.strip()}")
                    # Explicit truncate-open of session/access logs
                    if re.search(r"open\([^)]*(access\.log|sessions\.jsonl)[^)]*[\"']w", line):
                        offenders.append(f"{path.relative_to(ROOT)}:{line_no}: {line.strip()}")

        self.assertEqual(offenders, [], "destructive ops on stats paths:\n" + "\n".join(offenders))

    def test_playlog_opens_append_only(self) -> None:
        src = (ROOT / "playlog.py").read_text(encoding="utf-8")
        self.assertRegex(src, r'open\(\s*p\s*,\s*"at"')
        self.assertNotRegex(src, r'open\(\s*p\s*,\s*"w')
        self.assertNotRegex(src, r'open\(\s*p\s*,\s*"wt"')
        self.assertNotRegex(src, r"os\.remove\s*\(")
        self.assertNotRegex(src, r"unlink\s*\(")


class CursorRulePresentTests(unittest.TestCase):
    def test_preserve_stats_rule_exists(self) -> None:
        rule = ROOT / ".cursor" / "rules" / "preserve-stats-data.mdc"
        self.assertTrue(rule.is_file())
        text = rule.read_text(encoding="utf-8")
        self.assertIn("alwaysApply: true", text)
        self.assertIn("/var/log/caddy", text)


if __name__ == "__main__":
    unittest.main()
