import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Storybook" },
      { name: "description", content: "Connectez-vous pour créer et lire vos livres Storybook." },
      { property: "og:title", content: "Connexion — Storybook" },
      { property: "og:description", content: "Accédez à votre bibliothèque de livres générés." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/library" });
  }, [user, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: `${window.location.origin}/library`,
          },
        });
        if (error) throw error;
        toast.success(t("signUp"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/library" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error(t("errorGeneric"));
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/library" });
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-md px-4 py-14">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display text-3xl">{t("authTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("authSubtitle")}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <Button variant="outline" className="w-full" onClick={google} disabled={busy}>
              {t("continueWithGoogle")}
            </Button>

            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" ? (
                <div className="space-y-2">
                  <Label htmlFor="displayName">{t("displayName")}</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {mode === "signup" ? t("signUp") : t("signIn")}
              </Button>
            </form>

            <button
              type="button"
              className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? t("noAccount") : t("haveAccount")}
            </button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
