/**
 * Pure text utilities shared by the generation pipeline.
 * No AI calls here: chunking must be deterministic and resumable.
 */

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

export type Segment = { start: number; end: number; text: string };

/**
 * Splits a long text into segments of at most `maxChars`, preferring paragraph
 * then sentence boundaries. Offsets are kept so each segment can be re-read
 * later without storing duplicated text.
 */
export function splitIntoSegments(text: string, maxChars = 9000): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    if (text.length - cursor <= maxChars) {
      segments.push({ start: cursor, end: text.length, text: text.slice(cursor) });
      break;
    }
    const window = text.slice(cursor, cursor + maxChars);
    let cut = window.lastIndexOf("\n\n");
    if (cut < maxChars * 0.4) {
      const sentence = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
        window.lastIndexOf(".\n"),
      );
      cut = sentence > maxChars * 0.3 ? sentence + 1 : maxChars;
    }
    const end = cursor + cut;
    segments.push({ start: cursor, end, text: text.slice(cursor, end).trim() });
    cursor = end;
  }

  return segments.filter((segment) => segment.text.length > 0);
}

/**
 * Splits one chapter's text into reader-sized pages, cutting on sentence
 * boundaries so no sentence is ever broken in half.
 */
export function splitIntoPages(text: string, targetChars = 900): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const pages: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) pages.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?…]+[.!?…]+["»”']?\s*|[^.!?…]+$/g) ?? [paragraph];
    for (const sentence of sentences) {
      if (current.length + sentence.length > targetChars * 1.35 && current.length > targetChars * 0.4) {
        push();
      }
      current += sentence;
      if (current.length >= targetChars) push();
    }
    if (current) current += "\n\n";
  }
  push();

  return pages.length > 0 ? pages : [text.trim()];
}

/**
 * Chapter size derived from the requested page count, so a 300-page request and
 * a 30-page request on the same text produce different page densities.
 */
export function charsPerPageFor(totalChars: number, targetPages: number): number {
  const safeTarget = Math.max(4, Math.min(targetPages, 1200));
  const raw = Math.round(totalChars / safeTarget);
  return Math.max(450, Math.min(raw, 2600));
}
