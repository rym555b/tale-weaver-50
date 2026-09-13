import type { AudioProvider } from "../types";
import { GATEWAY_BASE, failFrom, requireApiKey } from "./shared.server";

/** OpenAI text-to-speech models on the Lovable AI Gateway. Returns mp3 bytes. */
export function createOpenAiAudioProvider(model: string): AudioProvider {
  return {
    id: `lovable:${model}`,
    async synthesize({ text, voice = "alloy", instructions }) {
      const apiKey = requireApiKey();

      const response = await fetch(`${GATEWAY_BASE}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          input: text.slice(0, 4000),
          voice,
          response_format: "mp3",
          ...(instructions ? { instructions } : {}),
        }),
      });

      if (!response.ok) await failFrom("AUDIO", response);

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) throw new Error("AUDIO_EMPTY_RESPONSE");
      return { bytes: new Uint8Array(buffer), contentType: "audio/mpeg" };
    },
  };
}
