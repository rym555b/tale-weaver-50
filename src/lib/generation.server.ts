import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { createLovableAudioProvider } from "./ai/lovable-audio.server";
import { createLovableImageProvider } from "./ai/lovable-image.server";
import { createLovableTextProvider } from "./ai/lovable-text.server";
import type { AudioProvider, ImageProvider, TextProvider } from "./ai/types";
import { uploadBookFile } from "./media.server";
import { charsPerPageFor, splitIntoPages, splitIntoSegments } from "./text-splitting";

export type Db = SupabaseClient<Database>;

export const JOB_ORDER = ["analysis", "pages", "images", "covers", "audio"] as const;
export type JobType = (typeof JOB_ORDER)[number];

export type StepResult = {
  done: boolean;
  jobType: JobType | null;
  label: string;
  progress: number;
};

type AnalysisResult = {
  bookTitle?: string;
  bookSummary?: string;
  genre?: string;
  chapterTitle?: string;
  chapterSummary?: string;
  characters?: Array<{
    name?: string;
    age?: string | number;
    appearance?: string;
    personality?: string;
    description?: string;
  }>;
};

const ANALYSIS_SYSTEM = `You are a book architect. You read one excerpt of a long story at a time and return STRICT JSON only, no prose, no markdown.
Schema:
{
  "bookTitle": string,
  "bookSummary": string,
  "genre": string,
  "chapterTitle": string,
  "chapterSummary": string,
  "characters": [ { "name": string, "age": string, "appearance": string, "personality": string, "description": string } ]
}
Rules:
- "chapterTitle"/"chapterSummary" describe ONLY this excerpt.
- "bookTitle"/"bookSummary"/"genre" describe the whole book as understood so far.
- "characters": only characters appearing in this excerpt. "appearance" must be a concrete, reusable visual description (hair, eyes, clothing) so illustrations stay consistent.
- Write all values in the requested output language.`;

const SCENE_SYSTEM = `You turn one page of a book into an illustration brief. Return STRICT JSON only, no prose, no markdown.
Schema:
{ "sceneDescription": string, "imagePrompt": string }
Rules:
- "sceneDescription" (1-2 sentences) names who is present, where, when and the mood of THIS page.
- "imagePrompt" is a single English prompt for an image model: subjects with their exact recurring appearance, setting, era, lighting, mood, composition, and the requested art style.
- Reuse verbatim the appearance details of the character bible so the same character looks identical on every page.
- No text, no letters, no speech bubbles, no watermark in the image. Never mention page numbers.
- Both values are always written in English, whatever the book language.`;

const COVER_SYSTEM = `You design book covers. Return STRICT JSON only: { "imagePrompt": string }.
The prompt is in English, describes one striking cover illustration (front) or a matching quieter back-cover illustration, keeps the main character's exact appearance, respects the requested art style, and contains NO text, letters or typography.`;

export function languageLabel(language: string): string {
  if (language === "en") return "English";
  if (language === "ar") return "Arabic (modern standard Arabic, right-to-left)";
  return "French";
}

function segmentsFor(book: { source_text: string }) {
  return splitIntoSegments(book.source_text, 9000);
}

async function failJob(db: Db, jobId: string, bookId: string, message: string) {
  await db
    .from("generation_jobs")
    .update({ status: "failed", error: message.slice(0, 500) })
    .eq("id", jobId);
  await db.from("books").update({ status: "failed", error: message.slice(0, 500) }).eq("id", bookId);
}

/** Runs exactly one unit of work for a book and persists the result. */
export async function runNextUnit(db: Db, bookId: string): Promise<StepResult> {
  const { data: book, error: bookError } = await db
    .from("books")
    .select("*")
    .eq("id", bookId)
    .maybeSingle();
  if (bookError) throw new Error(bookError.message);
  if (!book) throw new Error("BOOK_NOT_FOUND");

  const { data: jobs } = await db.from("generation_jobs").select("*").eq("book_id", bookId);
  const byType = new Map((jobs ?? []).map((job) => [job.type, job]));

  for (const type of JOB_ORDER) {
    const job = byType.get(type);
    if (!job || job.status === "completed") continue;
    if (job.status === "failed") {
      return { done: true, jobType: type, label: job.error ?? "failed", progress: job.progress };
    }

    try {
      if (type === "analysis") return await runAnalysisUnit(db, book, job);
      if (type === "pages") return await runPagesUnit(db, book, job);
      if (type === "images") return await runImagesUnit(db, book, job);
      if (type === "covers") return await runCoversUnit(db, book, job);
      return await runAudioUnit(db, book, job);
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      await failJob(db, job.id, bookId, message);
      return { done: true, jobType: type, label: message, progress: job.progress };
    }
  }

  await db.from("books").update({ status: "completed", error: null }).eq("id", bookId);
  return { done: true, jobType: null, label: "completed", progress: 100 };
}

type BookRow = Database["public"]["Tables"]["books"]["Row"];
type JobRow = Database["public"]["Tables"]["generation_jobs"]["Row"];
type PageRow = Database["public"]["Tables"]["pages"]["Row"];

async function runAnalysisUnit(db: Db, book: BookRow, job: JobRow): Promise<StepResult> {
  const segments = segmentsFor(book);
  const index = job.current_item;

  if (index >= segments.length) {
    await db
      .from("generation_jobs")
      .update({ status: "completed", progress: 100, total_items: segments.length })
      .eq("id", job.id);
    return { done: false, jobType: "analysis", label: "analysis", progress: 100 };
  }

  const segment = segments[index]!;
  const provider: TextProvider = createLovableTextProvider();

  const { data: knownCharacters } = await db
    .from("characters")
    .select("name, appearance, personality")
    .eq("book_id", book.id);

  const context = [
    `Output language: ${languageLabel(book.language)}.`,
    book.title ? `Known book title: ${book.title}` : "",
    book.description ? `Known summary: ${book.description}` : "",
    knownCharacters?.length
      ? `Known characters (reuse these appearances): ${knownCharacters
          .map((c) => `${c.name} — ${c.appearance ?? ""}`)
          .join(" | ")}`
      : "",
    `Excerpt ${index + 1} of ${segments.length}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await provider.generateJson<AnalysisResult>({
    system: ANALYSIS_SYSTEM,
    prompt: `${context}\n\n--- EXCERPT START ---\n${segment.text}\n--- EXCERPT END ---`,
  });

  const bookPatch: Partial<BookRow> = { status: "analyzing" };
  if (index === 0) {
    if (!book.title && result.bookTitle) bookPatch.title = result.bookTitle.slice(0, 200);
    if (result.bookSummary) bookPatch.description = result.bookSummary;
    if (result.genre) bookPatch.genre = result.genre.slice(0, 120);
  } else if (!book.description && result.bookSummary) {
    bookPatch.description = result.bookSummary;
  }
  await db.from("books").update(bookPatch).eq("id", book.id);

  await db.from("chapters").upsert(
    {
      book_id: book.id,
      chapter_number: index + 1,
      title: (result.chapterTitle ?? `Chapitre ${index + 1}`).slice(0, 200),
      summary: result.chapterSummary ?? null,
      source_start: segment.start,
      source_end: segment.end,
    },
    { onConflict: "book_id,chapter_number" },
  );

  const existing = new Set((knownCharacters ?? []).map((c) => c.name.toLowerCase()));
  const newCharacters = (result.characters ?? [])
    .filter((c) => c.name && !existing.has(c.name.toLowerCase()))
    .slice(0, 12)
    .map((c) => ({
      book_id: book.id,
      name: String(c.name).slice(0, 120),
      age: c.age != null ? String(c.age).slice(0, 40) : null,
      appearance: c.appearance ?? null,
      personality: c.personality ?? null,
      description: c.description ?? null,
    }));
  if (newCharacters.length > 0) await db.from("characters").insert(newCharacters);

  const nextItem = index + 1;
  const progress = Math.round((nextItem / segments.length) * 100);
  await db
    .from("generation_jobs")
    .update({
      status: nextItem >= segments.length ? "completed" : "processing",
      current_item: nextItem,
      total_items: segments.length,
      progress,
      error: null,
    })
    .eq("id", job.id);

  return { done: false, jobType: "analysis", label: "analysis", progress };
}

async function runPagesUnit(db: Db, book: BookRow, job: JobRow): Promise<StepResult> {
  const { data: chapters } = await db
    .from("chapters")
    .select("id, chapter_number, source_start, source_end")
    .eq("book_id", book.id)
    .order("chapter_number", { ascending: true });

  const list = chapters ?? [];
  if (list.length === 0) throw new Error("NO_CHAPTERS");

  const index = job.current_item;
  if (index >= list.length) {
    const { count } = await db
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("book_id", book.id);
    await db
      .from("generation_jobs")
      .update({ status: "completed", progress: 100, total_items: list.length })
      .eq("id", job.id);
    await db
      .from("books")
      .update({ total_pages: count ?? 0, error: null })
      .eq("id", book.id);
    return { done: false, jobType: "pages", label: "pages", progress: 100 };
  }

  const chapter = list[index]!;
  const chapterText = book.source_text
    .slice(chapter.source_start ?? 0, chapter.source_end ?? undefined)
    .trim();
  const perPage = charsPerPageFor(book.source_text.length, book.target_pages);
  const pageTexts = splitIntoPages(chapterText, perPage);

  const { data: lastPage } = await db
    .from("pages")
    .select("page_number")
    .eq("book_id", book.id)
    .order("page_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  let pageNumber = lastPage?.page_number ?? 0;

  const rows = pageTexts.map((text) => ({
    book_id: book.id,
    chapter_id: chapter.id,
    page_number: ++pageNumber,
    text,
    status: "pending",
  }));
  if (rows.length > 0) {
    const { error } = await db.from("pages").upsert(rows, { onConflict: "book_id,page_number" });
    if (error) throw new Error(error.message);
  }

  const nextItem = index + 1;
  const progress = Math.round((nextItem / list.length) * 100);
  await db
    .from("generation_jobs")
    .update({
      status: "processing",
      current_item: nextItem,
      total_items: list.length,
      progress,
      error: null,
    })
    .eq("id", job.id);
  await db
    .from("books")
    .update({ status: "paginating", total_pages: pageNumber })
    .eq("id", book.id);

  return { done: false, jobType: "pages", label: "pages", progress };
}

/* ------------------------------------------------------------------ */
/* Shared context used by every illustration and narration prompt      */
/* ------------------------------------------------------------------ */

async function characterBible(db: Db, bookId: string): Promise<string> {
  const { data } = await db
    .from("characters")
    .select("name, age, appearance, personality")
    .eq("book_id", bookId);
  if (!data?.length) return "No recurring character recorded yet.";
  return data
    .map(
      (c) =>
        `- ${c.name}${c.age ? ` (${c.age})` : ""}: ${c.appearance ?? "appearance unspecified"}${
          c.personality ? ` | ${c.personality}` : ""
        }`,
    )
    .join("\n");
}

function isFatal(message: string) {
  return message.includes("MISSING_AI_KEY") || message.startsWith("STORAGE_");
}

/** Builds (and stores) the scene + image prompt for one page. */
async function buildPagePrompt(db: Db, book: BookRow, page: PageRow, bible: string) {
  const provider = createLovableTextProvider();
  const { data: chapter } = page.chapter_id
    ? await db.from("chapters").select("title, summary").eq("id", page.chapter_id).maybeSingle()
    : { data: null };

  const result = await provider.generateJson<{ sceneDescription?: string; imagePrompt?: string }>({
    system: SCENE_SYSTEM,
    prompt: [
      `Book title: ${book.title || "untitled"}`,
      `Genre: ${book.genre ?? "unspecified"}`,
      `Book language (for understanding only): ${languageLabel(book.language)}`,
      `Art style requested: ${book.style}`,
      chapter?.title ? `Chapter: ${chapter.title}` : "",
      chapter?.summary ? `Chapter summary: ${chapter.summary}` : "",
      `Character bible:\n${bible}`,
      `--- PAGE ${page.page_number} TEXT ---\n${page.text.slice(0, 4000)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    maxOutputTokens: 900,
  });

  const imagePrompt =
    result.imagePrompt?.trim() ||
    `${book.style} illustration of: ${page.text.slice(0, 400)}. No text in the image.`;

  await db
    .from("pages")
    .update({
      scene_description: result.sceneDescription?.slice(0, 1000) ?? null,
      image_prompt: imagePrompt.slice(0, 4000),
    })
    .eq("id", page.id);

  return imagePrompt;
}

/** Generates + stores the illustration of one page. Throws on failure. */
export async function generatePageImage(
  db: Db,
  book: BookRow,
  page: PageRow,
  options: { reusePrompt?: boolean } = {},
) {
  const bible = await characterBible(db, book.id);
  const prompt =
    options.reusePrompt && page.image_prompt
      ? page.image_prompt
      : await buildPagePrompt(db, book, page, bible);

  await db.from("pages").update({ status: "generating_image", error: null }).eq("id", page.id);

  const images: ImageProvider = createLovableImageProvider();
  const { bytes, contentType } = await images.generateImage({
    prompt: `${prompt}\n\nArt style: ${book.style}. Consistent characters:\n${bible}`,
    aspect: "square",
  });

  const path = await uploadBookFile(
    `${book.id}/pages/${page.page_number}.png`,
    bytes,
    contentType,
  );

  await db
    .from("pages")
    .update({
      image_url: path,
      status: page.audio_url ? "completed" : "image_completed",
      error: null,
    })
    .eq("id", page.id);

  return path;
}

/** Generates + stores the narration of one page. Throws on failure. */
export async function generatePageAudio(db: Db, book: BookRow, page: PageRow) {
  await db.from("pages").update({ status: "generating_audio", error: null }).eq("id", page.id);

  const audio: AudioProvider = createLovableAudioProvider();
  const { bytes, contentType } = await audio.synthesize({
    text: page.text,
    voice: "alloy",
    instructions: `Read this page of a book aloud in ${languageLabel(book.language)}. Narration style: ${book.narration_style}. Calm storytelling pace, natural pauses at punctuation.`,
  });

  const path = await uploadBookFile(`${book.id}/audio/${page.page_number}.mp3`, bytes, contentType);

  await db
    .from("pages")
    .update({ audio_url: path, status: "completed", error: null })
    .eq("id", page.id);

  return path;
}

/** Generates + stores one cover. Throws on failure. */
export async function generateCover(db: Db, book: BookRow, side: "front" | "back") {
  const bible = await characterBible(db, book.id);
  const provider = createLovableTextProvider();

  const result = await provider.generateJson<{ imagePrompt?: string }>({
    system: COVER_SYSTEM,
    prompt: [
      `Cover side: ${side}`,
      `Title: ${book.title || "untitled"}`,
      `Genre: ${book.genre ?? "unspecified"}`,
      `Summary: ${book.description ?? ""}`.slice(0, 1500),
      `Art style requested: ${book.style}`,
      `Character bible:\n${bible}`,
      side === "front"
        ? "Front cover: bold, iconic, centred on the main character and the heart of the story."
        : "Back cover: quieter, atmospheric, with clear empty space where the summary text will be laid over.",
    ].join("\n"),
    maxOutputTokens: 700,
  });

  const prompt =
    result.imagePrompt?.trim() ||
    `${book.style} ${side} book cover illustration for "${book.title}". No text.`;

  const images = createLovableImageProvider();
  const { bytes, contentType } = await images.generateImage({ prompt, aspect: "portrait" });
  const path = await uploadBookFile(`${book.id}/cover/${side}.png`, bytes, contentType);

  await db
    .from("books")
    .update(side === "front" ? { cover_front_url: path } : { cover_back_url: path })
    .eq("id", book.id);

  return path;
}

/* ------------------------------------------------------------------ */
/* Job units: one page (or one cover) per call                         */
/* ------------------------------------------------------------------ */

async function pagesForMedia(db: Db, bookId: string) {
  const { data, error } = await db
    .from("pages")
    .select("*")
    .eq("book_id", bookId)
    .order("page_number", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function completeJob(db: Db, job: JobRow, total: number, type: JobType): Promise<StepResult> {
  await db
    .from("generation_jobs")
    .update({ status: "completed", progress: 100, total_items: total, current_item: total })
    .eq("id", job.id);
  return { done: false, jobType: type, label: type, progress: 100 };
}

async function runImagesUnit(db: Db, book: BookRow, job: JobRow): Promise<StepResult> {
  const pages = await pagesForMedia(db, book.id);
  const total = pages.length;
  if (job.current_item >= total) return completeJob(db, job, total, "images");

  const page = pages[job.current_item];
  if (!page) return completeJob(db, job, total, "images");

  await db.from("books").update({ status: "illustrating", error: null }).eq("id", book.id);

  try {
    if (!page.image_url) await generatePageImage(db, book, page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMAGE_FAILED";
    if (isFatal(message)) throw error;
    // One broken page never stops the book: mark it and move on.
    await db
      .from("pages")
      .update({ status: "failed", error: message.slice(0, 400) })
      .eq("id", page.id);
  }

  const done = job.current_item + 1;
  const progress = total > 0 ? Math.round((done / total) * 100) : 100;
  await db
    .from("generation_jobs")
    .update({
      status: done >= total ? "completed" : "processing",
      current_item: done,
      total_items: total,
      progress,
      error: null,
    })
    .eq("id", job.id);

  return { done: false, jobType: "images", label: "images", progress };
}

async function runCoversUnit(db: Db, book: BookRow, job: JobRow): Promise<StepResult> {
  const sides: Array<"front" | "back"> = ["front", "back"];
  const missing = sides.filter((side) =>
    side === "front" ? !book.cover_front_url : !book.cover_back_url,
  );
  if (missing.length === 0) return completeJob(db, job, 2, "covers");

  await db.from("books").update({ status: "covers", error: null }).eq("id", book.id);
  await generateCover(db, book, missing[0]!);

  const done = 2 - (missing.length - 1);
  const progress = Math.round((done / 2) * 100);
  await db
    .from("generation_jobs")
    .update({
      status: done >= 2 ? "completed" : "processing",
      current_item: done,
      total_items: 2,
      progress,
      error: null,
    })
    .eq("id", job.id);

  return { done: false, jobType: "covers", label: "covers", progress };
}

async function runAudioUnit(db: Db, book: BookRow, job: JobRow): Promise<StepResult> {
  if (!book.generate_audio) return completeJob(db, job, 0, "audio");

  const pages = await pagesForMedia(db, book.id);
  const total = pages.length;
  if (job.current_item >= total) return completeJob(db, job, total, "audio");

  const page = pages[job.current_item];
  if (!page) return completeJob(db, job, total, "audio");

  await db.from("books").update({ status: "narrating", error: null }).eq("id", book.id);

  try {
    if (!page.audio_url) await generatePageAudio(db, book, page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AUDIO_FAILED";
    if (isFatal(message)) throw error;
    await db
      .from("pages")
      .update({ status: "failed", error: message.slice(0, 400) })
      .eq("id", page.id);
  }

  const done = job.current_item + 1;
  const progress = total > 0 ? Math.round((done / total) * 100) : 100;
  await db
    .from("generation_jobs")
    .update({
      status: done >= total ? "completed" : "processing",
      current_item: done,
      total_items: total,
      progress,
      error: null,
    })
    .eq("id", job.id);

  return { done: false, jobType: "audio", label: "audio", progress };
}

/** Creates the jobs for a fresh book. */
export async function createJobsForBook(db: Db, bookId: string, sourceText: string) {
  const segments = splitIntoSegments(sourceText, 9000);
  const base = { status: "pending", total_items: 0, current_item: 0, progress: 0 };
  const { error } = await db.from("generation_jobs").upsert(
    [
      { book_id: bookId, type: "analysis", ...base, total_items: segments.length },
      { book_id: bookId, type: "pages", ...base },
      { book_id: bookId, type: "images", ...base },
      { book_id: bookId, type: "covers", ...base, total_items: 2 },
      { book_id: bookId, type: "audio", ...base },
    ],
    { onConflict: "book_id,type" },
  );
  if (error) throw new Error(error.message);
  return segments.length;
}
