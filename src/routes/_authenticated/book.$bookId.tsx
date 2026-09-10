import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Check, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { retryGeneration, runGenerationStep } from "@/lib/books.functions";
import { useI18n, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/book/$bookId")({
  head: () => ({
    meta: [
      { title: "Génération du livre — Storybook" },
      { name: "description", content: "Suivez chaque étape de création de votre livre." },
      { property: "og:title", content: "Génération du livre — Storybook" },
      { property: "og:description", content: "Analyse, pages, illustrations, couvertures et narration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookPage,
});

const STEP_LABELS = {
  analysis: "stepAnalysis",
  pages: "stepPages",
  images: "stepImages",
  covers: "stepCovers",
  audio: "stepAudio",
} satisfies Record<"analysis" | "pages" | "images" | "covers" | "audio", TranslationKey>;

function BookPage() {
  const { bookId } = Route.useParams();
  const { t } = useI18n();
  const step = useServerFn(runGenerationStep);
  const retry = useServerFn(retryGeneration);
  const [running, setRunning] = useState(true);
  const busy = useRef(false);

  const { data, refetch } = useQuery({
    queryKey: ["book", bookId],
    queryFn: async () => {
      const [book, jobs, characters] = await Promise.all([
        supabase
          .from("books")
          .select("id, title, description, genre, status, total_pages, error, language")
          .eq("id", bookId)
          .maybeSingle(),
        supabase
          .from("generation_jobs")
          .select("type, status, progress, current_item, total_items, error")
          .eq("book_id", bookId),
        supabase.from("characters").select("id, name, age, appearance, personality").eq("book_id", bookId),
      ]);
      if (book.error) throw new Error(book.error.message);
      return {
        book: book.data,
        jobs: jobs.data ?? [],
        characters: characters.data ?? [],
      };
    },
  });

  const finished = data?.book?.status === "completed";
  const failed = data?.book?.status === "failed";

  const runLoop = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await step({ data: { bookId } });
      await refetch();
      if (result.done) {
        setRunning(false);
        if (result.jobType) toast.error(`${t("errorGeneric")} (${result.label})`);
      }
    } catch (error) {
      setRunning(false);
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      busy.current = false;
    }
  }, [bookId, refetch, step, t]);

  useEffect(() => {
    if (!running || finished || failed) return;
    const timer = window.setTimeout(() => void runLoop(), 300);
    return () => window.clearTimeout(timer);
  }, [running, finished, failed, runLoop, data]);

  const book = data?.book;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Link
          to="/library"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {t("backToLibrary")}
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl">{book?.title || t("newBook")}</h1>
            {book?.genre ? (
              <p className="mt-1 text-sm text-muted-foreground">{book.genre}</p>
            ) : null}
          </div>
          <Badge variant={failed ? "destructive" : "secondary"}>
            {t(`status_${book?.status ?? "pending"}` as TranslationKey)}
          </Badge>
        </div>

        {book?.description ? (
          <Card className="mt-6 shadow-soft">
            <CardHeader>
              <CardTitle className="font-display text-xl">{t("summary")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {book.description}
            </CardContent>
          </Card>
        ) : null}

        <section className="mt-6 space-y-3">
          {(["analysis", "pages", "images", "covers", "audio"] as const).map((type) => {
            const job = data?.jobs.find((j) => j.type === type);
            const progress = job?.progress ?? 0;
            return (
              <div key={type} className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {job?.status === "completed" ? (
                      <Check className="size-4 text-primary" />
                    ) : job?.status === "failed" ? (
                      <AlertTriangle className="size-4 text-destructive" />
                    ) : running ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Pause className="size-4 text-muted-foreground" />
                    )}
                    {t(STEP_LABELS[type])}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {job?.total_items
                      ? `${job.current_item}/${job.total_items} · ${progress}%`
                      : `${progress}%`}
                  </span>
                </div>
                <Progress value={progress} className="mt-3" />
                {job?.error ? (
                  <p className="mt-2 text-xs text-destructive">{job.error}</p>
                ) : null}
              </div>
            );
          })}
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          {!finished && !failed ? (
            <Button variant="outline" onClick={() => setRunning((value) => !value)}>
              {running ? <Pause className="size-4" /> : <Play className="size-4" />}
              {running ? t("pause") : t("resume")}
            </Button>
          ) : null}

          {failed ? (
            <Button
              onClick={async () => {
                await retry({ data: { bookId } });
                await refetch();
                setRunning(true);
              }}
            >
              <RotateCcw className="size-4" />
              {t("retry")}
            </Button>
          ) : null}

          {(book?.total_pages ?? 0) > 0 ? (
            <Button asChild>
              <Link to="/read/$bookId" params={{ bookId }}>
                <BookOpen className="size-4" />
                {t("openReader")}
              </Link>
            </Button>
          ) : null}
        </div>

        {data?.characters.length ? (
          <section className="mt-10">
            <h2 className="text-2xl">{t("charactersTitle")}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.characters.map((character) => (
                <li key={character.id} className="rounded-xl border border-border bg-card p-4">
                  <p className="font-medium">
                    {character.name}
                    {character.age ? ` · ${character.age}` : ""}
                  </p>
                  {character.appearance ? (
                    <p className="mt-1 text-xs text-muted-foreground">{character.appearance}</p>
                  ) : null}
                  {character.personality ? (
                    <p className="mt-1 text-xs text-muted-foreground">{character.personality}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
