import Link from "next/link";
import { ArrowUpRight, MessageCircle, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

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
          WhatsApp routing
        </p>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <MessageCircle className="size-4" strokeWidth={1.5} />
            </div>
            <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
              <p className="text-foreground/90">
                Each user gets their own per-row notifications and reply pipeline.
              </p>
              <p>
                Outbound notifications go to the WhatsApp number above. Inbound
                replies are routed back to your account by matching the sender
                number. So your phone, your transactions — no crosstalk if a
                friend signs up on the same instance.
              </p>
              <p className="text-muted-foreground/75">
                On the Twilio sandbox, each phone has to{" "}
                <code>join {`{keyword}`}</code> once before messages flow.
                Production WhatsApp Business removes that step (separate
                project, days of paperwork).
              </p>
            </div>
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
