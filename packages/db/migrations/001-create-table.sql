CREATE TABLE messages (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list            TEXT NOT NULL,
  bucket          TEXT NOT NULL,
  hash            TEXT,
  message_id      TEXT,
  subject         TEXT NOT NULL DEFAULT '',
  from_name       TEXT NOT NULL DEFAULT '',
  from_address    TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL DEFAULT '',
  sent_at         TIMESTAMPTZ,
  in_reply_to     TEXT,
  reference       TEXT[],
  to_addrs        TEXT[],
  cc_addrs        TEXT[]
);

CREATE UNIQUE INDEX ux_msg_hash ON messages (list, hash)
  WHERE hash IS NOT NULL;

CREATE UNIQUE INDEX ux_msg_msgid ON messages (list, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX ix_msg_bucket ON messages (list, bucket);
