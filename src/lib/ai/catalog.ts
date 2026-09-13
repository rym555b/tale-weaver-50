/**
 * Model catalogue shared by the UI and the server registry.
 *
 * Client-safe on purpose: it holds no keys and no request logic, only the
 * identifiers the user can pick from. Adding a model here + a builder in
 * `registry.server.ts` is all it takes to support a new provider.
 */

export const IMAGE_MODELS = [
  { id: "google/gemini-3-pro-image", label: "Gemini 3 Pro Image — qualité maximale" },
  { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image — rapide" },
  { id: "google/gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite Image — économique" },
  { id: "openai/gpt-image-2", label: "GPT Image 2 — style OpenAI" },
] as const;

export const AUDIO_MODELS = [
  { id: "openai/gpt-4o-mini-tts", label: "GPT-4o mini TTS — narration dirigeable" },
] as const;

export const AUDIO_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

export type ImageModelId = (typeof IMAGE_MODELS)[number]["id"];
export type AudioModelId = (typeof AUDIO_MODELS)[number]["id"];
export type AudioVoice = (typeof AUDIO_VOICES)[number];

export const DEFAULT_IMAGE_MODEL: ImageModelId = "google/gemini-3-pro-image";
export const DEFAULT_AUDIO_MODEL: AudioModelId = "openai/gpt-4o-mini-tts";
export const DEFAULT_AUDIO_VOICE: AudioVoice = "alloy";

export const IMAGE_MODEL_IDS = IMAGE_MODELS.map((model) => model.id);
export const AUDIO_MODEL_IDS = AUDIO_MODELS.map((model) => model.id);
