import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, LogOut, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export function AppHeader() {
  const { t, locale, setLocale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-border/70 bg-card/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <span className="font-display text-2xl leading-none">{t("appName")}</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["fr", "en", "ar"] as const).map((code) => (
              <button
                key={code}
                onClick={() => setLocale(code)}
                className={`px-2.5 py-1 text-xs font-medium uppercase transition-colors ${
                  locale === code
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {code}
              </button>
            ))}
          </div>

          {user ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/library">{t("myLibrary")}</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/create">
                  <Sparkles className="size-4" />
                  {t("newBook")}
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("signOut")}
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                }}
              >
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link to="/auth">{t("signIn")}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
