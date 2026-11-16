CREATE TABLE manifest_entries (
  list        TEXT NOT NULL,
  bucket      TEXT NOT NULL,
  hash        TEXT NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (list, hash)
);
