import { MessageCircle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type WAMessage = {
  id: string;
  direction: "inbound" | "outbound" | string;
  body: string | null;
  intent: string | null;
  status: string | null;
  created_at: string;
};

/**
 * WhatsApp conversation timeline scoped to one transaction. Outbound on the
 * left (we sent it), inbound on the right (user reply) — same convention
 * the rest of the app uses for "you" content. Status pill on outbound rows.
 */
export function ConversationLog({ messages }: { messages: WAMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-hairline px-4 py-6 text-center">
        <MessageCircle
          className="mx-auto size-5 text-muted-foreground/45"
          strokeWidth={1.4}
        />
        <p className="mt-2 text-[12px] text-muted-foreground/60">
          No WhatsApp messages tied to this transaction yet.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-2.5">
      {messages.map((m) => {
        const inbound = m.direction === "inbound";
        return (
          <li
            key={m.id}
            className={cn("flex gap-2", inbound ? "justify-end" : "justify-start")}
          >
            {!inbound ? (
              <ArrowDownRight
                className="mt-2.5 size-3 shrink-0 text-muted-foreground/55"
                strokeWidth={1.6}
              />
            ) : null}
            <div
              className={cn(
                "max-w-[80%] rounded-lg border px-3 py-2",
                inbound
                  ? "border-primary/20 bg-primary/[0.06]"
                  : "border-hairline bg-card/60",
              )}
            >
              <p className="text-[13px] text-foreground/95 whitespace-pre-wrap">
                {m.body ?? "—"}
              </p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55">
                  {formatRelative(m.created_at)}
                </span>
                <div className="flex items-center gap-2">
                  {m.intent ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">
                      {m.intent}
                    </span>
                  ) : null}
                  {m.status && !inbound ? (
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-[0.14em]",
                        m.status === "failed"
                          ? "text-rose-300/85"
                          : "text-muted-foreground/55",
                      )}
                    >
                      {m.status}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {inbound ? (
              <ArrowUpRight
                className="mt-2.5 size-3 shrink-0 text-primary/55"
                strokeWidth={1.6}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function formatRelative(ts: string): string {
  const date = new Date(ts);
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
