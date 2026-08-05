CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  pin_salt TEXT,
  pin_hash TEXT,
  CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  top_n INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id SERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  deck TEXT,
  position INTEGER NOT NULL,
  points INTEGER NOT NULL,
  is_new BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_tournaments_league ON tournaments(league_id);
CREATE INDEX IF NOT EXISTS idx_participants_tournament ON participants(tournament_id);