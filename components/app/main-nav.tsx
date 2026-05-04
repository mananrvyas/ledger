"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string };

const items: Item[] = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/settings", label: "Settings" },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative px-2.5 py-1.5 text-[13px] tracking-[0.01em] transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/85",
            )}
          >
            {item.label}
            {active ? (
              <span
                className="absolute -bottom-[15px] left-2.5 right-2.5 h-px bg-primary"
                aria-hidden
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
