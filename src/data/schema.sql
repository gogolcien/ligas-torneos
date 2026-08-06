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

/* ---------------- Sistema de pareo suizo (/pareos) ---------------- */

CREATE TABLE IF NOT EXISTS pareo_tournaments (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pareo_players (
  id SERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES pareo_tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  seq INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pareo_rounds (
  id SERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES pareo_tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, round_number)
);

-- result: NULL (pendiente) | 'a_win' | 'b_win' | 'double_loss'
--         | 'bye_win' (AUTOWIN) | 'bye_loss' (AUTOLOSE)
-- player_b_id NULL significa que la fila es un AUTOWIN/AUTOLOSE.
CREATE TABLE IF NOT EXISTS pareo_matches (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES pareo_rounds(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES pareo_tournaments(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  player_a_id INTEGER NOT NULL REFERENCES pareo_players(id) ON DELETE CASCADE,
  player_b_id INTEGER REFERENCES pareo_players(id) ON DELETE CASCADE,
  result TEXT
);

CREATE INDEX IF NOT EXISTS idx_pareo_players_tournament ON pareo_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_pareo_rounds_tournament ON pareo_rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_pareo_matches_round ON pareo_matches(round_id);