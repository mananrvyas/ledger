"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Dark/light toggle. Renders a stable placeholder until mounted so SSR and the
 * first client render match (theme is only known after hydration).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Until mounted, theme is unknown — render a stable, theme-neutral state so
  // SSR and first client render match (avoids a hydration mismatch).
  const isDark = resolvedTheme === "dark";
  const label = !mounted
    ? "Toggle theme"
    : isDark
      ? "Switch to light mode"
      : "Switch to dark mode";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted && !isDark ? (
        <Moon className="size-[18px]" strokeWidth={1.6} />
      ) : (
        <Sun className="size-[18px]" strokeWidth={1.6} />
      )}
    </Button>
  );
}
