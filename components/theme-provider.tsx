"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App theme provider. Toggles the `.dark` class on <html>, persists the choice
 * to localStorage (key: "theme"), and defaults to dark. System preference is
 * intentionally off — the app has an explicit dark default with a manual toggle.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
