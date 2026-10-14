CREATE TABLE IF NOT EXISTS user_profile_photos (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 32 AND 5242880),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
