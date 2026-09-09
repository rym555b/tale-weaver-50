import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, List } from "lucide-react";

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
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/read/$bookId")({
  component: ReaderPage,
});

function ReaderPage() {
  const { bookId } = Route.useParams();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["reader", bookId],
    queryFn: async () => {
      const [book, chapters, pages] = await Promise.all([
        supabase
          .from("books")
          .select("id, title, description, cover_front_url")
          .eq("id", bookId)
          .maybeSingle(),
        supabase
          .from("chapters")
          .select("id, title, chapter_number")
          .eq("book_id", bookId)
          .order("chapter_number", { ascending: true }),
        supabase
          .from("pages")
          .select("id, page_number, text, image_url, audio_url, chapter_id")
          .eq("book_id", bookId)
          .order("page_number", { ascending: true }),
      ]);
      if (book.error) throw new Error(book.error.message);
      return { book: book.data, chapters: chapters.data ?? [], pages: pages.data ?? [] };
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
              <nav className="mt-4 space-y-1 overflow-y-auto px-4 pb-6">
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
            <p className="mt-6 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {t("page")} {page.page_number} {t("of")} {pages.length}
              {chapterTitle ? ` · ${chapterTitle}` : ""}
            </p>

            <article className="page-surface mt-4 rounded-2xl p-6 sm:p-10">
              {page.image_url ? (
                <img
                  src={page.image_url}
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

              <div className="prose-page font-display text-[1.15rem]">{page.text}</div>

              {page.audio_url ? (
                <audio controls src={page.audio_url} className="mt-6 w-full" />
              ) : null}
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
