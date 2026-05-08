import Link from "next/link";
import QRCode from "qrcode";
import { ArrowUpRight, MessageCircle, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

/** Build the deep-link + QR for the Twilio sandbox join. wa.me is the
 * canonical WhatsApp deep-link host; tapping it (or scanning the QR) opens
 * WhatsApp with the message pre-typed, so the user just taps Send.
 *
 * Keyword + sandbox number come from env so swapping Twilio sandboxes (or
 * eventually moving to WA Business prod) doesn't require a code change.
 */
async function buildWhatsAppJoin(): Promise<{
  waUrl: string;
  qrSvg: string;
  keyword: string | null;
  sandboxNumber: string;
} | null> {
  const sandboxRaw = process.env.TWILIO_WHATSAPP_FROM;
  if (!sandboxRaw) return null;
  const sandboxNumber = sandboxRaw.replace(/^whatsapp:/, "");
  const cleanForUrl = sandboxNumber.replace(/[^\d]/g, "");

  const keyword = process.env.TWILIO_SANDBOX_JOIN_KEYWORD ?? null;
  const message = keyword ? `join ${keyword}` : "join";
  const waUrl = `https://wa.me/${cleanForUrl}?text=${encodeURIComponent(message)}`;

  const qrSvg = await QRCode.toString(waUrl, {
    type: "svg",
    margin: 1,
    width: 200,
    color: {
      dark: "#0a0a09",
      light: "#f5f1e8",
    },
  });

  return { waUrl, qrSvg, keyword, sandboxNumber };
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Profile may not exist yet for users that signed up before the trigger
  // landed — the migration backfilled them, but a defensive insert keeps
  // this page robust for future auth edge cases.
  const { data: profile } = await supabase
    .from("profiles")
    .select("whatsapp_number, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const join = await buildWhatsAppJoin();

  return (
    <div className="space-y-12">
      <header className="reveal reveal-1 space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Profile
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-5xl italic font-normal leading-[1] text-foreground">
            Settings.
          </h1>
          <p className="font-mono text-[11px] tabular-nums tracking-[0.16em] text-muted-foreground/70">
            {user.email}
          </p>
        </div>
        <div className="rule-amber w-20" />
      </header>

      <section className="reveal reveal-2 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
          You
        </p>
        <ProfileForm
          initialPhone={profile?.whatsapp_number ?? null}
          initialDisplayName={profile?.display_name ?? null}
        />
      </section>

      <section className="reveal reveal-3 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Pair WhatsApp
        </p>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-3">
                <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <MessageCircle className="size-4" strokeWidth={1.5} />
                </div>
                <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                  <p className="text-foreground/90">
                    One-time pairing: scan the QR with your phone to send the
                    join keyword to Twilio.
                  </p>
                  {join?.keyword ? (
                    <p>
                      The QR opens WhatsApp pre-filled with{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">
                        join {join.keyword}
                      </code>
                      . Just tap Send.
                    </p>
                  ) : (
                    <p>
                      Scan from your phone, then tap Send. The QR is pre-filled
                      with the join command from your Twilio sandbox.
                    </p>
                  )}
                  <p className="text-muted-foreground/75">
                    Twilio sandbox sessions expire after 72 idle hours. If
                    notifications start failing with a{" "}
                    <code className="font-mono text-[11px]">63015</code>{" "}
                    error, scan this again.
                  </p>
                </div>
              </div>
              {join ? (
                <div className="space-y-1 pt-2 font-mono text-[11px] tabular-nums text-muted-foreground/70">
                  <p>
                    <span className="text-muted-foreground/55">number ·</span>{" "}
                    {join.sandboxNumber}
                  </p>
                  {join.keyword ? (
                    <p>
                      <span className="text-muted-foreground/55">keyword ·</span>{" "}
                      {join.keyword}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {join ? (
              <div className="flex flex-col items-center gap-2">
                <a
                  href={join.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg ring-1 ring-border transition-shadow hover:ring-primary/40"
                  title="Open in WhatsApp"
                  dangerouslySetInnerHTML={{ __html: join.qrSvg }}
                />
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55">
                  scan or tap to open
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground/60">
                <code>TWILIO_WHATSAPP_FROM</code> not set —
                <br />
                QR unavailable.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="reveal reveal-4 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Linked banks
        </p>
        <Link
          href="/accounts"
          className="group flex items-center justify-between rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30"
        >
          <div className="space-y-1">
            <p className="font-display text-lg font-normal leading-tight">
              Manage banks
            </p>
            <p className="text-[13px] text-muted-foreground">
              Add a new institution, reconnect after a login expires, or
              disconnect with optional history wipe.
            </p>
          </div>
          <ArrowUpRight
            className="size-4 text-muted-foreground/50 transition-colors group-hover:text-primary"
            strokeWidth={1.5}
          />
        </Link>
      </section>

      <section className="reveal reveal-5 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
          Danger zone
        </p>
        <div className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-6">
          <div className="flex items-start gap-4">
            <ShieldAlert
              className="mt-0.5 size-5 text-destructive"
              strokeWidth={1.5}
            />
            <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
              <p className="text-foreground/90">
                Account deletion isn&apos;t wired into the UI yet.
              </p>
              <p className="text-muted-foreground/75">
                If you need to wipe your data: disconnect every bank with
                &ldquo;Also wipe transaction history&rdquo; checked on{" "}
                <Link href="/accounts" className="text-foreground underline underline-offset-4 decoration-destructive/50 hover:decoration-destructive">
                  Accounts
                </Link>
                , then ask the admin to delete your auth user. (Cascades
                everything via FK.)
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
