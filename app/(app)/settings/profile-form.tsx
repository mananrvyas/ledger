"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateProfile } from "./actions";

export function ProfileForm({
  initialPhone,
  initialDisplayName,
}: {
  initialPhone: string | null;
  initialDisplayName: string | null;
}) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result.ok) {
        toast.success("Saved.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-6 rounded-xl border border-border bg-card p-6"
    >
      <div className="space-y-2">
        <label
          htmlFor="display_name"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80"
        >
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="how you want to be addressed"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/45 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="whatsapp_number"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80"
        >
          WhatsApp number
        </label>
        <input
          id="whatsapp_number"
          name="whatsapp_number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+15551234567"
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[14px] tracking-wide text-foreground placeholder:text-muted-foreground/45 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
        <p className="text-[12px] leading-relaxed text-muted-foreground/75">
          E.164 format. 10-digit US numbers will get the <code>+1</code>{" "}
          prepended automatically. Notifications stop if you clear this — your
          replies stop being recognized too. Each WhatsApp number can only be
          attached to one account.
        </p>
        <p className="text-[12px] leading-relaxed text-muted-foreground/75">
          <strong className="text-foreground/85">First time?</strong> After
          saving, send <code>join {`{`}your-keyword{`}`}</code> from this
          phone to <code>+1 (415) 523-8886</code> on WhatsApp. Get the keyword
          from the Twilio Console (Messaging → Try it out).
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" strokeWidth={1.6} />
          )}
          Save
        </Button>
      </div>
    </form>
  );
}
