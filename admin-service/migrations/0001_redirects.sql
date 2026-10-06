CREATE TABLE IF NOT EXISTS redirect_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  seeded INTEGER NOT NULL DEFAULT 0 CHECK (seeded IN (0, 1))
);
INSERT OR IGNORE INTO redirect_state (singleton) VALUES (1);

CREATE TABLE IF NOT EXISTS redirects (
  id TEXT PRIMARY KEY NOT NULL CHECK (
    length(id) BETWEEN 3 AND 32
    AND id NOT GLOB '*[^a-z0-9_-]*'
    AND substr(id, 1, 1) GLOB '[a-z0-9]'
    AND id NOT IN ('constructor', 'prototype', '__proto__')
  ),
  destination TEXT NOT NULL CHECK (length(destination) <= 2048 AND destination GLOB 'https://*'),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER IF NOT EXISTS redirects_insert_revision AFTER INSERT ON redirects
BEGIN
  UPDATE redirect_state SET revision = revision + 1 WHERE singleton = 1;
END;
CREATE TRIGGER IF NOT EXISTS redirects_update_revision AFTER UPDATE ON redirects
BEGIN
  UPDATE redirect_state SET revision = revision + 1 WHERE singleton = 1;
END;
CREATE TRIGGER IF NOT EXISTS redirects_delete_revision AFTER DELETE ON redirects
BEGIN
  UPDATE redirect_state SET revision = revision + 1 WHERE singleton = 1;
END;
