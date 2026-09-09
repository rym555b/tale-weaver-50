import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateBookInput = z.object({
  title: z.string().max(200).optional(),
  sourceText: z.string().min(200, "TEXT_TOO_SHORT"),
  language: z.enum(["fr", "en", "ar"]).default("fr"),
  style: z.string().max(60).default("watercolor"),
  narrationStyle: z.string().max(60).default("neutral"),
  targetPages: z.number().int().min(4).max(1200).default(40),
  generateAudio: z.boolean().default(false),
});

/** Creates the book row plus its generation jobs. No AI call happens here. */
export const createBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateBookInput.parse(input))
  .handler(async ({ data, context }) => {
    const { normalizeText } = await import("./text-splitting");
    const { createJobsForBook } = await import("./generation.server");

    const sourceText = normalizeText(data.sourceText);

    const { data: book, error } = await context.supabase
      .from("books")
      .insert({
        user_id: context.userId,
        title: data.title?.trim() ?? "",
        language: data.language,
        style: data.style,
        narration_style: data.narrationStyle,
        target_pages: data.targetPages,
        generate_audio: data.generateAudio,
        source_text: sourceText,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await createJobsForBook(context.supabase, book.id, sourceText);
    return { bookId: book.id };
  });

/**
 * Runs ONE unit of generation work (one excerpt analysed, one chapter paginated,
 * one illustration, one cover or one narration) and returns the new state. The
 * client calls this repeatedly, so a 300-page book never depends on a single
 * long request and an interrupted run resumes from the last saved step.
 */
export const runGenerationStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { runNextUnit } = await import("./generation.server");
    return runNextUnit(context.supabase, data.bookId);
  });

/** Puts failed steps and failed pages back in the queue so generation continues. */
export const retryGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error: jobError } = await context.supabase
      .from("generation_jobs")
      .update({ status: "pending", error: null })
      .eq("book_id", data.bookId)
      .eq("status", "failed");
    if (jobError) throw new Error(jobError.message);

    await context.supabase
      .from("pages")
      .update({ status: "pending", error: null })
      .eq("book_id", data.bookId)
      .eq("status", "failed");

    const { error } = await context.supabase
      .from("books")
      .update({ status: "pending", error: null })
      .eq("id", data.bookId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Regenerates exactly one illustration or narration, nothing else. */
export const regeneratePageMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pageId: z.string().uuid(),
        kind: z.enum(["image", "audio"]),
        keepPrompt: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { generatePageImage, generatePageAudio } = await import("./generation.server");
    const { signBookFiles } = await import("./media.server");

    const { data: page, error } = await context.supabase
      .from("pages")
      .select("*")
      .eq("id", data.pageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!page) throw new Error("PAGE_NOT_FOUND");

    const { data: book } = await context.supabase
      .from("books")
      .select("*")
      .eq("id", page.book_id)
      .maybeSingle();
    if (!book) throw new Error("BOOK_NOT_FOUND");

    const path =
      data.kind === "image"
        ? await generatePageImage(context.supabase, book, page, { reusePrompt: data.keepPrompt })
        : await generatePageAudio(context.supabase, book, page);

    const signed = await signBookFiles([path]);
    return { path, url: signed[path] ?? null };
  });

/** Regenerates one cover without touching the pages. */
export const regenerateCoverImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bookId: z.string().uuid(), side: z.enum(["front", "back"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { generateCover } = await import("./generation.server");
    const { signBookFiles } = await import("./media.server");

    const { data: book, error } = await context.supabase
      .from("books")
      .select("*")
      .eq("id", data.bookId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!book) throw new Error("BOOK_NOT_FOUND");

    const path = await generateCover(context.supabase, book, data.side);
    const signed = await signBookFiles([path]);
    return { path, url: signed[path] ?? null };
  });

/**
 * Turns stored file paths into temporary signed URLs the reader can display.
 * The bucket stays private; only the owner of the book gets links.
 */
export const getBookMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { signBookFiles } = await import("./media.server");

    const [{ data: book, error }, { data: pages }] = await Promise.all([
      context.supabase
        .from("books")
        .select("cover_front_url, cover_back_url")
        .eq("id", data.bookId)
        .maybeSingle(),
      context.supabase
        .from("pages")
        .select("image_url, audio_url")
        .eq("book_id", data.bookId),
    ]);
    if (error) throw new Error(error.message);
    if (!book) throw new Error("BOOK_NOT_FOUND");

    const paths = [
      book.cover_front_url,
      book.cover_back_url,
      ...(pages ?? []).flatMap((page) => [page.image_url, page.audio_url]),
    ].filter((value): value is string => Boolean(value));

    return { urls: await signBookFiles(paths) };
  });
