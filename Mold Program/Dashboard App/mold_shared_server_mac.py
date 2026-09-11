#!/usr/bin/env python3
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


APP_DIR = Path(__file__).resolve().parent
ROWS_FILE = APP_DIR / "mold_shared_rows.json"
HOST = "127.0.0.1"
PORT = 3212


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def read_payload():
    if not ROWS_FILE.exists():
        return {"updatedAt": utc_now(), "rows": []}
    text = ROWS_FILE.read_text(encoding="utf-8-sig")
    payload = json.loads(text)
    if isinstance(payload, list):
        payload = {"updatedAt": utc_now(), "rows": payload}
    payload.setdefault("updatedAt", utc_now())
    payload.setdefault("rows", [])
    return payload


def atomic_write_payload(payload):
    fd, tmp_path = tempfile.mkstemp(prefix="mold_shared_rows_", suffix=".json", dir=str(APP_DIR))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp_path, ROWS_FILE)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def clean_text(value):
    if value is None:
        return ""
    return str(value).strip()


def clean_slip_lock(value):
    text = clean_text(value)
    if not text:
        return ""
    text = text.replace("(", "").replace(")", "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_row(row):
    normalized = dict(row or {})
    for key, value in list(normalized.items()):
        if key == "slipLock":
            normalized[key] = clean_slip_lock(value)
        elif isinstance(value, str):
            normalized[key] = value.strip()
    return normalized


def row_identity(row):
    row = row or {}
    parts = [
        clean_text(row.get("brand")).lower(),
        clean_text(row.get("moldNo")).lower(),
        clean_text(row.get("description")).lower(),
        clean_text(row.get("customer")).lower(),
        clean_text(row.get("origin")).lower(),
    ]
    return "|".join(parts)


class MoldHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def _send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8-sig"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json({"ok": True, "rowsFile": str(ROWS_FILE)})
            return
        if parsed.path == "/api/rows":
            self._send_json(read_payload())
            return
        if parsed.path == "/":
            self.path = "/mold_dashboard.html"
        else:
            self.path = unquote(parsed.path)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            payload = self._read_json()
        except Exception as exc:
            self._send_json({"ok": False, "error": f"Invalid JSON payload: {exc}"}, HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/row-save":
            row = normalize_row(payload)
            shared = read_payload()
            rows = shared.get("rows", [])
            target_key = row_identity(row)
            match_indexes = [idx for idx, existing in enumerate(rows) if row_identity(existing) == target_key]
            action = "added"
            if match_indexes:
                rows[match_indexes[0]] = row
                for idx in reversed(match_indexes[1:]):
                    del rows[idx]
                action = "updated"
            else:
                rows.append(row)
            shared["rows"] = rows
            shared["updatedAt"] = utc_now()
            atomic_write_payload(shared)
            self._send_json({"ok": True, "action": action, "count": len(rows)})
            return

        if parsed.path == "/api/row-delete":
            row = normalize_row(payload)
            shared = read_payload()
            rows = shared.get("rows", [])
            target_key = row_identity(row)
            new_rows = [existing for existing in rows if row_identity(existing) != target_key]
            shared["rows"] = new_rows
            shared["updatedAt"] = utc_now()
            atomic_write_payload(shared)
            self._send_json({"ok": True, "action": "deleted", "count": len(new_rows)})
            return

        self._send_json({"ok": False, "error": "Not found"}, HTTPStatus.NOT_FOUND)


def main():
    server = ThreadingHTTPServer((HOST, PORT), MoldHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
