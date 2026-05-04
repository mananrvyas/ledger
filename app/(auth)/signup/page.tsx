"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup } from "./actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, {
    error: null,
    message: null,
  });

  return (
    <div className="space-y-12">
      <div className="space-y-7">
        <div className="reveal reveal-1">
          <Brand size="md" />
        </div>
        <div className="reveal reveal-2 space-y-3">
          <h1 className="font-display text-[2.6rem] italic font-normal leading-[1.05] text-foreground">
            Begin a ledger.
          </h1>
          <div className="rule-amber w-12" />
          <p className="text-sm text-muted-foreground">
            One account. Yours.
          </p>
        </div>
      </div>

      <form action={action} className="reveal reveal-3 space-y-6">
        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono"
          >
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="password"
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono"
          >
            Password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-11"
          />
          <p className="text-[11px] text-muted-foreground/80">
            At least 8 characters.
          </p>
        </div>
        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {state.message ? (
          <p className="text-sm text-foreground/90 border-l-2 border-primary/60 pl-3 py-1">
            {state.message}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-11 w-full font-medium tracking-wide"
        >
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>

      <p className="reveal reveal-4 text-center text-sm text-muted-foreground">
        Already have one?{" "}
        <Link
          href="/login"
          className="text-foreground underline underline-offset-[5px] decoration-primary/50 hover:decoration-primary transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
