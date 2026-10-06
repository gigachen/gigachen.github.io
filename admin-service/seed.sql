-- Initial import from the local database. Existing IDs are never overwritten.
INSERT INTO redirects (id, destination, status, created_at, updated_at) VALUES ('demo', 'https://github.com/gigachen/gigachen.github.io', 'active', '2026-10-06T13:36:43.097Z', '2026-10-06T13:36:43.097Z') ON CONFLICT(id) DO NOTHING;
INSERT INTO redirects (id, destination, status, created_at, updated_at) VALUES ('portfolio', 'https://francis-gunadi-portfolio.francis-gunadi108901.chatgpt.site/', 'active', '2026-10-06T13:36:43.097Z', '2026-10-06T13:36:43.097Z') ON CONFLICT(id) DO NOTHING;
UPDATE redirect_state SET seeded = 1 WHERE singleton = 1;
