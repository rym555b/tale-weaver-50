import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { createLovableTextProvider } from "./ai/lovable-text.server";
import type { TextProvider } from "./ai/types";
import { charsPerPageFor, splitIntoPages, splitIntoSegments } from "./text-splitting";

export type Db = SupabaseClient<Database>;

export const JOB_ORDER = ["analysis", "pages"] as const;
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
      return await runPagesUnit(db, book, job);
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
    `Output language: ${book.language === "en" ? "English" : "French"}.`,
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
      .update({ status: "completed", total_pages: count ?? 0, error: null })
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

/** Creates the jobs for a fresh book. */
export async function createJobsForBook(db: Db, bookId: string, sourceText: string) {
  const segments = splitIntoSegments(sourceText, 9000);
  const { error } = await db.from("generation_jobs").upsert(
    [
      {
        book_id: bookId,
        type: "analysis",
        status: "pending",
        total_items: segments.length,
        current_item: 0,
        progress: 0,
      },
      { book_id: bookId, type: "pages", status: "pending", total_items: 0, current_item: 0, progress: 0 },
    ],
    { onConflict: "book_id,type" },
  );
  if (error) throw new Error(error.message);
  return segments.length;
}
