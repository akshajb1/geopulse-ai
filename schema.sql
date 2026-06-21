-- GeoPulse AI – PostgreSQL Database Schema
-- Run: psql -U postgres -c "CREATE DATABASE geopulse;" && psql -U postgres -d geopulse -f schema.sql

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    device_id   VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(255),
    interests   TEXT[]              NOT NULL DEFAULT '{}',
    latitude    DOUBLE PRECISION,
    longitude   DOUBLE PRECISION,
    push_token  VARCHAR(500),
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);

-- ── Places ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS places (
    id              SERIAL PRIMARY KEY,
    google_place_id VARCHAR(500) UNIQUE NOT NULL,
    name            VARCHAR(500)        NOT NULL,
    category        VARCHAR(255)        NOT NULL,
    address         TEXT,
    latitude        DOUBLE PRECISION    NOT NULL,
    longitude       DOUBLE PRECISION    NOT NULL,
    rating          DOUBLE PRECISION,
    photo_url       TEXT,
    is_open         BOOLEAN,
    cached_at       TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_places_google_place_id ON places(google_place_id);
CREATE INDEX IF NOT EXISTS idx_places_category        ON places(category);

-- ── Interactions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interactions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    place_id    INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('click', 'visit', 'save', 'dismiss')),
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_user_id  ON interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_place_id ON interactions(place_id);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp DESC);

-- ── Trigger: update users.updated_at automatically ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── Sample seed data (optional) ──────────────────────────────────────────────
-- INSERT INTO users(device_id, name, interests, latitude, longitude)
-- VALUES ('demo-device-001', 'Alex', '{"Cafe","Music","Nightlife"}', 37.7749, -122.4194);
