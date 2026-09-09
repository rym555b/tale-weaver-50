import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Sparkles } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

function statusKey(status: string): TranslationKey {
  const key = `status_${status}` as TranslationKey;
  return key in ({} as never) ? key : key;
}

function LibraryPage() {
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, description, status, total_pages, language, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 8000,
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-4xl">{t("library")}</h1>
          <Button asChild>
            <Link to="/create">
              <Sparkles className="size-4" />
              {t("createBook")}
            </Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {isLoading
            ? [0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)
            : (data ?? []).map((book) => (
                <Card key={book.id} className="flex flex-col shadow-soft">
                  <CardHeader className="gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="font-display text-2xl leading-tight">
                        {book.title || t("newBook")}
                      </CardTitle>
                      <Badge variant={book.status === "failed" ? "destructive" : "secondary"}>
                        {t(statusKey(book.status))}
                      </Badge>
                    </div>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {book.description ?? ""}
                    </p>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {book.total_pages} {t("pages")} · {book.language.toUpperCase()}
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/book/$bookId" params={{ bookId: book.id }}>
                          {t("generating")}
                        </Link>
                      </Button>
                      <Button size="sm" asChild disabled={book.total_pages === 0}>
                        <Link to="/read/$bookId" params={{ bookId: book.id }}>
                          <BookOpen className="size-4" />
                          {t("readBook")}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>

        {!isLoading && (data ?? []).length === 0 ? (
          <p className="mt-16 text-center text-muted-foreground">{t("emptyLibrary")}</p>
        ) : null}
      </main>
    </div>
  );
}
