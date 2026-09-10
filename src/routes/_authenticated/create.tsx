import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createBook } from "@/lib/books.functions";
import { countWords } from "@/lib/text-splitting";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Créer un livre avec l’IA — Storybook" },
      { name: "description", content: "Transformez votre histoire en livre illustré et raconté." },
      { property: "og:title", content: "Créer un livre avec l’IA — Storybook" },
      { property: "og:description", content: "Créez chapitres, illustrations, couvertures et narration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreatePage,
});

const ILLUSTRATION_STYLES = [
  "watercolor",
  "storybook",
  "comic",
  "oil-painting",
  "pencil-sketch",
  "cinematic",
] as const;

const NARRATION_STYLES = ["neutral", "warm", "dramatic", "child-friendly"] as const;

function CreatePage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const submit = useServerFn(createBook);
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<"fr" | "en" | "ar">(locale);
  const [style, setStyle] = useState<string>("watercolor");
  const [narration, setNarration] = useState<string>("neutral");
  const [targetPages, setTargetPages] = useState(40);
  const [audio, setAudio] = useState(false);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(
    () => ({ words: countWords(text), chars: text.length }),
    [text],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    toast.success(file.name);
  };

  const generate = async () => {
    if (text.trim().length < 200) {
      toast.error(t("tooShort"));
      return;
    }
    setBusy(true);
    try {
      const result = await submit({
        data: {
          title: title.trim() || undefined,
          sourceText: text,
          language,
          style,
          narrationStyle: narration,
          targetPages,
          generateAudio: audio,
        },
      });
      navigate({ to: "/book/$bookId", params: { bookId: result.bookId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-4xl">{t("createBook")}</h1>

        <Card className="mt-8 shadow-soft">
          <CardHeader>
            <CardTitle className="font-display text-2xl">{t("newBook")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">{t("titleOptional")}</Label>
              <Input
                id="title"
                placeholder={t("titlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="story">{t("yourStory")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-4" />
                  {t("importFile")}
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".txt,text/plain,.md"
                  className="hidden"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </div>
              <Textarea
                id="story"
                className="min-h-72 font-sans"
                placeholder={t("storyPlaceholder")}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {stats.words.toLocaleString()} {t("words")} · {stats.chars.toLocaleString()}{" "}
                {t("characters")}
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("language")}</Label>
                <Select
                  value={language}
                  onValueChange={(v) => setLanguage(v as "fr" | "en" | "ar")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">{t("french")}</SelectItem>
                    <SelectItem value="en">{t("english")}</SelectItem>
                    <SelectItem value="ar">{t("arabic")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("illustrationStyle")}</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ILLUSTRATION_STYLES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("narrationStyle")}</Label>
                <Select value={narration} onValueChange={setNarration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NARRATION_STYLES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {t("approxPages")}: {targetPages}
                </Label>
                <Slider
                  min={4}
                  max={400}
                  step={4}
                  value={[targetPages]}
                  onValueChange={([value]) => setTargetPages(value ?? 40)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="audio">{t("generateAudio")}</Label>
                <p className="text-xs text-muted-foreground">{t("audioHint")}</p>
              </div>
              <Switch id="audio" checked={audio} onCheckedChange={setAudio} />
            </div>

            <Button size="lg" className="w-full" onClick={generate} disabled={busy}>
              <Sparkles className="size-4" />
              {t("generateMyBook")}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
