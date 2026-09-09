import type { ImageProvider } from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/images/generations";
const MODEL = "google/gemini-3-pro-image";

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Image model backed by the Lovable AI Gateway. Non-streaming on purpose: the
 * caller is a background generation unit that stores the final file, so there
 * is no UI to render progressive frames into.
 */
export function createLovableImageProvider(): ImageProvider {
  return {
    id: `lovable:${MODEL}`,
    async generateImage({ prompt, aspect = "square" }) {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("MISSING_AI_KEY");

      const framing =
        aspect === "portrait"
          ? "Vertical portrait composition, 2:3 book-cover framing."
          : "Landscape illustration composition, 4:3 framing.";

      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: `${prompt}\n\n${framing}` }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`IMAGE_${response.status}:${detail.slice(0, 300)}`);
      }

      const payload = (await response.json()) as { data?: Array<{ b64_json?: string }> };
      const base64 = payload.data?.[0]?.b64_json;
      if (!base64) throw new Error("IMAGE_EMPTY_RESPONSE");

      return { bytes: decodeBase64(base64), contentType: "image/png" };
    },
  };
}
