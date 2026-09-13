ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS image_model TEXT NOT NULL DEFAULT 'google/gemini-3-pro-image',
  ADD COLUMN IF NOT EXISTS audio_model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini-tts',
  ADD COLUMN IF NOT EXISTS audio_voice TEXT NOT NULL DEFAULT 'alloy';