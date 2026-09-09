import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Check, Loader2, Pause, Play } from "lucide-react";
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
  component: BookPage;
});

function BookPage() {
  return null;
}
