#!/usr/bin/env python3
"""Golden City private sales server. Python 3.10+, standard library only.

Run: python3 server.py --host 127.0.0.1 --port 8765
Accounts are never seeded. The first manager is created with the one-time token
printed on the server console. Bind to loopback by default; use a HTTPS reverse
proxy (and --secure-cookie) for shared network deployment.
"""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import hmac
import io
import ipaddress
import json
import math
import os
import re
import secrets
import sqlite3
import sys
import tempfile
import threading
import time
import zipfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent
TOWERS = ("A1", "A2", "A3", "C1", "C2")
STATUSES = ("available", "reserved", "sold", "hidden", "unknown")
MAX_UPLOAD = 10 * 1024 * 1024
SESSION_HOURS = 12
BAGHDAD = timezone(timedelta(hours=3))
CODE_RE = re.compile(r"^(A[123]|C[12])-F(\d{1,2})-(\d{2})$")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def packed(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def unpacked(value, default=None):
    return json.loads(value) if value else default


class APIError(Exception):
    def __init__(self, status, error, code=None):
        self.status, self.error, self.code = status, error, code
        super().__init__(error)


def fail(status, text, code=None):
    raise APIError(status, text, code)


def text_field(data, name, required=False, maximum=1000):
    value = data.get(name, "")
    if value is None:
        value = ""
    if not isinstance(value, str) or len(value) > maximum:
        fail(400, "قيمة غير صالحة في الحقل: " + name)
    value = value.strip()
    if required and not value:
        fail(400, "يرجى تعبئة الحقل: " + name)
    return value


def number_field(value, name, optional=True, maximum=1e12):
    if value is None or value == "":
        if optional:
            return None
        fail(400, "يرجى تعبئة الحقل: " + name)
    if isinstance(value, bool):
        fail(400, "رقم غير صالح: " + name)
    try:
        result = float(value)
    except (TypeError, ValueError):
        fail(400, "رقم غير صالح: " + name)
    if not math.isfinite(result) or result < 0 or result > maximum:
        fail(400, "رقم خارج النطاق: " + name)
    return result


def hash_password(password):
    if not isinstance(password, str) or len(password) < 12 or len(password) > 256:
        fail(400, "كلمة المرور يجب أن تتكون من 12 إلى 256 حرفاً.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000)
    return "pbkdf2_sha256$310000$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password, stored):
    if not isinstance(password, str) or len(password) > 256:
        return False
    try:
        algorithm, rounds, salt, digest = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        calculated = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(rounds))
        return hmac.compare_digest(calculated, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('manager','employee')),
 manager_id INTEGER REFERENCES users(id), towers TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), csrf TEXT NOT NULL,
 user_revision INTEGER, expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS units (
 code TEXT PRIMARY KEY, tower TEXT NOT NULL, floor INTEGER NOT NULL, pos INTEGER NOT NULL,
 status TEXT NOT NULL, review_required INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, manual_review INTEGER NOT NULL DEFAULT 0,
 live_touched INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, source_sha TEXT
);
CREATE INDEX IF NOT EXISTS units_tower ON units(tower);
CREATE TABLE IF NOT EXISTS reservations (
 id INTEGER PRIMARY KEY, unit_code TEXT NOT NULL REFERENCES units(code), client_name TEXT,
 client_phone TEXT, created_by INTEGER REFERENCES users(id), salesperson_name TEXT,
 created_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','sold','cancelled')),
 version INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '', legacy INTEGER NOT NULL DEFAULT 0,
 price_per_m2 REAL, deposit REAL, source_id TEXT UNIQUE, source_date TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_reservation ON reservations(unit_code) WHERE status IN ('active','sold');
CREATE TABLE IF NOT EXISTS cancellations (
 id INTEGER PRIMARY KEY, reservation_id INTEGER NOT NULL REFERENCES reservations(id),
 unit_code TEXT NOT NULL, reservation_version INTEGER NOT NULL,
 requested_by INTEGER NOT NULL REFERENCES users(id), reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','stale')),
 created_at TEXT NOT NULL, decision_reason TEXT, decided_by INTEGER REFERENCES users(id), decided_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_cancellation ON cancellations(reservation_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS idempotency (
 user_id INTEGER NOT NULL, action TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
 response TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,action,key)
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY, actor_id INTEGER, actor_name TEXT, action TEXT NOT NULL,
 entity_type TEXT NOT NULL, entity_id TEXT, tower TEXT, before_json TEXT, after_json TEXT,
 reason TEXT, created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TABLE IF NOT EXISTS source_events (id TEXT PRIMARY KEY, data TEXT NOT NULL, source_sha TEXT, imported_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS imports (sha TEXT PRIMARY KEY, filename TEXT, summary TEXT, issues TEXT, imported_at TEXT NOT NULL, actor_id INTEGER);
CREATE TABLE IF NOT EXISTS import_previews (id TEXT PRIMARY KEY, sha TEXT NOT NULL, actor_id INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT, message TEXT NOT NULL, entity_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


class Application:
    def __init__(self, db_path=None, data_dir=None, bootstrap=True, secure_cookie=False):
        self.db_path = Path(db_path or ROOT / "data" / "golden-city.sqlite3").resolve()
        self.data_dir = Path(data_dir or ROOT / "data").resolve()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.secure_cookie = secure_cookie
        self.setup_token = secrets.token_urlsafe(28)
        self.setup_lock = threading.Lock()
        self.rate_lock = threading.Lock()
        self.login_attempts = {}
        self.dummy_password_hash = hash_password(secrets.token_urlsafe(24))
        with self.connect() as db:
            db.executescript(SCHEMA)
            db.execute("PRAGMA journal_mode=WAL")
            if "source_date" not in {column["name"] for column in db.execute("PRAGMA table_info(reservations)")}:
                db.execute("ALTER TABLE reservations ADD COLUMN source_date TEXT")
                for row in db.execute("SELECT r.id,u.data FROM reservations r JOIN units u ON u.code=r.unit_code WHERE r.legacy=1 AND r.source_id LIKE 'initial-unit:%'").fetchall():
                    original_date = unpacked(row["data"], {}).get("date")
                    db.execute("UPDATE reservations SET source_date=? WHERE id=?", (original_date, row["id"]))
        try:
            os.chmod(self.db_path, 0o600)
        except OSError:
            pass
        preview_file = self.data_dir / "import-preview.json"
        if bootstrap and preview_file.is_file():
            preview = json.loads(preview_file.read_text(encoding="utf-8"))
            with self.transaction() as db:
                if db.execute("SELECT COUNT(*) FROM units").fetchone()[0] == 0:
                    self.ingest(db, preview, actor=None, initial=True)

    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=30, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=30000")
        return db

    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def setup_required(self, db):
        return db.execute("SELECT COUNT(*) FROM users WHERE role='manager'").fetchone()[0] == 0

    def user(self, row):
        if not row:
            return None
        return {"id": row["id"], "name": row["name"], "username": row["username"], "role": row["role"],
                "manager_id": row["manager_id"], "towers": unpacked(row["towers"], []), "active": bool(row["active"])}

    def require_manager(self, user):
        if user["role"] != "manager":
            fail(403, "هذا الإجراء متاح للمدير فقط.", "MANAGER_REQUIRED")

    def tower_scope(self, user, tower):
        if tower not in user["towers"]:
            fail(403, "هذا البرج خارج نطاق صلاحياتك.", "OUT_OF_SCOPE")

    def managed_ids(self, db, user):
        if user["role"] == "manager":
            return {user["id"], *(r[0] for r in db.execute("SELECT id FROM users WHERE manager_id=?", (user["id"],)))}
        return {user["id"]}

    def can_read_reservation(self, db, user, row):
        unit = db.execute("SELECT tower FROM units WHERE code=?", (row["unit_code"],)).fetchone()
        if not unit or unit["tower"] not in user["towers"]:
            return False
        return row["created_by"] in self.managed_ids(db, user) or (user["role"] == "manager" and row["legacy"] and row["created_by"] is None)

    def reservation(self, row):
        if not row:
            return None
        result = dict(row)
        result["source_date_known"] = bool(result.get("source_date"))
        result["date_origin"] = "source" if result["legacy"] and result["source_date_known"] else "unknown" if result["legacy"] else "system"
        if result["legacy"]:
            # Internal created_at is record-ingestion time, never evidence of an
            # original booking date. Unknown source dates stay null in every API.
            result["created_at"] = result.get("source_date")
        return result

    def get_unit(self, db, user, code):
        row = db.execute("SELECT * FROM units WHERE code=?", (code,)).fetchone()
        if not row:
            fail(404, "الوحدة غير موجودة.")
        self.tower_scope(user, row["tower"])
        return row

    def get_reservation(self, db, user, reservation_id):
        row = db.execute("SELECT * FROM reservations WHERE id=?", (reservation_id,)).fetchone()
        if not row or not self.can_read_reservation(db, user, row):
            fail(404, "الحجز غير موجود أو خارج صلاحياتك.")
        return row

    def current_reservation(self, db, code):
        return db.execute("SELECT * FROM reservations WHERE unit_code=? AND status IN ('active','sold')", (code,)).fetchone()

    def unit(self, db, user, row):
        data = unpacked(row["data"], {})
        data.update(code=row["code"], tower=row["tower"], floor=row["floor"], pos=row["pos"],
                    status=row["status"], review_required=bool(row["review_required"]), version=row["version"], updated_at=row["updated_at"])
        current = self.current_reservation(db, row["code"])
        permitted = current and self.can_read_reservation(db, user, current)
        for key in ("client_name", "client_phone", "salesperson_name", "deposit"):
            data.pop(key, None)
        if user["role"] != "manager":
            for key in ("raw", "source_records", "source", "date", "source_sha", "notes", "review_reasons"):
                data.pop(key, None)
        elif current and not permitted:
            for key in ("raw", "source_records", "source", "date", "notes"):
                data.pop(key, None)
        data["reservation_id"] = current["id"] if permitted else None
        data["reserved_by"] = current["salesperson_name"] if permitted else None
        data["pending_cancellation"] = bool(current and db.execute("SELECT 1 FROM cancellations WHERE reservation_id=? AND status='pending'", (current["id"],)).fetchone())
        return data

    def scoped_units(self, db, user):
        return [self.unit(db, user, row) for row in db.execute("SELECT * FROM units ORDER BY tower,floor DESC,pos") if row["tower"] in user["towers"]]

    def scoped_reservations(self, db, user):
        return [self.reservation(row) for row in db.execute("SELECT * FROM reservations ORDER BY id DESC") if self.can_read_reservation(db, user, row)]

    def cancellation(self, db, row):
        result = dict(row)
        name = db.execute("SELECT name FROM users WHERE id=?", (row["requested_by"],)).fetchone()
        result["requester_name"] = name[0] if name else "غير متوفر"
        return result

    def scoped_requests(self, db, user):
        result = []
        for row in db.execute("SELECT * FROM cancellations ORDER BY id DESC"):
            reservation = db.execute("SELECT * FROM reservations WHERE id=?", (row["reservation_id"],)).fetchone()
            if self.can_read_reservation(db, user, reservation):
                result.append(self.cancellation(db, row))
        return result

    def stats(self, units):
        counts = {key: sum(u["status"] == key for u in units) for key in STATUSES}
        offered = sum(u["status"] in ("available", "reserved", "sold") for u in units)
        counts.update(total=len(units), review_required=sum(bool(u["review_required"]) for u in units),
                      offered=offered, absorption=round(100 * (counts["reserved"] + counts["sold"]) / offered, 1) if offered else 0)
        return counts

    def audit(self, db, user, action, entity_type, entity_id, before=None, after=None, reason=None, tower=None):
        db.execute("INSERT INTO audit(actor_id,actor_name,action,entity_type,entity_id,tower,before_json,after_json,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (user["id"] if user else None, user["name"] if user else "استيراد المصدر الأولي", action, entity_type, str(entity_id), tower,
                    packed(before) if before is not None else None, packed(after) if after is not None else None, reason, now()))

    def notify(self, db, user_id, kind, message, entity_id=None):
        if user_id:
            db.execute("INSERT INTO notifications(user_id,kind,message,entity_id,created_at) VALUES(?,?,?,?,?)", (user_id, kind, message, str(entity_id) if entity_id else None, now()))

    def update_unit(self, db, row, data, status=None, reviewed=None, live=False):
        data = dict(data)
        target = status if status is not None else row["status"]
        review = int(reviewed) if reviewed is not None else row["review_required"]
        data.update(status=target, review_required=bool(review))
        db.execute("UPDATE units SET status=?,review_required=?,data=?,version=version+1,live_touched=MAX(live_touched,?),updated_at=? WHERE code=?",
                   (target, review, packed(data), int(live), now(), row["code"]))

    def idempotent_existing(self, db, user, action, payload):
        key = text_field(payload, "idempotency_key", True, 128)
        digest = hashlib.sha256(packed({k: v for k, v in payload.items() if k != "idempotency_key"}).encode()).hexdigest()
        row = db.execute("SELECT * FROM idempotency WHERE user_id=? AND action=? AND key=?", (user["id"], action, key)).fetchone()
        if row and not hmac.compare_digest(row["request_hash"], digest):
            fail(409, "مفتاح العملية مستخدم لطلب مختلف. حدّث النموذج ثم حاول مجدداً.", "IDEMPOTENCY_MISMATCH")
        return key, digest, unpacked(row["response"]) if row else None

    def save_idempotency(self, db, user, action, key, digest, result):
        db.execute("INSERT INTO idempotency VALUES(?,?,?,?,?,?)", (user["id"], action, key, digest, packed(result), now()))

    def validate_source_unit(self, unit):
        if not isinstance(unit, dict):
            fail(400, "سجل وحدة غير صالح في المصدر.")
        code = unit.get("code", "")
        match = CODE_RE.fullmatch(code)
        if not match or unit.get("tower") != match[1]:
            fail(400, "كود وحدة غير صالح في المصدر: " + str(code))
        if unit.get("status") not in STATUSES:
            fail(400, "حالة وحدة غير صالحة: " + str(code))
        data = dict(unit)
        data.update(floor=int(match[2]), pos=int(match[3]), type=match[1][0])
        if data["floor"] < 1 or data["floor"] > (29 if data["type"] == "A" else 35) or data["pos"] < 1 or data["pos"] > (4 if data["type"] == "A" else 6):
            data["review_required"] = True
            data.setdefault("review_reasons", []).append("الطابق أو موضع الوحدة يحتاج توثيقاً هندسياً")
        if not data.get("area") or not data.get("view"):
            data["review_required"] = True
        return data

    def ingest(self, db, preview, actor=None, initial=False):
        meta = preview.get("meta", {})
        sha = meta.get("source_sha256") or hashlib.sha256(packed(preview).encode()).hexdigest()
        previous = db.execute("SELECT summary FROM imports WHERE sha=?", (sha,)).fetchone()
        if previous:
            return {"already_imported": True, "inserted_units": 0, "inserted_events": 0, "protected_units": 0, "source_sha256": sha}
        inserted = protected = inserted_events = unchanged = 0
        issues = list(preview.get("issues", []))
        seen_codes = set()
        for source in preview.get("units", []):
            unit = self.validate_source_unit(source)
            if unit["code"] in seen_codes:
                fail(400, "المصدر يحتوي أكثر من سجل حالي لنفس الوحدة: " + unit["code"])
            seen_codes.add(unit["code"])
            if actor and unit["tower"] not in actor["towers"]:
                continue
            row = db.execute("SELECT * FROM units WHERE code=?", (unit["code"],)).fetchone()
            if row:
                original = unpacked(row["data"])
                comparison = ("status", "area", "view", "price_per_m2", "client_name", "client_phone", "salesperson_name", "review_required", "allocation")
                if any(original.get(k) != unit.get(k) for k in comparison) or row["live_touched"] or row["manual_review"]:
                    protected += 1
                    issues.append({"id": "protected-" + sha[:12] + "-" + unit["code"], "code": unit["code"], "kind": "live_data_protected", "message": "حُفظت البيانات الحالية؛ التغيير الوارد يحتاج مراجعة ولا يستبدل العمليات أو الاعتماد السابق.", "source": unit.get("source"),
                                   "proposed": {k: unit.get(k) for k in comparison}, "current": {k: original.get(k) for k in comparison}})
                else:
                    unchanged += 1
                continue
            db.execute("INSERT INTO units(code,tower,floor,pos,status,review_required,data,updated_at,source_sha) VALUES(?,?,?,?,?,?,?,?,?)",
                       (unit["code"], unit["tower"], unit["floor"], unit["pos"], unit["status"], int(bool(unit.get("review_required", True))), packed(unit), now(), sha))
            inserted += 1
            if unit["status"] in ("reserved", "sold"):
                db.execute("INSERT INTO reservations(unit_code,client_name,client_phone,salesperson_name,created_at,status,legacy,price_per_m2,deposit,source_id,source_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                           (unit["code"], unit.get("client_name"), unit.get("client_phone"), unit.get("salesperson_name"), now(),
                            "active" if unit["status"] == "reserved" else "sold", 1, unit.get("price_per_m2"), unit.get("deposit"), "initial-unit:" + unit["code"], unit.get("date")))
        for event in preview.get("events", []):
            codes = event.get("unit_codes", [])
            if actor and codes and not any(c.split("-")[0] in actor["towers"] for c in codes):
                continue
            event_id = event.get("id") or hashlib.sha256(packed(event).encode()).hexdigest()
            inserted_events += db.execute("INSERT OR IGNORE INTO source_events(id,data,source_sha,imported_at) VALUES(?,?,?,?)", (event_id, packed(event), sha, now())).rowcount
        summary = {**preview.get("summary", {}), "inserted_units": inserted, "inserted_events": inserted_events,
                   "protected_units": protected, "unchanged_units": unchanged, "source_sha256": sha, "already_imported": False}
        db.execute("INSERT INTO imports VALUES(?,?,?,?,?,?)", (sha, meta.get("source_filename"), packed(summary), packed(issues), now(), actor["id"] if actor else None))
        self.audit(db, actor, "initial_import" if initial else "import_commit", "import", sha, after=summary)
        return summary

    def import_view(self, db, user):
        rows = db.execute("SELECT * FROM imports ORDER BY imported_at DESC, rowid DESC").fetchall()
        units = [u for u in self.scoped_units(db, user) if u["review_required"]]
        issues = []
        for row in rows:
            for issue in unpacked(row["issues"], []):
                code = issue.get("code")
                if (code and code.split("-")[0] in user["towers"]) or (not code and set(user["towers"]) == set(TOWERS)):
                    issues.append(issue)
        seen = set()
        issues = [i for i in issues if not (str(i.get("id", packed(i))) in seen or seen.add(str(i.get("id", packed(i)))))]
        summary = {"total_units": len(self.scoped_units(db, user)), "review_required": len(units), "issue_count": len(issues),
                   "latest_import_at": rows[0]["imported_at"] if rows else None, "source_filename": rows[0]["filename"] if rows else None}
        if rows and set(user["towers"]) == set(TOWERS):
            summary = {**unpacked(rows[0]["summary"], {}), **summary}
        return {"summary": summary, "issues": issues, "units": units, "meta": {"source_filename": summary["source_filename"], "imported_at": summary["latest_import_at"]}}

    def backup_file(self):
        folder = self.db_path.parent / "backups"
        folder.mkdir(exist_ok=True)
        try:
            os.chmod(folder, 0o700)
        except OSError:
            pass
        target = folder / ("before-import-" + datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(4) + ".sqlite3")
        source = self.connect()
        dest = sqlite3.connect(target)
        try:
            source.backup(dest)
        finally:
            source.close()
            dest.close()
        os.chmod(target, 0o600)
        return target

    def filter_units(self, units, filters):
        result = units
        for key in ("tower", "status", "view"):
            value = filters.get(key)
            if value and value != "all":
                result = [u for u in result if u.get(key) == value]
        q = str(filters.get("q", "")).strip().upper()
        if q:
            result = [u for u in result if q in u["code"].upper()]
        area = filters.get("area")
        if area and area != "all":
            if isinstance(area, str) and "-" in area:
                parts = area.split("-", 1)
                low = number_field(parts[0], "area") or 0
                high = number_field(parts[1], "area") or float("inf")
                result = [u for u in result if u.get("area") is not None and low <= float(u["area"]) <= high]
            else:
                numeric = number_field(area, "area")
                result = [u for u in result if u.get("area") is not None and abs(float(u["area"]) - numeric) < 0.01]
        for name, compare in (("floor_min", lambda a, b: a >= b), ("floor_max", lambda a, b: a <= b)):
            if filters.get(name) not in (None, ""):
                target = number_field(filters[name], name)
                result = [u for u in result if compare(u["floor"], target)]
        band = filters.get("band")
        if band and band != "all":
            bands = {"low": (1, 10), "mid": (11, 20), "high": (21, 100), "1-10": (1, 10), "11-20": (11, 20), "21+": (21, 100)}
            if band in bands:
                lower, upper = bands[band]
                result = [u for u in result if lower <= u["floor"] <= upper]
            elif isinstance(band, str) and re.fullmatch(r"\d{1,2}-\d{1,2}", band):
                lower, upper = map(int, band.split("-"))
                result = [u for u in result if lower <= u["floor"] <= upper]
            else:
                fail(400, "نطاق الطوابق غير صالح.")
        if filters.get("review") == "required":
            result = [u for u in result if u["review_required"]]
        elif filters.get("review") == "verified":
            result = [u for u in result if not u["review_required"]]
        return result

    def ai_query(self, db, user, payload):
        operation = payload.get("operation")
        filters = payload.get("filters") or {}
        if not isinstance(filters, dict):
            fail(400, "فلاتر المساعد غير صالحة.")
        allowed_filters = {
            "available_units": {"tower", "view", "area", "floor_min", "floor_max"},
            "my_reservations": {"tower"}, "pending_cancellations": {"tower"},
            "sales_comparison": {"tower"}, "activity_summary": {"tower", "from", "to"},
        }
        if operation not in allowed_filters:
            fail(400, "عملية المساعد غير مدعومة.", "AI_OPERATION_NOT_ALLOWED")
        if set(filters) - allowed_filters[operation]:
            fail(400, "هذا الاستعلام لا يدعم بعض الفلاتر المطلوبة.", "AI_FILTER_NOT_ALLOWED")
        if filters.get("tower") not in (None, "", "all"):
            self.tower_scope(user, filters["tower"])
        units = self.filter_units(self.scoped_units(db, user), filters)
        codes = {u["code"] for u in units}
        reservations = [r for r in self.scoped_reservations(db, user) if r["unit_code"] in codes]
        refs, rows, totals = [], [], {}
        if operation == "available_units":
            rows = [{k: u.get(k) for k in ("code", "tower", "floor", "area", "view", "price_per_m2")} for u in units if u["status"] == "available" and not u["review_required"]]
            title = "الوحدات المتاحة والمعتمدة"
            summary = "عدد الوحدات المطابقة الجاهزة للحجز: " + str(len(rows))
            totals = {"units": len(rows)}
            refs = [{"type": "unit", "id": r["code"]} for r in rows]
        elif operation == "my_reservations":
            rows = [{k: r.get(k) for k in ("id", "unit_code", "status", "created_at")} for r in reservations if r["created_by"] == user["id"]]
            title = "حجوزاتي"
            summary = "الحجوزات المرتبطة بحسابك ضمن الفلاتر: " + str(len(rows))
            totals = {"reservations": len(rows), "active": sum(r["status"] == "active" for r in rows)}
            refs = [{"type": "reservation", "id": r["id"]} for r in rows]
        elif operation == "pending_cancellations":
            requests = [r for r in self.scoped_requests(db, user) if r["status"] == "pending" and r["unit_code"] in codes]
            rows = [{k: r.get(k) for k in ("id", "reservation_id", "unit_code", "created_at", "status")} for r in requests]
            title = "طلبات الإلغاء المعلقة" if user["role"] == "manager" else "طلبات الإلغاء الخاصة بي"
            summary = "عدد الطلبات بانتظار اعتماد المدير: " + str(len(rows))
            totals = {"pending": len(rows)}
            refs = [{"type": "cancellation", "id": r["id"]} for r in rows]
        elif operation == "sales_comparison":
            self.require_manager(user)
            rows = [{"tower": tower, "sold": sum(u["tower"] == tower and u["status"] == "sold" and not u["review_required"] for u in units),
                     "reserved": sum(u["tower"] == tower and u["status"] == "reserved" and not u["review_required"] for u in units),
                     "awaiting_review": sum(u["tower"] == tower and u["review_required"] for u in units)} for tower in user["towers"] if filters.get("tower", "all") in ("all", tower, None, "")]
            title = "مقارنة الحالات المعتمدة بين الأبراج"
            summary = "المباع والحجوزات معروضان منفصلين. السجلات المحتاجة للمراجعة لا تُحتسب كمبيعات معتمدة."
            totals = {"sold": sum(r["sold"] for r in rows), "reserved": sum(r["reserved"] for r in rows), "awaiting_review": sum(r["awaiting_review"] for r in rows)}
            refs = [{"type": "tower", "id": r["tower"]} for r in rows]
        elif operation == "activity_summary":
            date_from = filters.get("from") or datetime.now(BAGHDAD).strftime("%Y-%m-01")
            date_to = filters.get("to") or datetime.now(BAGHDAD).strftime("%Y-%m-%d")
            for value in (date_from, date_to):
                try:
                    datetime.strptime(value, "%Y-%m-%d")
                except (ValueError, TypeError):
                    fail(400, "صيغة التاريخ المطلوبة YYYY-MM-DD.")
            if date_from > date_to:
                fail(400, "تاريخ البداية بعد تاريخ النهاية.")
            utc_start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=BAGHDAD).astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
            utc_end = (datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=BAGHDAD) + timedelta(days=1)).astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
            ids = self.managed_ids(db, user)
            events = [dict(r) for r in db.execute("SELECT * FROM audit WHERE created_at>=? AND created_at<? ORDER BY id DESC", (utc_start, utc_end))
                      if r["actor_id"] in ids and (r["tower"] in user["towers"] or r["tower"] is None)
                      and (not filters.get("tower") or filters["tower"] == "all" or r["tower"] == filters["tower"])]
            counts = {}
            for event in events:
                counts[event["action"]] = counts.get(event["action"], 0) + 1
            rows = [{"action": action, "count": count} for action, count in sorted(counts.items())]
            totals = {"events": len(events), "from": date_from, "to": date_to, "timezone": "Asia/Baghdad"}
            title = "ملخص النشاط المسجل في النظام"
            summary = "الفترة من " + date_from + " إلى " + date_to + ". يشمل سجل الإجراءات الفعلي؛ الحركات القديمة المستوردة محفوظة في التاريخ منفصلة."
            refs = [{"type": "audit", "id": event["id"]} for event in events]
        else:
            fail(400, "عملية المساعد غير مدعومة.", "AI_OPERATION_NOT_ALLOWED")
        return {"title": title, "as_of": now(), "summary": summary, "rows": rows, "totals": totals, "source_refs": refs}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "GoldenCity/1.0"

    @property
    def app(self):
        return self.server.app

    def log_message(self, fmt, *args):
        # No query strings, bodies, client records, passwords or cookies in logs.
        sys.stderr.write("%s %s %s\n" % (now(), self.command, self.path.split("?")[0]))

    def headers_common(self, cache=None):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        # الافتراض no-store لأن أغلب ما يمرّ هنا بياناتُ حجوزات وعملاء لا تُخزَّن
        # على القرص. الاستثناء الوحيد أصولٌ ثابتة كبيرة يُمرَّر لها cache صراحةً.
        self.send_header("Cache-Control", cache or "no-store")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com https://cdn-lfs.huggingface.co https://cdn.jsdelivr.net; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")

    def respond(self, status=200, data=None, content_type="application/json; charset=utf-8", filename=None, cache=None):
        content = packed(data).encode("utf-8") if not isinstance(data, bytes) else data
        self.send_response(status)
        self.headers_common(cache)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        if filename:
            self.send_header("Content-Disposition", 'attachment; filename="' + filename + '"')
        if getattr(self, "set_cookie", None):
            self.send_header("Set-Cookie", self.set_cookie)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def cookie(self, token, expired=False):
        flags = "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + ("0" if expired else str(SESSION_HOURS * 3600))
        if self.app.secure_cookie:
            flags += "; Secure"
        self.set_cookie = "gc_session=" + token + flags

    def origin_check(self):
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        if not host or any(char in host for char in ("/", "\\", "@", " ", ",")):
            fail(400, "عنوان الخادم غير صالح.")
        if origin and origin not in ("http://" + host, "https://" + host):
            fail(403, "مصدر الطلب غير مسموح.", "ORIGIN_REJECTED")
        if self.headers.get("Sec-Fetch-Site") == "cross-site" and not (
            self.command in ("GET", "HEAD") and urlsplit(self.path).path in ("/", "/index.html")
            and self.headers.get("Sec-Fetch-Mode") == "navigate"
            and self.headers.get("Sec-Fetch-Dest") == "document"
        ):
            fail(403, "طلب من موقع خارجي غير مسموح.", "ORIGIN_REJECTED")

    def session(self, db, create=False):
        token = None
        try:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            if "gc_session" in cookie:
                token = cookie["gc_session"].value
        except Exception:
            pass
        row, user = None, None
        if token and len(token) < 256:
            digest = hashlib.sha256(token.encode()).hexdigest()
            row = db.execute("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?", (digest, time.time())).fetchone()
            if row and row["user_id"]:
                account = db.execute("SELECT * FROM users WHERE id=?", (row["user_id"],)).fetchone()
                if not account or not account["active"] or account["revision"] != row["user_revision"]:
                    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest,))
                    row = None
                else:
                    user = self.app.user(account)
        if not row and create:
            token = secrets.token_urlsafe(32)
            digest = hashlib.sha256(token.encode()).hexdigest()
            db.execute("INSERT INTO sessions VALUES(?,NULL,?,NULL,?)", (digest, secrets.token_urlsafe(24), time.time() + SESSION_HOURS * 3600))
            self.cookie(token)
            row = db.execute("SELECT * FROM sessions WHERE token_hash=?", (digest,)).fetchone()
            db.execute("DELETE FROM sessions WHERE expires_at<?", (time.time(),))
        return row, user

    def login_session(self, db, user_id, old_session=None):
        if old_session:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (old_session["token_hash"],))
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        db.execute("INSERT INTO sessions VALUES(?,?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user_id, csrf, user["revision"], time.time() + SESSION_HOURS * 3600))
        self.cookie(token)
        return {"user": self.app.user(user), "csrf": csrf, "setup_required": False}

    def read_body(self, raw=False):
        if self.headers.get("Transfer-Encoding"):
            fail(400, "ترميز نقل غير مدعوم.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            fail(400, "حجم طلب غير صالح.")
        if length < 0 or length > (MAX_UPLOAD if raw else 1024 * 1024):
            self.close_connection = True
            fail(413, "حجم الملف أكبر من الحد المسموح (10 ميغابايت)." if raw else "الطلب أكبر من الحد المسموح.")
        data = self.rfile.read(length)
        if raw:
            return data
        try:
            result = json.loads(data or b"{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            fail(400, "صيغة JSON غير صالحة.")
        if not isinstance(result, dict):
            fail(400, "محتوى الطلب يجب أن يكون كائناً.")
        return result

    def check_csrf(self, session):
        csrf = self.headers.get("X-CSRF-Token", "")
        if not session or not csrf or not hmac.compare_digest(csrf, session["csrf"]):
            fail(403, "انتهت صلاحية النموذج أو رمز الحماية غير صحيح. حدّث الصفحة.", "CSRF_REQUIRED")

    def do_GET(self):
        self.handle_request()

    def do_HEAD(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def do_PATCH(self):
        self.handle_request()

    def do_PUT(self):
        self.respond(405, {"error": "طريقة الطلب غير مدعومة."})

    def do_DELETE(self):
        self.respond(405, {"error": "الحذف غير مسموح؛ السجلات محفوظة للتدقيق."})

    def handle_request(self):
        self.set_cookie = None
        try:
            self.origin_check()
            parsed = urlsplit(self.path)
            path = unquote(parsed.path)
            if not path.startswith("/api/"):
                if self.command not in ("GET", "HEAD"):
                    fail(405, "طريقة غير مدعومة.")
                return self.serve_static(path)
            if self.command == "HEAD":
                fail(405, "طريقة غير مدعومة لواجهة البيانات.")
            params = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
            raw = path == "/api/import/preview" and self.command == "POST"
            payload = self.read_body(raw=raw) if self.command in ("POST", "PATCH") else {}
            with self.app.connect() as db:
                session, user = self.session(db, create=path == "/api/session" and self.command == "GET")
                if path == "/api/session" and self.command == "GET":
                    return self.respond(data={"user": user, "csrf": session["csrf"], "setup_required": self.app.setup_required(db)})
                if self.command in ("POST", "PATCH"):
                    self.check_csrf(session)
                if path in ("/api/setup", "/api/login") and self.command == "POST":
                    return self.auth(path, payload, session)
                if not user:
                    fail(401, "يرجى تسجيل الدخول.", "AUTH_REQUIRED")
            if self.command == "GET":
                return self.get_api(path, params, user)
            if path == "/api/import/preview" and self.command == "POST":
                return self.import_preview(user, payload)
            if path == "/api/import/commit" and self.command == "POST":
                self.app.require_manager(user)
                self.app.backup_file()
            with self.app.transaction() as db:
                # Re-authorize inside the same transaction as every mutation.
                fresh_session, fresh_user = self.session(db)
                if not fresh_user:
                    fail(401, "انتهت الجلسة أو تغيّرت صلاحيات الحساب.")
                self.check_csrf(fresh_session)
                result = self.mutate(db, path, payload, fresh_user, fresh_session)
            return self.respond(data=result)
        except APIError as exc:
            self.respond(exc.status, {"error": exc.error, **({"code": exc.code} if exc.code else {})})
        except sqlite3.IntegrityError:
            self.respond(409, {"error": "تعارض في السجل؛ ربما تغيّرت الوحدة أو استُخدم الاسم. حدّث البيانات ثم حاول مجدداً.", "code": "CONFLICT"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            sys.stderr.write(now() + " internal error: " + type(exc).__name__ + "\n")
            self.respond(500, {"error": "تعذّر إكمال الطلب. لم يُعتمد أي تغيير غير مكتمل.", "code": "INTERNAL_ERROR"})

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        allowed = {"/index.html", "/app.js", "/style.css", "/ai.js", "/ops3d.js", "/theme.js", "/favicon.svg"}
        is_vendor = path.startswith("/vendor/") and all(part not in ("", ".", "..") for part in path[1:].split("/")) and Path(path).suffix in (".js", ".mjs", ".wasm", ".woff2", ".woff", ".json")
        # مجسّمات الأبراج لغرفة العمليات: ملفات ثابتة للقراءة فقط، بنفس قيود المسار
        is_model = path.startswith("/models/") and all(part not in ("", ".", "..") for part in path[1:].split("/")) and Path(path).suffix in (".glb", ".png")
        if path not in allowed and not is_vendor and not is_model:
            fail(404, "الملف غير موجود.")
        target = (ROOT / "static" / path.lstrip("/")).resolve()
        if not target.is_relative_to((ROOT / "static").resolve()) or not target.is_file():
            fail(404, "الملف غير موجود.")
        mime = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png"}.get(target.suffix, "application/octet-stream")
        # مجسّمات الأبراج وحدها تُخزَّن: خمسة عشر ميغابايت تُحمَّل في كل زيارة بلا
        # ذلك. وهي أصول ثابتة لا تحمل بيانات عملاء، فتخزينها لا يخالف سبب no-store.
        # أما الواجهة فتبقى بلا تخزين حتى يظهر كل نشر فوراً.
        heavy = target.suffix in (".glb", ".woff2", ".woff", ".wasm")
        cache = "public, max-age=31536000, immutable" if heavy else None
        self.respond(data=target.read_bytes(), content_type=mime, cache=cache)

    def auth(self, path, payload, session):
        app = self.app
        address = self.client_address[0]
        username = text_field(payload, "username", True, 80).lower()
        password = payload.get("password", "")
        if not re.fullmatch(r"[a-zA-Z0-9_.-]{3,80}", username):
            fail(400, "اسم الدخول: 3 أحرف إنكليزية أو أرقام على الأقل، ويمكن استخدام . _ -")
        with app.rate_lock:
            attempts = app.login_attempts.get(address, [])
            attempts = [t for t in attempts if t > time.time() - 300]
            app.login_attempts[address] = attempts
            if len(attempts) >= 10:
                fail(429, "محاولات دخول كثيرة. انتظر خمس دقائق ثم حاول.")
            attempts.append(time.time())
        with app.transaction() as db:
            if path == "/api/setup":
                host = urlsplit("http://" + self.headers.get("Host", "")).hostname
                if not ipaddress.ip_address(address).is_loopback or host not in ("127.0.0.1", "localhost", "::1"):
                    fail(403, "إنشاء أول مدير متاح محلياً من جهاز الخادم فقط.")
                if not app.setup_required(db):
                    fail(409, "تم إعداد حساب المدير بالفعل.")
                token = text_field(payload, "token", True, 200)
                if not app.setup_token or not hmac.compare_digest(token, app.setup_token):
                    fail(403, "رمز الإعداد غير صحيح. استخدم الرمز الظاهر في شاشة تشغيل الخادم.")
                name = text_field(payload, "name", True, 120)
                password_hash = hash_password(password)
                user_id = db.execute("INSERT INTO users(name,username,password_hash,role,towers,created_at) VALUES(?,?,?,'manager',?,?)", (name, username, password_hash, packed(list(TOWERS)), now())).lastrowid
                user = app.user(db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
                app.audit(db, user, "manager_setup", "user", user_id, after=user)
                result = self.login_session(db, user_id, session)
            else:
                row = db.execute("SELECT * FROM users WHERE username=? COLLATE NOCASE", (username,)).fetchone()
                valid = verify_password(password, row["password_hash"] if row else app.dummy_password_hash)
                if not row or not valid or not row["active"]:
                    fail(401, "اسم المستخدم أو كلمة المرور غير صحيحة، أو الحساب معطّل.")
                result = self.login_session(db, row["id"], session)
                app.audit(db, result["user"], "login", "user", row["id"])
        if path == "/api/setup":
            app.setup_token = None
        with app.rate_lock:
            app.login_attempts.pop(address, None)
        self.respond(data=result)

    def get_api(self, path, params, user):
        app = self.app
        with app.connect() as db:
            # Keep read authorization and data in one consistent snapshot.
            db.execute("BEGIN")
            _, current_user = self.session(db)
            if not current_user:
                fail(401, "انتهت الجلسة أو تغيّرت صلاحيات الحساب.")
            user = current_user
            if path == "/api/bootstrap":
                units = app.scoped_units(db, user)
                result = {"user": user, "units": units, "reservations": app.scoped_reservations(db, user), "requests": app.scoped_requests(db, user),
                          "notifications": [dict(r) for r in db.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100", (user["id"],))],
                          "stats": app.stats(units), "import_summary": app.import_view(db, user)["summary"] if user["role"] == "manager" else {"review_required": sum(u["review_required"] for u in units)}}
            elif path.startswith("/api/units/"):
                code = path[len("/api/units/"):]
                row = app.get_unit(db, user, code)
                current = app.current_reservation(db, code)
                can_read = current and app.can_read_reservation(db, user, current)
                history = []
                if user["role"] == "manager" or can_read:
                    for event in db.execute("SELECT * FROM audit WHERE entity_id=? OR (entity_type='reservation' AND entity_id IN (SELECT CAST(id AS TEXT) FROM reservations WHERE unit_code=?)) ORDER BY id DESC LIMIT 100", (code, code)):
                        if event["actor_id"] in app.managed_ids(db, user) or (user["role"] == "manager" and event["actor_id"] is None):
                            history.append(self.audit_record(event))
                result = {"unit": app.unit(db, user, row), "reservation": app.reservation(current) if can_read else None, "history": history}
            elif path == "/api/users":
                app.require_manager(user)
                legacy_names = {}
                for reservation in app.scoped_reservations(db, user):
                    label = reservation.get("salesperson_name")
                    if reservation["legacy"] and reservation["created_by"] is None and label:
                        legacy_names[label] = legacy_names.get(label, 0) + 1
                result = {"users": [app.user(r) for r in db.execute("SELECT * FROM users WHERE id=? OR manager_id=? ORDER BY id", (user["id"], user["id"]))],
                          "legacy_salespeople": [{"name": name, "count": count} for name, count in sorted(legacy_names.items())]}
            elif path in ("/api/reviews", "/api/import/preview"):
                app.require_manager(user)
                result = app.import_view(db, user)
            elif path == "/api/audit":
                app.require_manager(user)
                ids = app.managed_ids(db, user)
                result = {"events": [self.audit_record(r) for r in db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 2000")
                                     if (r["tower"] in user["towers"] and (r["actor_id"] in ids or r["actor_id"] is None)) or (r["tower"] is None and r["actor_id"] in ids)]}
            elif path == "/api/history":
                app.require_manager(user)
                result = {"events": self.source_history(db, user)}
            elif path in ("/api/export", "/api/backup"):
                app.require_manager(user)
                units = app.scoped_units(db, user)
                if path == "/api/backup":
                    result = {"format": "golden-city-authorized-backup-v1", "exported_at": now(), "scope": user["towers"],
                              "units": units, "reservations": app.scoped_reservations(db, user), "requests": app.scoped_requests(db, user),
                              "users": [app.user(r) for r in db.execute("SELECT * FROM users WHERE id=? OR manager_id=?", (user["id"], user["id"]))],
                              "source_events": self.source_history(db, user), "import_review": app.import_view(db, user)}
                    return self.respond(data=packed(result).encode(), filename="golden-city-authorized-backup.json")
                scope = params.get("scope", "all")
                if scope not in ("all", "results"):
                    fail(400, "نطاق التصدير غير صالح.")
                if scope == "results":
                    units = app.filter_units(units, params)
                if params.get("format", "json") == "csv":
                    output = io.StringIO(newline="")
                    fields = ("code", "tower", "floor", "pos", "area", "view", "status", "review_required", "price_per_m2", "allocation")
                    writer = csv.writer(output)
                    writer.writerow(fields)
                    for unit in units:
                        writer.writerow([self.csv_safe(unit.get(field)) for field in fields])
                    return self.respond(data=("\ufeff" + output.getvalue()).encode(), content_type="text/csv; charset=utf-8", filename="golden-city-" + scope + ".csv")
                if params.get("format", "json") != "json":
                    fail(400, "صيغة التصدير غير مدعومة.")
                code_set = {u["code"] for u in units}
                result = {"exported_at": now(), "scope": scope, "towers": user["towers"], "filters": params if scope == "results" else {}, "units": units,
                          "reservations": [r for r in app.scoped_reservations(db, user) if r["unit_code"] in code_set], "stats": app.stats(units)}
                return self.respond(data=packed(result).encode(), filename="golden-city-" + scope + ".json")
            else:
                fail(404, "المسار غير موجود.")
        self.respond(data=result)

    @staticmethod
    def csv_safe(value):
        if value is None:
            return ""
        text = str(value)
        return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else text

    @staticmethod
    def audit_record(row):
        result = dict(row)
        result["before"] = unpacked(result.pop("before_json"), None)
        result["after"] = unpacked(result.pop("after_json"), None)
        return result

    def source_history(self, db, user):
        events = []
        for row in db.execute("SELECT data FROM source_events ORDER BY rowid DESC"):
            event = unpacked(row["data"])
            codes = event.get("unit_codes", [])
            scoped = [code for code in codes if code.split("-")[0] in user["towers"]]
            if not scoped and not (not codes and set(user["towers"]) == set(TOWERS)):
                continue
            if len(scoped) != len(codes):
                event = {k: v for k, v in event.items() if k != "raw"}
            event["unit_codes"] = scoped
            events.append(event)
        return events

    def import_preview(self, user, binary):
        self.app.require_manager(user)
        if not binary:
            fail(400, "اختر ملف Excel بصيغة XLSX.")
        try:
            with zipfile.ZipFile(io.BytesIO(binary)) as archive:
                entries = archive.infolist()
                if len(entries) > 2000 or sum(e.file_size for e in entries) > 80 * 1024 * 1024:
                    fail(400, "أرشيف Excel يتجاوز الحجم المسموح بعد الفك.")
                if any(e.flag_bits & 1 or e.file_size > 30 * 1024 * 1024 or e.file_size / max(1, e.compress_size) > 1000 for e in entries):
                    fail(400, "أرشيف Excel مضغوط أو مشفّر بصورة غير مدعومة.")
                if "xl/workbook.xml" not in archive.namelist():
                    fail(400, "الملف ليس مصنف XLSX صالحاً.")
        except zipfile.BadZipFile:
            fail(400, "تعذّر قراءة ملف XLSX. البيانات الحالية محفوظة.")
        try:
            from importer import parse_workbook
            with tempfile.TemporaryDirectory(prefix="golden-city-import-") as folder:
                path = Path(folder) / "upload.xlsx"
                path.write_bytes(binary)
                preview = parse_workbook(path)
        except APIError:
            raise
        except Exception:
            fail(400, "تعذّر تحليل المصنف. تحقق من أسماء الأوراق وبنية المصدر؛ لم تتغير البيانات الحالية.")
        preview.setdefault("meta", {})["source_filename"] = Path(unquote(self.headers.get("X-Filename", "uploaded-workbook.xlsx"))).name[:160]
        preview["meta"]["source_sha256"] = hashlib.sha256(binary).hexdigest()
        preview_id = secrets.token_urlsafe(24)
        with self.app.transaction() as db:
            fresh_session, fresh_user = self.session(db)
            if not fresh_user:
                fail(401, "انتهت الجلسة أثناء تحليل الملف.")
            self.app.require_manager(fresh_user)
            self.check_csrf(fresh_session)
            changes = []
            for source in preview.get("units", []):
                unit = self.app.validate_source_unit(source)
                if unit["tower"] not in fresh_user["towers"]:
                    continue
                current = db.execute("SELECT * FROM units WHERE code=?", (unit["code"],)).fetchone()
                if not current:
                    changes.append({"code": unit["code"], "kind": "new", "message": "سجل جديد سيُضاف مع حالة المراجعة المصدرية."})
                else:
                    old = unpacked(current["data"])
                    fields = [k for k in ("status", "area", "view", "price_per_m2", "client_name", "client_phone", "allocation") if old.get(k) != unit.get(k)]
                    protected = current["live_touched"] or current["manual_review"] or fields
                    changes.append({"code": unit["code"], "kind": "protected" if protected else "unchanged", "fields": fields,
                                    "message": "لن تُستبدل البيانات الحالية؛ الاختلاف محفوظ للمراجعة." if protected else "مطابق؛ لا يتكرر السجل."})
            db.execute("INSERT INTO import_previews VALUES(?,?,?,?,?)", (preview_id, preview["meta"]["source_sha256"], fresh_user["id"], packed(preview), now()))
            already = bool(db.execute("SELECT 1 FROM imports WHERE sha=?", (preview["meta"]["source_sha256"],)).fetchone())
        scoped_issues = [issue for issue in preview.get("issues", []) if (issue.get("code") and issue["code"].split("-")[0] in fresh_user["towers"]) or (not issue.get("code") and set(fresh_user["towers"]) == set(TOWERS))]
        summary = preview.get("summary", {}) if set(fresh_user["towers"]) == set(TOWERS) else {"total_units": len(changes), "issue_count": len(scoped_issues)}
        self.respond(data={"preview_id": preview_id, "summary": {**summary, "already_imported": already}, "issues": scoped_issues, "changes": changes})

    def mutate(self, db, path, payload, user, session):
        app = self.app
        if path == "/api/logout" and self.command == "POST":
            app.audit(db, user, "logout", "user", user["id"])
            db.execute("DELETE FROM sessions WHERE token_hash=?", (session["token_hash"],))
            self.cookie("", expired=True)
            return {"ok": True}
        if path == "/api/reservations" and self.command == "POST":
            return self.book(db, user, payload)
        match = re.fullmatch(r"/api/reservations/(\d+)/(cancel-request|sell)", path)
        if match and self.command == "POST":
            return self.reservation_action(db, user, int(match[1]), match[2], payload)
        match = re.fullmatch(r"/api/cancellations/(\d+)/decision", path)
        if match and self.command == "POST":
            return self.cancellation_decision(db, user, int(match[1]), payload)
        if path == "/api/users" and self.command == "POST":
            return self.create_user(db, user, payload)
        match = re.fullmatch(r"/api/users/(\d+)", path)
        if match and self.command == "PATCH":
            return self.edit_user(db, user, int(match[1]), payload)
        match = re.fullmatch(r"/api/users/(\d+)/link-legacy", path)
        if match and self.command == "POST":
            app.require_manager(user)
            employee = db.execute("SELECT * FROM users WHERE id=? AND manager_id=? AND role='employee'", (int(match[1]), user["id"])).fetchone()
            if not employee:
                fail(404, "الموظف غير موجود ضمن إدارتك.")
            label = text_field(payload, "salesperson_name", True, 120)
            reason = text_field(payload, "reason", True, 2000)
            towers = set(unpacked(employee["towers"])) & set(user["towers"])
            linked = []
            for reservation in db.execute("SELECT * FROM reservations WHERE legacy=1 AND created_by IS NULL AND salesperson_name=? AND status IN ('active','sold')", (label,)).fetchall():
                unit = db.execute("SELECT tower FROM units WHERE code=?", (reservation["unit_code"],)).fetchone()
                if unit and unit["tower"] in towers:
                    db.execute("UPDATE reservations SET created_by=? WHERE id=?", (employee["id"], reservation["id"]))
                    linked.append(reservation["id"])
                    app.audit(db, user, "legacy_owner_linked", "reservation", reservation["id"], before={"created_by": None, "salesperson_name": label},
                              after={"created_by": employee["id"], "salesperson_name": label}, reason=reason, tower=unit["tower"])
            return {"linked": len(linked), "reservation_ids": linked, "user": app.user(employee)}
        match = re.fullmatch(r"/api/units/([^/]+)/(review|update)", path)
        if match and self.command == "POST":
            return self.review_unit(db, user, match[1], match[2], payload)
        if path == "/api/import/commit" and self.command == "POST":
            app.require_manager(user)
            preview_id = text_field(payload, "preview_id", True, 100)
            row = db.execute("SELECT * FROM import_previews WHERE id=? AND actor_id=?", (preview_id, user["id"])).fetchone()
            if not row:
                fail(404, "معاينة الاستيراد غير موجودة أو تابعة لحساب آخر.")
            summary = app.ingest(db, unpacked(row["data"]), user)
            return {"summary": summary}
        if path == "/api/ai/query" and self.command == "POST":
            return app.ai_query(db, user, payload)
        fail(404, "المسار غير موجود أو طريقة الطلب غير صحيحة.")

    def book(self, db, user, payload):
        app = self.app
        key, digest, previous = app.idempotent_existing(db, user, "book", payload)
        if previous:
            # A repeated request returns the actual current state, not a stale success.
            r = app.get_reservation(db, user, previous["reservation"]["id"])
            return {"reservation": app.reservation(r), "replayed": True}
        code = text_field(payload, "unit_code", True, 40)
        client = text_field(payload, "client_name", True, 200)
        phone = text_field(payload, "client_phone", True, 80)
        if not re.fullmatch(r"[+\d٠-٩۰-۹() .-]{6,40}", phone):
            fail(400, "أدخل رقم هاتف صالحاً من 6 إلى 40 رمزاً.")
        notes = text_field(payload, "notes", False, 2000)
        unit = app.get_unit(db, user, code)
        if unit["review_required"]:
            fail(409, "الوحدة تحتاج اعتماد المدير قبل الحجز.", "REVIEW_REQUIRED")
        if unit["status"] != "available" or app.current_reservation(db, code):
            fail(409, "تغيّرت حالة الوحدة ولم تعد متاحة للحجز.", "UNIT_UNAVAILABLE")
        data = unpacked(unit["data"])
        if not data.get("area") or data.get("view") not in ("int", "ext"):
            fail(409, "بيانات الوحدة الهندسية غير مكتملة.")
        reservation_id = db.execute("INSERT INTO reservations(unit_code,client_name,client_phone,created_by,salesperson_name,created_at,status,notes,price_per_m2) VALUES(?,?,?,?,?,?,'active',?,?)",
                                    (code, client, phone, user["id"], user["name"], now(), notes, data.get("price_per_m2"))).lastrowid
        app.update_unit(db, unit, data, status="reserved", live=True)
        reservation = app.reservation(db.execute("SELECT * FROM reservations WHERE id=?", (reservation_id,)).fetchone())
        app.audit(db, user, "reservation_created", "reservation", reservation_id, after=reservation, tower=unit["tower"])
        result = {"reservation": reservation}
        app.save_idempotency(db, user, "book", key, digest, result)
        return result

    def reservation_action(self, db, user, reservation_id, action, payload):
        app = self.app
        reservation = app.get_reservation(db, user, reservation_id)
        unit = app.get_unit(db, user, reservation["unit_code"])
        reason = text_field(payload, "reason", True, 2000)
        if action == "sell":
            app.require_manager(user)
            if reservation["status"] != "active" or unit["status"] != "reserved":
                fail(409, "الحجز لم يعد فعالاً؛ لا يمكن اعتماده كمبيع.")
            if unit["review_required"]:
                fail(409, "اعتمد بيانات الوحدة قبل تحويل الحجز إلى بيع.")
            before = app.reservation(reservation)
            db.execute("UPDATE reservations SET status='sold',version=version+1 WHERE id=?", (reservation_id,))
            db.execute("UPDATE cancellations SET status='stale',decision_reason='تحوّل الحجز إلى بيع معتمد',decided_by=?,decided_at=? WHERE reservation_id=? AND status='pending'", (user["id"], now(), reservation_id))
            app.update_unit(db, unit, unpacked(unit["data"]), status="sold", live=True)
            after = app.reservation(db.execute("SELECT * FROM reservations WHERE id=?", (reservation_id,)).fetchone())
            app.audit(db, user, "sale_approved", "reservation", reservation_id, before=before, after=after, reason=reason, tower=unit["tower"])
            app.notify(db, reservation["created_by"], "sale", "اعتمد المدير بيع الوحدة " + unit["code"], reservation_id)
            return {"reservation": after}
        key, digest, previous = app.idempotent_existing(db, user, "cancel-request:" + str(reservation_id), payload)
        if previous:
            current = db.execute("SELECT * FROM cancellations WHERE id=?", (previous["request"]["id"],)).fetchone()
            return {"request": app.cancellation(db, current), "replayed": True}
        if reservation["status"] != "active":
            fail(409, "يمكن طلب إلغاء الحجز الفعال فقط. المبيعات تحتاج إجراءً إدارياً منفصلاً.")
        pending = db.execute("SELECT * FROM cancellations WHERE reservation_id=? AND status='pending'", (reservation_id,)).fetchone()
        if pending:
            fail(409, "يوجد طلب إلغاء معلق لهذا الحجز بالفعل.", "PENDING_REQUEST_EXISTS")
        request_id = db.execute("INSERT INTO cancellations(reservation_id,unit_code,reservation_version,requested_by,reason,created_at) VALUES(?,?,?,?,?,?)",
                                (reservation_id, reservation["unit_code"], reservation["version"], user["id"], reason, now())).lastrowid
        request = app.cancellation(db, db.execute("SELECT * FROM cancellations WHERE id=?", (request_id,)).fetchone())
        app.audit(db, user, "cancellation_requested", "cancellation", request_id, after=request, reason=reason, tower=unit["tower"])
        manager_id = user["id"] if user["role"] == "manager" else user["manager_id"]
        app.notify(db, manager_id, "approval", "طلب إلغاء جديد للوحدة " + unit["code"], request_id)
        result = {"request": request}
        app.save_idempotency(db, user, "cancel-request:" + str(reservation_id), key, digest, result)
        return result

    def cancellation_decision(self, db, user, request_id, payload):
        app = self.app
        app.require_manager(user)
        row = db.execute("SELECT * FROM cancellations WHERE id=?", (request_id,)).fetchone()
        if not row:
            fail(404, "طلب الإلغاء غير موجود.")
        reservation = app.get_reservation(db, user, row["reservation_id"])
        unit = app.get_unit(db, user, row["unit_code"])
        decision = payload.get("decision")
        if decision not in ("approve", "reject"):
            fail(400, "اختر الموافقة أو الرفض.")
        reason = text_field(payload, "reason", decision == "reject", 2000)
        if row["status"] != "pending":
            fail(409, "الطلب حُسم مسبقاً أو لم يعد صالحاً.", "REQUEST_NOT_PENDING")
        if reservation["status"] != "active" or reservation["version"] != row["reservation_version"] or unit["status"] != "reserved":
            # The request is visibly stale; keep this state and return success with status.
            db.execute("UPDATE cancellations SET status='stale',decision_reason=?,decided_by=?,decided_at=? WHERE id=?", ("تغيّر الحجز؛ يتطلب طلباً جديداً", user["id"], now(), request_id))
            app.audit(db, user, "cancellation_stale", "cancellation", request_id, before=dict(row), reason="تغيّر الحجز", tower=unit["tower"])
            return {"request": app.cancellation(db, db.execute("SELECT * FROM cancellations WHERE id=?", (request_id,)).fetchone()), "message": "لم يُلغَ الحجز لأن الطلب أصبح غير صالح."}
        status = "approved" if decision == "approve" else "rejected"
        db.execute("UPDATE cancellations SET status=?,decision_reason=?,decided_by=?,decided_at=? WHERE id=?", (status, reason, user["id"], now(), request_id))
        if decision == "approve":
            db.execute("UPDATE reservations SET status='cancelled',version=version+1 WHERE id=?", (reservation["id"],))
            data = unpacked(unit["data"])
            # Do not make uncertain imported geometry bookable after cancellation.
            target = "unknown" if unit["review_required"] else "available"
            app.update_unit(db, unit, data, status=target, live=True)
        after = app.cancellation(db, db.execute("SELECT * FROM cancellations WHERE id=?", (request_id,)).fetchone())
        app.audit(db, user, "cancellation_" + status, "cancellation", request_id, before=dict(row), after=after, reason=reason or row["reason"], tower=unit["tower"])
        app.notify(db, row["requested_by"], "decision", ("تمت الموافقة على إلغاء حجز " if decision == "approve" else "رُفض طلب إلغاء حجز ") + unit["code"], request_id)
        return {"request": after}

    def create_user(self, db, user, payload):
        app = self.app
        app.require_manager(user)
        if payload.get("role", "employee") != "employee":
            fail(403, "يمكن إضافة موظفين تابعين فقط من هذه الشاشة.")
        if payload.get("manager_id") not in (None, user["id"]):
            fail(403, "الموظف الجديد يجب أن يتبع مديره الحالي.")
        name = text_field(payload, "name", True, 120)
        username = text_field(payload, "username", True, 80).lower()
        if not re.fullmatch(r"[a-z0-9_.-]{3,80}", username):
            fail(400, "اسم دخول غير صالح؛ استخدم الأحرف الإنكليزية والأرقام و . _ -")
        towers = self.valid_towers(payload.get("towers"), user)
        password_hash = hash_password(payload.get("password"))
        employee_id = db.execute("INSERT INTO users(name,username,password_hash,role,manager_id,towers,created_at) VALUES(?,?,?,'employee',?,?,?)", (name, username, password_hash, user["id"], packed(towers), now())).lastrowid
        result = app.user(db.execute("SELECT * FROM users WHERE id=?", (employee_id,)).fetchone())
        app.audit(db, user, "employee_created", "user", employee_id, after=result)
        return {"user": result}

    def valid_towers(self, towers, user):
        if not isinstance(towers, list) or not towers or any(not isinstance(t, str) or t not in user["towers"] for t in towers):
            fail(400, "اختر برجاً واحداً على الأقل ضمن نطاق المدير.")
        return [tower for tower in TOWERS if tower in set(towers)]

    def edit_user(self, db, user, user_id, payload):
        app = self.app
        app.require_manager(user)
        current = db.execute("SELECT * FROM users WHERE id=? AND manager_id=? AND role='employee'", (user_id, user["id"])).fetchone()
        if not current:
            fail(404, "يمكن تعديل حسابات الموظفين التابعين لك فقط.")
        allowed = {"name", "active", "password", "towers"}
        if set(payload) - allowed:
            fail(403, "لا يمكن تغيير الدور أو المدير أو هوية الحساب عبر هذا الإجراء.")
        before = app.user(current)
        name = text_field(payload, "name", True, 120) if "name" in payload else current["name"]
        active = payload.get("active", bool(current["active"]))
        if not isinstance(active, bool):
            fail(400, "قيمة تفعيل الحساب غير صالحة.")
        towers = self.valid_towers(payload["towers"], user) if "towers" in payload else unpacked(current["towers"])
        password_hash = hash_password(payload["password"]) if "password" in payload else current["password_hash"]
        revoke = any(field in payload for field in ("password", "active", "towers"))
        db.execute("UPDATE users SET name=?,active=?,towers=?,password_hash=?,revision=revision+? WHERE id=?", (name, int(active), packed(towers), password_hash, int(revoke), user_id))
        if revoke:
            db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        result = app.user(db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
        app.audit(db, user, "employee_updated", "user", user_id, before=before, after={**result, "password_changed": "password" in payload})
        return {"user": result}

    def review_unit(self, db, user, code, action, payload):
        app = self.app
        app.require_manager(user)
        unit = app.get_unit(db, user, code)
        data = unpacked(unit["data"])
        before = dict(data)
        reason = text_field(payload, "reason", True, 2000)
        current = app.current_reservation(db, code)
        if current and not app.can_read_reservation(db, user, current):
            fail(403, "الحجز الحالي خارج نطاق إدارتك.")
        if action == "update":
            if set(payload) - {"price_per_m2", "notes", "reason"}:
                fail(400, "التعديل مخصص لسعر المتر والملاحظات فقط.")
            if "price_per_m2" in payload:
                data["price_per_m2"] = number_field(payload["price_per_m2"], "price_per_m2")
            if "notes" in payload:
                data["notes"] = text_field(payload, "notes", False, 2000)
            app.update_unit(db, unit, data, live=True)
            app.audit(db, user, "unit_updated", "unit", code, before=before, after=data, reason=reason, tower=unit["tower"])
            return {"unit": app.unit(db, user, app.get_unit(db, user, code))}
        desired = payload.get("status", unit["status"])
        if desired not in STATUSES or desired == "unknown":
            fail(400, "للاعتماد اختر حالة معلومة؛ اترك الوحدة قيد المراجعة إذا لم تُحسم.")
        area = number_field(payload.get("area", data.get("area")), "area", optional=desired == "hidden", maximum=10000)
        if desired != "hidden" and (not area or area < 10):
            fail(400, "المساحة المعتمدة يجب أن تكون بين 10 و10000 م².")
        view = payload.get("view", data.get("view"))
        if desired != "hidden" and view not in ("int", "ext"):
            fail(400, "اختر الإطلالة الداخلية أو الخارجية.")
        if desired != "hidden" and (unit["floor"] < 1 or unit["floor"] > (29 if unit["tower"].startswith("A") else 35) or unit["pos"] < 1 or unit["pos"] > (4 if unit["tower"].startswith("A") else 6)):
            fail(400, "كود الطابق أو الموضع غير معتمد هندسياً. لا يمكن إتاحته قبل تصحيح المصدر.")
        if current:
            expected = "reserved" if current["status"] == "active" else "sold"
            if desired != expected:
                fail(409, "لا يمكن تغيير حالة حجز قائم من شاشة المراجعة. استخدم طلب الإلغاء أو اعتماد البيع.", "USE_RESERVATION_WORKFLOW")
        price = number_field(payload.get("price_per_m2", data.get("price_per_m2")), "price_per_m2")
        allocation = payload.get("allocation", data.get("allocation", "unknown"))
        if allocation not in ("individual", "bulk", "unknown"):
            fail(400, "تخصيص الوحدة غير صالح.")
        data.update(area=area, view=view, price_per_m2=price, allocation=allocation, review_required=False,
                    review_resolved_at=now(), review_resolved_by=user["id"], review_reason=reason)
        if desired in ("reserved", "sold") and not current:
            client = text_field(payload, "client_name", True, 200)
            phone = text_field(payload, "client_phone", False, 80)
            salesperson = text_field(payload, "salesperson_name", False, 120) or data.get("salesperson_name")
            reservation_id = db.execute("INSERT INTO reservations(unit_code,client_name,client_phone,salesperson_name,created_at,status,notes,legacy,price_per_m2,deposit,source_date) VALUES(?,?,?,?,?,?,?,1,?,?,?)",
                                        (code, client, phone, salesperson, now(), "active" if desired == "reserved" else "sold", "اعتماد سجل مصدر: " + reason, price, data.get("deposit"), data.get("date"))).lastrowid
            app.audit(db, user, "legacy_reservation_confirmed", "reservation", reservation_id, after={"unit_code": code, "status": desired}, reason=reason, tower=unit["tower"])
        elif current:
            # Preserve reservation ownership and version while reviewing geometry. A
            # pending request remains valid; changing client identity is not allowed.
            if payload.get("client_name") and payload["client_name"].strip() != (current["client_name"] or ""):
                if not current["legacy"] or current["client_name"]:
                    fail(409, "لا يمكن استبدال هوية العميل في حجز قائم من مراجعة الوحدة.")
                if db.execute("SELECT 1 FROM cancellations WHERE reservation_id=? AND status='pending'", (current["id"],)).fetchone():
                    fail(409, "لا يمكن تعديل بيانات العميل أثناء انتظار قرار إلغاء الحجز.")
                db.execute("UPDATE reservations SET client_name=? WHERE id=?", (text_field(payload, "client_name", True, 200), current["id"]))
            if payload.get("client_phone") and payload["client_phone"].strip() != (current["client_phone"] or ""):
                if not current["legacy"] or current["client_phone"]:
                    fail(409, "لا يمكن استبدال هاتف العميل في حجز قائم من مراجعة الوحدة.")
                if db.execute("SELECT 1 FROM cancellations WHERE reservation_id=? AND status='pending'", (current["id"],)).fetchone():
                    fail(409, "لا يمكن تعديل بيانات العميل أثناء انتظار قرار إلغاء الحجز.")
                db.execute("UPDATE reservations SET client_phone=? WHERE id=?", (text_field(payload, "client_phone", False, 80), current["id"]))
        app.update_unit(db, unit, data, status=desired, reviewed=False, live=True)
        db.execute("UPDATE units SET manual_review=1 WHERE code=?", (code,))
        app.audit(db, user, "unit_reviewed", "unit", code, before=before, after=data, reason=reason, tower=unit["tower"])
        return {"unit": app.unit(db, user, app.get_unit(db, user, code))}


def create_server(app, host="127.0.0.1", port=8765):
    server = ThreadingHTTPServer((host, port), Handler)
    server.app = app
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description="Golden City private unit reservation server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "golden-city.sqlite3")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--no-bootstrap", action="store_true", help="Only for empty/disposable test databases")
    parser.add_argument("--secure-cookie", action="store_true", help="Set Secure cookies; required behind HTTPS")
    args = parser.parse_args()
    app = Application(args.db, args.data_dir, bootstrap=not args.no_bootstrap, secure_cookie=args.secure_cookie)
    server = create_server(app, args.host, args.port)
    print("Golden City: http://" + args.host + ":" + str(server.server_port), flush=True)
    with app.connect() as db:
        if app.setup_required(db):
            print("First manager setup: open http://127.0.0.1:" + str(server.server_port) + " on this server.", flush=True)
            print("One-time setup token: " + app.setup_token, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
