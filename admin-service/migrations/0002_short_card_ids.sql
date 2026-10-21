-- Widen the accepted ID length while preserving every record and list revision.
CREATE TABLE redirects_short_ids (
  id TEXT PRIMARY KEY NOT NULL CHECK (
    length(id) BETWEEN 1 AND 32
    AND id NOT GLOB '*[^a-z0-9_-]*'
    AND substr(id, 1, 1) GLOB '[a-z0-9]'
    AND id NOT IN ('constructor', 'prototype', '__proto__')
  ),
  destination TEXT NOT NULL CHECK (length(destination) <= 2048 AND destination GLOB 'https://*'),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO redirects_short_ids (id, destination, status, created_at, updated_at)
  SELECT id, destination, status, created_at, updated_at FROM redirects;
DROP TABLE redirects;
ALTER TABLE redirects_short_ids RENAME TO redirects;

CREATE TRIGGER redirects_insert_revision AFTER INSERT ON redirects
BEGIN
  UPDATE redirect_state SET revision = revision + 1 WHERE singleton = 1;
END;
CREATE TRIGGER redirects_update_revision AFTER UPDATE ON redirects
BEGIN
  UPDATE redirect_state SET revision = revision + 1 WHERE singleton = 1;
END;
CREATE TRIGGER redirects_delete_revision AFTER DELETE ON redirects
BEGIN
  UPDATE redirect_state SET revision = revision + 1 WHERE singleton = 1;
END;
