CREATE TABLE redirect_history (
  version INTEGER PRIMARY KEY AUTOINCREMENT,
  redirect_id TEXT NOT NULL REFERENCES redirects(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX redirect_history_by_card ON redirect_history (redirect_id, version DESC);

-- The database only has each existing card's current destination at rollout.
INSERT INTO redirect_history (redirect_id, destination)
  SELECT id, destination FROM redirects;

CREATE TRIGGER redirects_insert_history AFTER INSERT ON redirects
BEGIN
  INSERT INTO redirect_history (redirect_id, destination) VALUES (NEW.id, NEW.destination);
END;

CREATE TRIGGER redirects_update_history AFTER UPDATE OF destination ON redirects
WHEN NEW.destination <> OLD.destination
BEGIN
  INSERT INTO redirect_history (redirect_id, destination) VALUES (NEW.id, NEW.destination);
END;
