export const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

export function requireApiKey(): string {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("MISSING_AI_KEY");
  return apiKey;
}

export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function framingFor(aspect: "portrait" | "square"): string {
  return aspect === "portrait"
    ? "Vertical portrait composition, 2:3 book-cover framing."
    : "Landscape illustration composition, 4:3 framing.";
}

export async function failFrom(prefix: string, response: Response): Promise<never> {
  const detail = await response.text().catch(() => "");
  throw new Error(`${prefix}_${response.status}:${detail.slice(0, 300)}`);
}
