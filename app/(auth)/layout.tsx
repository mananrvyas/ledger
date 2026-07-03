import { ThemeToggle } from "@/components/app/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh items-center justify-center px-6 py-12">
      {/* Atmospheric backdrop — single broad amber wash, fixed-position so the
          warmth seems to come from off-screen rather than from the form. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-[30vh] left-1/2 size-[90vh] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-[120px]" />
        <div className="absolute -bottom-[40vh] right-[-10vh] size-[70vh] rounded-full bg-primary/[0.04] blur-[120px]" />
      </div>
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
