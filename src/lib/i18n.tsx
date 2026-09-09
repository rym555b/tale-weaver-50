import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Locale = "fr" | "en";

const STORAGE_KEY = "storybook.locale";

const dictionary = {
  fr: {
    appName: "Storybook",
    tagline: "Transformez un long texte en livre illustré, chapitre par chapitre.",
    heroLead:
      "Collez votre histoire — 10, 100 ou 300 pages — et Storybook l'analyse, crée sa bible des personnages, la découpe en chapitres et en pages, puis vous la donne à lire.",
    createBook: "✨ Créer un livre avec l'IA",
    myLibrary: "Ma bibliothèque",
    signIn: "Se connecter",
    signOut: "Se déconnecter",
    signUp: "Créer un compte",
    email: "Adresse e-mail",
    password: "Mot de passe",
    displayName: "Nom affiché",
    continueWithGoogle: "Continuer avec Google",
    authTitle: "Accéder à Storybook",
    authSubtitle: "Vos livres restent privés et liés à votre compte.",
    noAccount: "Pas encore de compte ?",
    haveAccount: "Déjà un compte ?",
    newBook: "Nouveau livre",
    titleOptional: "Titre (facultatif)",
    titlePlaceholder: "Laissez vide pour que l'IA le trouve",
    yourStory: "Votre histoire",
    storyPlaceholder: "Collez ici votre texte, aussi long que vous le souhaitez…",
    importFile: "Importer un fichier .txt",
    language: "Langue du livre",
    french: "Français",
    english: "Anglais",
    illustrationStyle: "Style d'illustration",
    narrationStyle: "Style de narration",
    approxPages: "Nombre approximatif de pages",
    generateAudio: "Générer l'audio",
    yes: "Oui",
    no: "Non",
    generateMyBook: "✨ Générer mon livre",
    words: "mots",
    characters: "caractères",
    estimated: "Environ",
    pages: "pages",
    tooShort: "Ajoutez au moins 200 caractères de texte.",
    generating: "Génération en cours",
    stepAnalysis: "Analyse du texte et des personnages",
    stepPages: "Découpage en chapitres et en pages",
    stepImages: "Illustrations",
    stepAudio: "Narration audio",
    stepCovers: "Couvertures",
    comingNext: "Prochaine étape du projet",
    pause: "Mettre en pause",
    resume: "Reprendre la génération",
    retry: "Relancer l'étape échouée",
    openReader: "Ouvrir le lecteur",
    readBook: "Lire",
    continue: "Continuer",
    library: "Bibliothèque",
    emptyLibrary: "Aucun livre pour l'instant. Créez le premier !",
    status_pending: "En attente",
    status_analyzing: "Analyse",
    status_paginating: "Mise en pages",
    status_processing: "En cours",
    status_completed: "Terminé",
    status_failed: "Échec",
    chapters: "Chapitres",
    charactersTitle: "Personnages",
    page: "Page",
    previous: "Précédente",
    next: "Suivante",
    listen: "Écouter",
    audioSoon: "L'audio de cette page n'est pas encore généré.",
    imageSoon: "L'illustration de cette page n'est pas encore générée.",
    delete: "Supprimer",
    confirmDelete: "Supprimer définitivement ce livre ?",
    cancel: "Annuler",
    errorGeneric: "Une erreur est survenue.",
    missingKey: "La clé du service d'IA est absente côté serveur.",
    summary: "Résumé",
    backToLibrary: "Retour à la bibliothèque",
    noPagesYet: "Les pages ne sont pas encore prêtes.",
    of: "sur",
  },
  en: {
    appName: "Storybook",
    tagline: "Turn a long text into an illustrated book, chapter by chapter.",
    heroLead:
      "Paste your story — 10, 100 or 300 pages — and Storybook analyses it, builds a character bible, splits it into chapters and pages, then hands it back to you as a book.",
    createBook: "✨ Create a book with AI",
    myLibrary: "My library",
    signIn: "Sign in",
    signOut: "Sign out",
    signUp: "Create account",
    email: "Email address",
    password: "Password",
    displayName: "Display name",
    continueWithGoogle: "Continue with Google",
    authTitle: "Access Storybook",
    authSubtitle: "Your books stay private and tied to your account.",
    noAccount: "No account yet?",
    haveAccount: "Already have an account?",
    newBook: "New book",
    titleOptional: "Title (optional)",
    titlePlaceholder: "Leave empty and let the AI find one",
    yourStory: "Your story",
    storyPlaceholder: "Paste your text here, as long as you like…",
    importFile: "Import a .txt file",
    language: "Book language",
    french: "French",
    english: "English",
    illustrationStyle: "Illustration style",
    narrationStyle: "Narration style",
    approxPages: "Approximate number of pages",
    generateAudio: "Generate audio",
    yes: "Yes",
    no: "No",
    generateMyBook: "✨ Generate my book",
    words: "words",
    characters: "characters",
    estimated: "About",
    pages: "pages",
    tooShort: "Add at least 200 characters of text.",
    generating: "Generation in progress",
    stepAnalysis: "Text and character analysis",
    stepPages: "Splitting into chapters and pages",
    stepImages: "Illustrations",
    stepAudio: "Audio narration",
    stepCovers: "Covers",
    comingNext: "Next stage of the project",
    pause: "Pause",
    resume: "Resume generation",
    retry: "Retry the failed step",
    openReader: "Open the reader",
    readBook: "Read",
    continue: "Continue",
    library: "Library",
    emptyLibrary: "No books yet. Create the first one!",
    status_pending: "Pending",
    status_analyzing: "Analysing",
    status_paginating: "Paginating",
    status_processing: "Processing",
    status_completed: "Completed",
    status_failed: "Failed",
    chapters: "Chapters",
    charactersTitle: "Characters",
    page: "Page",
    previous: "Previous",
    next: "Next",
    listen: "Listen",
    audioSoon: "Audio for this page has not been generated yet.",
    imageSoon: "The illustration for this page has not been generated yet.",
    delete: "Delete",
    confirmDelete: "Permanently delete this book?",
    cancel: "Cancel",
    errorGeneric: "Something went wrong.",
    missingKey: "The AI service key is missing on the server.",
    summary: "Summary",
    backToLibrary: "Back to library",
    noPagesYet: "Pages are not ready yet.",
    of: "of",
  },
} as const;

export type TranslationKey = keyof (typeof dictionary)["fr"];

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => dictionary[locale][key],
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
