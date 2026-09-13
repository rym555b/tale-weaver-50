import {
  AUDIO_MODEL_IDS,
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_IDS,
} from "./catalog";
import { createGeminiImageProvider } from "./providers/gemini-image.server";
import { createOpenAiAudioProvider } from "./providers/openai-audio.server";
import { createOpenAiImageProvider } from "./providers/openai-image.server";
import type { AudioProvider, ImageProvider } from "./types";

type ImageFactory = (model: string) => ImageProvider;
type AudioFactory = (model: string) => AudioProvider;

/**
 * Model id -> provider module. Each entry is an independent module, so adding
 * a vendor means adding one file plus one line here and in `catalog.ts`.
 */
const IMAGE_FACTORIES: Record<string, ImageFactory> = {
  "google/gemini-3-pro-image": createGeminiImageProvider,
  "google/gemini-3.1-flash-image": createGeminiImageProvider,
  "google/gemini-3.1-flash-lite-image": createGeminiImageProvider,
  "openai/gpt-image-2": createOpenAiImageProvider,
};

const AUDIO_FACTORIES: Record<string, AudioFactory> = {
  "openai/gpt-4o-mini-tts": createOpenAiAudioProvider,
};

export function resolveImageModel(model: string | null | undefined): string {
  return model && IMAGE_MODEL_IDS.includes(model as never) ? model : DEFAULT_IMAGE_MODEL;
}

export function resolveAudioModel(model: string | null | undefined): string {
  return model && AUDIO_MODEL_IDS.includes(model as never) ? model : DEFAULT_AUDIO_MODEL;
}

/** Returns the image provider for the model stored on the book. */
export function getImageProvider(model: string | null | undefined): ImageProvider {
  const id = resolveImageModel(model);
  return (IMAGE_FACTORIES[id] ?? createGeminiImageProvider)(id);
}

/** Returns the audio provider for the model stored on the book. */
export function getAudioProvider(model: string | null | undefined): AudioProvider {
  const id = resolveAudioModel(model);
  return (AUDIO_FACTORIES[id] ?? createOpenAiAudioProvider)(id);
}
