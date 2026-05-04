"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, { error: null });

  return (
    <div className="space-y-12">
      <div className="space-y-7">
        <div className="reveal reveal-1">
          <Brand size="md" />
        </div>
        <div className="reveal reveal-2 space-y-3">
          <h1 className="font-display text-[2.6rem] italic font-normal leading-[1.05] text-foreground">
            Welcome back.
          </h1>
          <div className="rule-amber w-12" />
          <p className="text-sm text-muted-foreground">
            Sign in to your ledger.
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
            autoComplete="current-password"
            required
            className="h-11"
          />
        </div>
        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-11 w-full font-medium tracking-wide"
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="reveal reveal-4 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link
          href="/signup"
          className="text-foreground underline underline-offset-[5px] decoration-primary/50 hover:decoration-primary transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
