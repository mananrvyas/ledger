import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";
import { MainNav } from "@/components/app/main-nav";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-10">
            <Link
              href="/"
              className="transition-opacity hover:opacity-85"
              aria-label="Finance — home"
            >
              <Brand size="md" />
            </Link>
            <MainNav />
          </div>

          <div className="flex items-center gap-4">
            <span
              className="hidden font-mono text-[11px] tracking-tight text-muted-foreground/80 sm:inline"
              title={user.email ?? undefined}
            >
              {user.email}
            </span>
            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-8">
        <div className="border-t border-hairline pt-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50 font-mono">
            quietly kept · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
