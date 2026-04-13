-- Add username and password_hash columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE clients ADD CONSTRAINT clients_username_unique UNIQUE (username);
