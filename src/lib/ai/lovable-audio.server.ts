import type { AudioProvider } from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/audio/speech";
const MODEL = "openai/gpt-4o-mini-tts";

/** Text-to-speech backed by the Lovable AI Gateway. Returns mp3 bytes. */
export function createLovableAudioProvider(): AudioProvider {
  return {
    id: `lovable:${MODEL}`,
    async synthesize({ text, voice = "alloy", instructions }) {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("MISSING_AI_KEY");

      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input: text.slice(0, 4000),
          voice,
          response_format: "mp3",
          ...(instructions ? { instructions } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`AUDIO_${response.status}:${detail.slice(0, 300)}`);
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) throw new Error("AUDIO_EMPTY_RESPONSE");
      return { bytes: new Uint8Array(buffer), contentType: "audio/mpeg" };
    },
  };
}
