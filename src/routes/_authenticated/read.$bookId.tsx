import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, List, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  getBookMedia,
  regenerateCoverImage,
  regeneratePageMedia,
} from "@/lib/books.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/read/$bookId")({
  head: () => ({
    meta: [
      { title: "Lecteur — Storybook" },
      { name: "description", content: "Lisez et écoutez votre livre illustré page par page." },
      { property: "og:title", content: "Lecteur — Storybook" },
      { property: "og:description", content: "Un lecteur pour vos livres illustrés et racontés." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReaderPage,
});

function ReaderPage() {
  const { bookId } = Route.useParams();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const loadMedia = useServerFn(getBookMedia);
  const regeneratePage = useServerFn(regeneratePageMedia);
  const regenerateCover = useServerFn(regenerateCoverImage);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["reader", bookId],
    queryFn: async () => {
      const [book, chapters, pages] = await Promise.all([
        supabase
          .from("books")
          .select("id, title, language, description, cover_front_url, cover_back_url")
          .eq("id", bookId)
          .maybeSingle(),
        supabase
          .from("chapters")
          .select("id, title, chapter_number")
          .eq("book_id", bookId)
          .order("chapter_number", { ascending: true }),
        supabase
          .from("pages")
          .select("id, page_number, text, image_url, audio_url, chapter_id, status, error")
          .eq("book_id", bookId)
          .order("page_number", { ascending: true }),
      ]);
      if (book.error) throw new Error(book.error.message);
      const media = await loadMedia({ data: { bookId } });
      return {
        book: book.data,
        chapters: chapters.data ?? [],
        pages: pages.data ?? [],
        media: media.urls,
      };
    },
  });

  const pages = data?.pages ?? [];
  const page = pages[Math.min(index, Math.max(pages.length - 1, 0))];
  const chapterTitle = useMemo(
    () => data?.chapters.find((chapter) => chapter.id === page?.chapter_id)?.title ?? "",
    [data?.chapters, page?.chapter_id],
  );

  const firstPageOfChapter = (chapterId: string) =>
    pages.findIndex((item) => item.chapter_id === chapterId);

  const signedUrl = (path: string | null) => (path ? data?.media[path] : undefined);

  // An Arabic book always reads right-to-left, whatever the interface language.
  const bookDir = data?.book?.language === "ar" ? "rtl" : "ltr";

  const redoPage = async (kind: "image" | "audio") => {
    if (!page) return;
    setRegenerating(kind);
    try {
      await regeneratePage({ data: { pageId: page.id, kind, keepPrompt: kind === "image" } });
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setRegenerating(null);
    }
  };

  const redoCover = async (side: "front" | "back") => {
    setRegenerating(side);
    try {
      await regenerateCover({ data: { bookId, side } });
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setRegenerating(null);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/book/$bookId"
            params={{ bookId }}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← {data?.book?.title || t("readBook")}
          </Link>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <List className="size-4" />
                {t("chapters")}
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{t("chapters")}</SheetTitle>
              </SheetHeader>
              <nav dir={bookDir} className="mt-4 space-y-1 overflow-y-auto px-4 pb-6">
                {(data?.chapters ?? []).map((chapter) => {
                  const target = firstPageOfChapter(chapter.id);
                  return (
                    <button
                      key={chapter.id}
                      disabled={target < 0}
                      onClick={() => target >= 0 && setIndex(target)}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-40"
                    >
                      <span className="text-muted-foreground">{chapter.chapter_number}.</span>{" "}
                      {chapter.title}
                    </button>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {isLoading ? (
          <p className="mt-16 text-center text-muted-foreground">…</p>
        ) : pages.length === 0 || !page ? (
          <p className="mt-16 text-center text-muted-foreground">{t("noPagesYet")}</p>
        ) : (
          <>
            {index === 0 && data?.book ? (
              <section className="mt-6 grid gap-4 sm:grid-cols-2">
                {(["front", "back"] as const).map((side) => {
                  const path = side === "front" ? data.book?.cover_front_url : data.book?.cover_back_url;
                  const coverUrl = signedUrl(path ?? null);
                  return (
                    <div key={side} className="space-y-2">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={side === "front" ? t("coverFront") : t("coverBack")}
                          className="aspect-[2/3] w-full rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[2/3] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                          {side === "front" ? t("coverFront") : t("coverBack")}
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={regenerating !== null}
                        onClick={() => void redoCover(side)}
                      >
                        {regenerating === side ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                        {side === "front" ? t("regenerateCoverFront") : t("regenerateCoverBack")}
                      </Button>
                    </div>
                  );
                })}
              </section>
            ) : null}

            <p className="mt-6 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {t("page")} {page.page_number} {t("of")} {pages.length}
              {chapterTitle ? ` · ${chapterTitle}` : ""}
            </p>

            <article className="page-surface mt-4 rounded-2xl p-6 sm:p-10">
              {signedUrl(page.image_url) ? (
                <img
                  src={signedUrl(page.image_url)}
                  alt={`${t("page")} ${page.page_number}`}
                  className="mb-6 aspect-[4/3] w-full rounded-xl object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="mb-6 flex aspect-[4/3] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                  <ImageOff className="size-4" />
                  {t("imageSoon")}
                </div>
              )}

              <div
                dir={bookDir}
                className={`prose-page font-display text-[1.15rem] ${bookDir === "rtl" ? "text-right" : ""}`}
              >
                {page.text}
              </div>

              {signedUrl(page.audio_url) ? (
                <audio controls src={signedUrl(page.audio_url)} className="mt-6 w-full" />
              ) : (
                <p className="mt-6 text-xs text-muted-foreground">{t("audioSoon")}</p>
              )}

              {page.error ? <p className="mt-4 text-xs text-destructive">{page.error}</p> : null}

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={regenerating !== null}
                  onClick={() => void redoPage("image")}
                >
                  {regenerating === "image" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  {regenerating === "image" ? t("regenerating") : t("regenerateImage")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={regenerating !== null}
                  onClick={() => void redoPage("audio")}
                >
                  {regenerating === "audio" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  {regenerating === "audio" ? t("regenerating") : t("regenerateAudio")}
                </Button>
              </div>
            </article>

            <Progress value={((index + 1) / pages.length) * 100} className="mt-6" />

            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft className="size-4" />
                {t("previous")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {index + 1} / {pages.length}
              </span>
              <Button
                disabled={index >= pages.length - 1}
                onClick={() => setIndex((value) => Math.min(pages.length - 1, value + 1))}
              >
                {t("next")}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
