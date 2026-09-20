"""Railway entry point; credentials only initialize an empty account table."""
import os
import re
import signal
import threading
from pathlib import Path
from server import Application, TOWERS, create_server, hash_password, now, packed


def initialize(directory, username='', password='', recovery_id=''):
    app = Application(Path(directory) / 'golden-city.sqlite3', directory, bootstrap=False, secure_cookie=True)
    with app.transaction() as db:
        if app.setup_required(db):
            if db.execute('SELECT COUNT(*) FROM users').fetchone()[0]:
                raise ValueError('Existing accounts without a manager: restore a verified backup.')
            username = username.strip().lower()
            if not re.fullmatch(r'[a-z0-9_.-]{3,80}', username) or not 6 <= len(password) <= 256:
                raise ValueError('Set INITIAL_ADMIN_USERNAME (3-80 English characters) and INITIAL_ADMIN_PASSWORD (6-256 characters) in Railway Variables.')
            uid = db.execute("INSERT INTO users(name,username,password_hash,role,towers,created_at) VALUES(?,?,?,'manager',?,?)",
                ('المدير', username, hash_password(password), packed(list(TOWERS)), now())).lastrowid
            user = app.user(db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone())
            app.audit(db, user, 'manager_setup', 'user', uid, after=user)
    if recovery_id:
        if not re.fullmatch(r'[a-zA-Z0-9_.-]{1,80}', recovery_id):
            raise ValueError('Invalid ADMIN_RECOVERY_ID.')
        with app.transaction() as db:
            db.execute('CREATE TABLE IF NOT EXISTS admin_recoveries (id TEXT PRIMARY KEY, created_at TEXT NOT NULL)')
            if not db.execute('SELECT 1 FROM admin_recoveries WHERE id=?', (recovery_id,)).fetchone():
                username = username.strip().lower()
                if not re.fullmatch(r'[a-z0-9_.-]{3,80}', username):
                    raise ValueError('Set a valid INITIAL_ADMIN_USERNAME for recovery.')
                managers = db.execute("SELECT * FROM users WHERE role='manager'").fetchall()
                if len(managers) != 1:
                    raise ValueError('Recovery requires exactly one existing manager; no accounts were changed.')
                row = managers[0]
                if db.execute('SELECT 1 FROM users WHERE username=? COLLATE NOCASE AND id<>?', (username, row['id'])).fetchone():
                    raise ValueError('Recovery username belongs to another account.')
                password_hash = hash_password(password)
                before = app.user(row)
                db.execute('UPDATE users SET username=?,password_hash=?,active=1,revision=revision+1 WHERE id=?', (username, password_hash, row['id']))
                db.execute('DELETE FROM sessions WHERE user_id=?', (row['id'],))
                after = app.user(db.execute('SELECT * FROM users WHERE id=?', (row['id'],)).fetchone())
                app.audit(db, after, 'manager_recovery', 'user', row['id'], before=before, after=after, reason='Recovery requested through hosting environment')
                db.execute('INSERT INTO admin_recoveries VALUES(?,?)', (recovery_id, now()))
                print('Manager recovery completed; existing business data preserved.', flush=True)
    app.setup_token = None
    return app


def main():
    directory = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH')
    if not directory or not Path(directory).is_dir():
        raise SystemExit('Attach a Railway Volume at /data before starting. Persistent storage is required.')
    password = os.environ.pop('INITIAL_ADMIN_PASSWORD', '')
    app = initialize(directory, os.environ.get('INITIAL_ADMIN_USERNAME', ''), password, os.environ.get('ADMIN_RECOVERY_ID', ''))
    del password
    server = create_server(app, '0.0.0.0', int(os.environ.get('PORT', '8080')))
    def stop(signum, frame):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print('Golden City started with persistent storage and secure cookies.', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
