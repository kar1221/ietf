ALTER TABLE messages
  ADD CONSTRAINT messages_identity_present
  CHECK (hash IS NOT NULL OR message_id IS NOT NULL);
