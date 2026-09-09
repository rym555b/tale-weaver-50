import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateBookInput = z.object({
  title: z.string().max(200).optional(),
  sourceText: z.string().min(200, "TEXT_TOO_SHORT"),
  language: z.enum(["fr", "en"]).default("fr"),
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
 * Runs ONE unit of generation work (one excerpt analysed, or one chapter cut
 * into pages) and returns the new state. The client calls this repeatedly, so a
 * 300-page book never depends on a single long request and an interrupted run
 * simply resumes from the last saved step.
 */
export const runGenerationStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { runNextUnit } = await import("./generation.server");
    return runNextUnit(context.supabase, data.bookId);
  });

/** Puts a failed step back in the queue so generation continues where it stopped. */
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

    const { error } = await context.supabase
      .from("books")
      .update({ status: "pending", error: null })
      .eq("id", data.bookId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
