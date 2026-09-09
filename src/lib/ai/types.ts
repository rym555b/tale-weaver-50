/**
 * Provider abstraction layer.
 *
 * The generation pipeline only ever talks to these interfaces, so a provider
 * (text model, image model, text-to-speech) can be swapped without touching
 * the pipeline or the UI.
 */

export interface TextProvider {
  readonly id: string;
  /** Returns strictly-parsed JSON produced by the model. */
  generateJson<T>(args: { system: string; prompt: string; maxOutputTokens?: number }): Promise<T>;
}

export interface ImageProvider {
  readonly id: string;
  /** Returns raw image bytes plus its mime type. */
  generateImage(args: { prompt: string; aspect?: "portrait" | "square" }): Promise<{
    bytes: Uint8Array;
    contentType: string;
  }>;
}

export interface AudioProvider {
  readonly id: string;
  /** Returns raw audio bytes plus its mime type. */
  synthesize(args: { text: string; voice?: string; instructions?: string }): Promise<{
    bytes: Uint8Array;
    contentType: string;
  }>;
}
