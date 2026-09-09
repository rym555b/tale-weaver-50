import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Images, ListTree, Sparkles, Users } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Storybook — transformez un long texte en livre illustré" },
      {
        name: "description",
        content:
          "Collez 10, 100 ou 300 pages de texte : Storybook analyse l'histoire, crée les personnages, découpe en chapitres et vous offre un lecteur page par page.",
      },
      { property: "og:title", content: "Storybook — transformez un long texte en livre illustré" },
      {
        property: "og:description",
        content: "Analyse par étapes, chapitres, pages, personnages cohérents et lecteur intégré.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { t } = useI18n();
  const { user } = useAuth();

  const features = [
    { icon: ListTree, key: "stepAnalysis" as const },
    { icon: Users, key: "charactersTitle" as const },
    { icon: BookOpen, key: "stepPages" as const },
    { icon: Images, key: "stepImages" as const },
  ];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:py-24">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {t("tagline")}
        </p>
        <h1 className="mt-4 text-5xl leading-[1.05] sm:text-6xl">{t("appName")}</h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">{t("heroLead")}</p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link to={user ? "/create" : "/auth"}>
              <Sparkles className="size-4" />
              {t("createBook")}
            </Link>
          </Button>
          {user ? (
            <Button size="lg" variant="outline" asChild>
              <Link to="/library">{t("myLibrary")}</Link>
            </Button>
          ) : null}
        </div>

        <ul className="mt-16 grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, key }) => (
            <li
              key={key}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-soft"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="text-sm text-card-foreground">{t(key)}</span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
