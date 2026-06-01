-- Game visibility config: toggle games on/off from Supabase dashboard
CREATE TABLE IF NOT EXISTS public.game_config (
  game_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed all games (enabled by default)
INSERT INTO public.game_config (game_id, enabled) VALUES
  ('lieDetector', true),
  ('talentShow', true),
  ('standOut', true),
  ('numberGuessor', true),
  ('pieCharts', true),
  ('dealOrSteal', true),
  ('shadowProtocol', false),
  ('potLuck', true),
  ('chainLink', true),
  ('plotTwist', true)
ON CONFLICT (game_id) DO NOTHING;

-- Allow anyone to read (app needs to fetch config)
ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read game_config" ON public.game_config FOR SELECT USING (true);

-- Add is_admin flag to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
