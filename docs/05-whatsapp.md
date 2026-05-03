# 05 — WhatsApp

The user-facing wedge: every transaction surfaces in WhatsApp the moment it posts, and a free-text reply edits it.

## Twilio sandbox setup

For one user we live entirely in the sandbox indefinitely.

1. Twilio Console → Messaging → Try it out → Send a WhatsApp message.
2. Note the sandbox sender (e.g., `whatsapp:+14155238886`) and the join keyword.
3. From your phone, WhatsApp the sender: `join {keyword}` once. This pairs your number to the sandbox.
4. In Twilio:
   - "When a message comes in" → `https://APP_URL/api/whatsapp/webhook` (POST).
   - "Status callback URL" → `https://APP_URL/api/whatsapp/webhook` (or a separate `/api/whatsapp/status` if we want to split delivery updates from inbound).
5. Env vars: `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`, `USER_WHATSAPP_TO=whatsapp:+1xxxxxxxxxx`.

**Sandbox quirks:**
- Sandbox does NOT enforce template approval — outbound messages can be free-form even outside the 24h window. Convenient for development AND fine for one user permanently. (If we ever go to production, this changes.)
- Only pre-joined numbers can interact. If you change your phone, re-join.
- Media (photos) work both inbound and outbound.

---

## Outbound: notification on new transaction

Sent by the `send_wa_notification` queue worker after categorization completes (and after transfer pairing — transfers are silent).

### Format (sandbox / v1)

Plain text, multi-line. Compact and skim-able on lock screen.

```
💳 *$24.50* at Sweetgreen
→ Eating Out
Reply to change (e.g., "split 1/3", "this is groceries", "ignore", or attach photo)
```

Variables:
- `*$24.50*` — formatted with currency, bold via WhatsApp Markdown asterisks
- `Sweetgreen` — `merchant_name` (fallback `name`)
- `Eating Out` — `user_category`

The hint line stays short — users learn the patterns and won't need it after a few days, but it's useful while building habits.

### Re-notification format (pending → posted with material change)

```
🔄 *Updated*: $24.50 → *$28.00* at Sweetgreen
→ Eating Out
(was pending, now posted)
```

Or if only category changed:

```
🔄 *Updated*: $24.50 at Sweetgreen
→ Eating Out  (was: Other)
```

### Notification suppression rules

- `is_transfer = true` → never send (silent).
- `is_pending = true` for first appearance → still send (this is the "real-time" feature; pending IS what we want to surface fastest).
- Re-notify on `modified` only if amount Δ > 5% OR category changed (see `04-categorization.md`).
- After successful send: persist `transactions.last_notified_at` and `notified_amount`, plus row in `whatsapp_messages`.

### When NOT in sandbox (future production)

We'd need an approved utility template. One template, three variables (amount / merchant / category), matching the sandbox plain-text format as closely as Meta will approve. The plumbing is the same — just pass `contentSid` + `contentVariables` in the Twilio call instead of `body`.

---

## Inbound: parsing replies

Triggered by Twilio POSTing inbound WA messages to `/api/whatsapp/webhook`. Webhook handler verifies signature, persists raw message, enqueues `parse_wa_reply`.

### Reply matching

The single hardest UX problem. Three-step fallback:

**Step 1 — Quoted reply (preferred).**
WhatsApp's quote-reply (long-press → reply) sends Twilio fields `OriginalRepliedMessageSid` (Twilio's SID of the original outbound message). If present, look up `whatsapp_messages` by that SID → use its `related_transaction_id`. Done.

**Step 2 — Most recent un-edited.**
Find the user's transactions where:
- `last_notified_at >= now() - interval '60 minutes'`
- `last_user_edit_at IS NULL`

If exactly one match, use it. (User just got a single notification and is replying.)

**Step 3 — Ask.**
If 0 or >1 candidates, send:

```
🤔 Which transaction? Quote one of my recent messages, or reply with the merchant name.
```

Set the inbound message's `intent='unknown'` and exit.

If the user replies with a merchant name, we treat that as a Step-2 lookup with a free-text filter — handled by re-running parse_wa_reply with that body. (Implementation note: small loop, but bounded by the user's patience.)

### LLM intent parser

Single Claude Haiku call per inbound message (text only — media is handled separately).

System prompt:
```
You parse personal-finance edit commands sent via WhatsApp.
The user is editing one specific transaction (provided in context).
Output VALID JSON only. No prose.

Recognize these intents:
- "recategorize": user wants a different category. Output {"intent":"recategorize","new_category":"<name from list>"}.
- "split": user is paying only part. Output {"intent":"split","split_type":"percent"|"fixed"|"ratio","split_value":<number>,"split_raw_input":"<original text>"}.
  - "1/3" → ratio, 0.3333
  - "20%" → percent, 20
  - "$8" or "8 dollars" → fixed, 8.00
- "note": user wants to add free-form context. Output {"intent":"note","note":"<the note>"}.
- "exclude": user wants the transaction excluded from stats. Phrases like "ignore this", "not mine", "don't count this". Output {"intent":"exclude"}.
- "include": reverse of exclude. Output {"intent":"include"}.
- "unknown": cannot determine. Output {"intent":"unknown","reason":"..."}.

Constraints:
- new_category MUST be from the provided list, exactly. If user names something not on the list, choose the closest fit.
- For split, prefer the user's exact phrasing in split_raw_input.
- Don't combine intents. If user says "split 1/3 and add a note", choose the dominant action (split) and put the rest in the note field.
```

User prompt (filled in):
```
Transaction: $24.50 at Sweetgreen — current category: Eating Out
Available categories: ["Groceries","Eating Out","Coffee",...]

User reply: "split 1/3 with sarah and mike"
```

Returns structured JSON, validated, applied.

### Intent payload schemas

```ts
type Intent =
  | { intent: 'recategorize'; new_category: string }
  | { intent: 'split'; split_type: 'percent'|'fixed'|'ratio'; split_value: number; split_raw_input: string }
  | { intent: 'note'; note: string }
  | { intent: 'exclude' }
  | { intent: 'include' }
  | { intent: 'unknown'; reason: string };
```

### Applying intents

| Intent | DB updates |
|---|---|
| `recategorize` | `transactions.user_category = new_category`, `category_source = 'manual'`, `last_user_edit_at = now()`. Upsert `category_rules`. |
| `split` | `transactions.split_type, split_value, split_raw_input` set; `effective_amount` recomputed by trigger or generated column; `last_user_edit_at = now()`. |
| `note` | `transactions.notes = note` (replace, since it's a single-user app and notes are usually replacements). To support append, change to `notes = COALESCE(notes,'') || E'\n' || note`. |
| `exclude` / `include` | `transactions.excluded_from_stats = true/false`, `last_user_edit_at = now()`. |
| `unknown` | No DB change. Send clarifying message. |

After applying, send a free-form confirmation message (free-form is OK — we're inside the 24h window, having just received an inbound).

### Confirmation messages

Concise, mirror the change:

| Intent | Confirmation |
|---|---|
| `recategorize` to "Groceries" | `✅ Recategorized to Groceries.` |
| `split` (1/3 of $24.50) | `✅ Split — your share: $8.17 (1/3 of $24.50).` |
| `note` | `✅ Note saved.` |
| `exclude` | `🚫 Excluded from stats.` |
| `include` | `↩️ Back in stats.` |
| `unknown` | `🤔 Didn't catch that. Try: "groceries", "split 1/3", "ignore", or send a photo.` |

---

## Receipt photos via WhatsApp media

Twilio's inbound webhook includes `NumMedia` and `MediaUrl0..N` / `MediaContentType0..N` fields when the user attaches photos.

### Flow

1. `parse_wa_reply` worker reads `NumMedia` from the raw payload.
2. For each media:
   - Download from `MediaUrlN` with HTTP Basic auth (`TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN`).
   - Validate content type (image/* and application/pdf only — drop anything else).
   - Validate size (max 10 MB).
   - Generate object path: `receipts/{user_id}/{transaction_id}/{uuid}.{ext}`.
   - Upload to Supabase Storage `receipts` bucket (private).
   - Insert `transaction_attachments` row with `storage_path`, `mime_type`, `size_bytes`, `source='whatsapp'`, `twilio_media_url`.
3. After all media processed, also process the text body as an intent (if non-empty).
4. Confirmation:
   - Photo + text intent: combined ack, e.g., `✅ Photo attached. Recategorized to Groceries.`
   - Photo only: `✅ Photo attached to Sweetgreen $24.50.`

### Storage policies

- Bucket: `receipts`, private.
- Read access: Supabase Storage policy `auth.uid() = (storage path's user_id segment)`.
- Web UI uses signed URLs (1-hour expiry) to render thumbnails / full images.

---

## Edge cases

| Case | Handling |
|---|---|
| User sends a stray "lol" hours later | Step 2 finds no recent un-edited tx → Step 3 asks. Single ambiguous reply, no harm. |
| User sends a photo with no text and no quoted reply | Match by Step 2; if no recent tx, ask "Which transaction is this for?" |
| User sends multiple photos in one message | All attached to the matched transaction. |
| User replies in a language we didn't anticipate | Claude Haiku handles multilingual fine; intent parser is language-agnostic if prompt is robust. |
| Twilio webhook fires twice (idempotency) | `parse_wa_reply` job's `idempotency_key = whatsapp_message_id`; second invocation sees `intent IS NOT NULL` and skips. |
| User edits same transaction repeatedly | Each edit overwrites; we keep last. `category_rules` accumulates `times_applied`. |
| Reply is a confirmation of guess (e.g., "yep") | Treated as `unknown` → no-op + ack. (Could add explicit "confirm" intent later if it becomes common.) |
| User sends a message NOT in reply to anything | Step 3 fires. We never accidentally apply edits to old transactions. |

---

## Outbound message lifecycle

```
enqueue → Twilio API call → Twilio queues → Twilio sends → WA delivers → user reads
                                       │              │                    │
                                       ▼              ▼                    ▼
                                  status="sent" status="delivered"  status="read"
```

Each status update arrives at the same webhook (different fields — `MessageStatus`). We update `whatsapp_messages.status` accordingly.

If `MessageStatus = 'failed'`: log `whatsapp_messages.error`, write `app_events` row, surface in health page. We don't auto-retry inside Twilio — QStash retries the original `send_wa_notification` job if the API call fails synchronously.

---

## Reasonably foreseeable abuse / misuse (single user, but worth thinking)

- **Webhook spoofing**: covered by signature verification.
- **User accidentally exposing the bot's number**: not a concern with sandbox (random number, only paired numbers can interact).
- **Phishing receipts**: photos are stored privately; we don't OCR or auto-act on them. Just attached as a file.
