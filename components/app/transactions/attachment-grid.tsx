import { FileText, Paperclip } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export type AttachmentRow = {
  id: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  source: string | null;
  created_at: string;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Server component that turns Storage paths into signed URLs at render time.
 * Bucket is private; URLs expire after an hour, fresh on each render.
 *
 * Uses the admin client because the user-bound SSR client doesn't have a
 * `createSignedUrl` method on storage (the storage policies still gate
 * access — admin signing skips RLS but the URL is then user-presented).
 */
export async function AttachmentGrid({
  attachments,
}: {
  attachments: AttachmentRow[];
}) {
  if (attachments.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground/60">
        No attachments yet — reply to the WhatsApp notification with a photo
        and it lands here.
      </p>
    );
  }

  const admin = createAdminClient();
  const items = await Promise.all(
    attachments.map(async (a) => {
      const { data } = await admin.storage
        .from("receipts")
        .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...a, signedUrl: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((a) => {
        const isImage = a.mime_type?.startsWith("image/") ?? false;
        const sizeKb = a.size_bytes ? Math.round(a.size_bytes / 1024) : null;

        if (isImage && a.signedUrl) {
          return (
            <a
              key={a.id}
              href={a.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-square overflow-hidden rounded-md border border-hairline bg-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.signedUrl}
                alt="Receipt"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className="absolute bottom-1 right-1 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur-sm">
                {a.source ?? "—"}
                {sizeKb ? ` · ${sizeKb}kb` : ""}
              </span>
            </a>
          );
        }

        return (
          <a
            key={a.id}
            href={a.signedUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border border-hairline bg-card p-3 text-center transition-colors hover:border-primary/40"
          >
            <FileText
              className="size-8 text-muted-foreground/65"
              strokeWidth={1.5}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/75">
              {a.mime_type ?? "file"}
            </p>
            {sizeKb ? (
              <p className="font-mono text-[10px] tabular-nums text-muted-foreground/55">
                {sizeKb} kb
              </p>
            ) : null}
          </a>
        );
      })}
    </div>
  );
}

/** Small inline indicator for use in row lists. */
export function AttachmentBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/65">
      <Paperclip className="size-3" strokeWidth={1.6} />
      {count}
    </span>
  );
}
