/**
 * Generated files live in the private "books" storage bucket; the database only
 * ever keeps their path. Uploads and signed read URLs go through the service
 * role, so no browser ever touches the bucket directly.
 */

const BUCKET = "books";

export async function uploadBookFile(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes as unknown as BlobPart, { contentType, upsert: true });
  if (error) throw new Error(`STORAGE_${error.message}`);
  return path;
}

/** Signed URLs (1h) for a list of stored paths, keyed by path. */
export async function signBookFiles(paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result: Record<string, string> = {};

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(batch, 60 * 60);
    if (error) throw new Error(`STORAGE_${error.message}`);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) result[item.path] = item.signedUrl;
    }
  }

  return result;
}
