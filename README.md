# AxiFlow: AI brochure & proposal studio + CRM automation for Codeace

A working model of the fully automated web-dev sales and delivery pipeline. A lead comes in, then gets enriched, scored, sent a personalised brochure, followed up, booked for a call, sent a proposal and invoices, onboarded, tracked through milestones, delivered and asked for a review. Every message, stage change and decision is logged.

It replaces (and fixes) the n8n flow in `reference/Web Development.png`. See [Changes from the n8n reference](#changes-from-the-n8n-reference).

## Architecture

**Twenty CRM → n8n automation → Pitch Script Maker → Brochure Maker → AI Proposal Generator**

| Part | Where | What it does |
|---|---|---|
| **Twenty CRM** | co-worker's CRM, used by the telecaller | Adding and editing leads, every phone call, call outcomes and proposal decisions |
| **n8n** | `n8n/*.json` (import) + [n8n/README.md](n8n/README.md) | Moves data only: forwards Twenty webhooks to `/webhooks/twenty`, and writes our events back to Twenty (stage, next action, call script, PDF links) |
| **Pitch Script Maker** | `src/ai/pitchmaker.js` | Web research, then a pitch plus a word-for-word **telecaller script**, sent to Twenty with every call request |
| **Brochure Maker** | `src/pdf/pdf.js` | 4-page **PDF**: cover, where they stand, a **homepage concept drawn from the design brief**, recommendation and call to action. Attached to the intro (email attachment / WhatsApp document). |
| **AI Proposal Generator** | `src/ai/proposal.js` + `src/pdf/pdf.js` | The AI writes the proposal (summary, scope, timeline, why us). **Prices always come from your price list.** Delivered as a **PDF**. The client accepts by replying "YES", or the telecaller sets `proposalDecision = ACCEPTED` in Twenty. |
| **AxiFlow engine** | this app | Decides everything: routing by interest, follow-up timing (call vs message), replies, meetings, invoices, delivery |

PDF links (`/pdf/brochure/<token>.pdf`, `/pdf/proposal/<token>.pdf`) are built on request from stored data, and the unguessable token is the access key. WhatsApp sends the PDF as a document: as the template's DOCUMENT header, so templates `ws_intro`, `ws_proposal` and `ws_proposal_reminder` need a **document header** in Meta.

## Quick start

```bash
npm install
cp .env.example .env      # optional; it runs without it, in mock mode
npm start                 # http://localhost:3000  (password: admin)
npm run seed              # optional: 8 demo leads (or Settings → "Load demo data")
```

Requires **Node 22.13+** (it uses the built-in `node:sqlite`, so there's no database to install). The data lives in `./data/crm.db`.

Without SMTP or WhatsApp credentials, every message is **rendered and logged with status `mock`**. You can see them in *Messages*, so you can run the whole pipeline end to end safely. Add credentials in `.env` to go live. `automation.dry_run` in Settings forces mock mode even when credentials are set.

## The pipeline

```
 INTAKE                 OUTREACH                                  SALES                      DELIVERY
 ──────                 ────────                                  ─────                      ────────
 web form /f ─┐
 API /api/intake ┤→ normalise → dedupe → website audit → score ──┬─ not interested → closed
 CSV import ─┤                                                  ├─ low score → nurture
 manual ─────┘                                                  └─ qualified
                                                                    │
                                                         personalised brochure
                                                                    │
                                                  human approval (or auto-approve)
                                                                    │
                                    channel: WhatsApp (opt-in) → email (opt-in) → manual-call task
                                                                    │
                                     intro ──3d──► follow-up 1 ──4d──► follow-up 2 ──5d──► closed
                                       │ reply at any point (WA webhook / email webhook)
                                       ├─ "STOP"            → do-not-contact
                                       ├─ "not interested"  → closed
                                       └─ positive          → booking link sent automatically
                                                                    │
                                    client picks slot (/book) → meeting → proposal auto-sent after the call
                                                                    │
                                     client accepts (/p) → advance invoice (/pay) → paid
                                                                    │
                                     onboarding brief (/onboard) → project + milestones
                                                                    │
                           each milestone ✓ notifies client (/status portal) → all done → final invoice
                                                                    │
                                                 paid → thank-you + Google review request
```

Every stage has its automatic action. Reminders are built in for proposals (3 days) and unpaid invoices (every 3 days).

### Triggers
| Trigger | What runs |
|---|---|
| **Event-driven** | New lead, approval, reply, booking, acceptance, payment, brief, milestone: the next step runs instantly |
| **Daily run** (default 09:00 Asia/Kolkata) | Everything that is due, plus a digest email to the agency |
| **Sweep** (every 15 min) | Due follow-ups, reminders, proposals after a finished meeting |
| **Manual** | "Run pipeline" button, "Send next message now" on a lead, drag-and-drop on the board |

### Guardrails
- Cold outreach is sent **only** to leads with permission for that channel, **inside the send window** (09:00–19:00, Mon–Sat), and **within daily caps** (WhatsApp 50, email 100). Live sends are throttled.
- **One channel per lead**, in priority order (WhatsApp, then email), with automatic fallback if a send fails.
- Opt-out works three ways: replying STOP, the unsubscribe link in every email (`List-Unsubscribe` header too), or the CRM flag.
- Duplicate leads (same email or phone) are merged, never re-messaged. A warm re-enquiry re-opens a closed lead.
- Each lead's steps run one at a time (an in-process lock). Stage-based state means nobody is messaged twice.

## CRM features
Dashboard (KPIs, funnel, 14-day activity, channel and source performance, attention list, scheduler status) · Leads table (search, filters, sort, CSV import and export) · Kanban board with drag-and-drop · Lead page (details, website audit, score breakdown, timeline, message thread, brochure preview, meetings, proposals, invoices, project milestones, tasks, per-lead automation log) · Brochure approval queue · Tasks · Unified message log · Projects · Invoices · Automation runs and full event log (CSV export, which replaces the Google Sheets logging) · Editable message templates · Settings (agency, schedule, send window, caps, sequence timings, packages and pricing, tax, advance %, meeting slots, milestones, portfolio).

**Client-facing pages** (token links, no login): lead form `/f` · brochure `/b/:t` · booking `/book/:t` · proposal with accept/decline `/p/:t` · invoice and checkout `/pay/:t` · onboarding brief `/onboard/:t` · project status portal `/status/:t` · unsubscribe `/u/:t`.

## Integrations

| What | How |
|---|---|
| **Email (Gmail)** | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS` = a Google **App Password** |
| **WhatsApp** | Meta WhatsApp Cloud API: `WA_TOKEN`, `WA_PHONE_NUMBER_ID`. Register **one template per message** in Meta Business Manager, named as in *Templates* (`ws_intro`, `ws_follow_up_1`, …), each with 3 body variables: `{{1}}` first name, `{{2}}` company, `{{3}}` link. Inside the 24-hour customer-service window, free text is sent instead. |
| **WhatsApp replies** | Set the Meta webhook to `BASE_URL/webhooks/whatsapp` with verify token `WA_VERIFY_TOKEN`, subscribed to `messages` |
| **Email replies** | `POST /webhooks/email` with header `X-Webhook-Secret` and body `{from, subject, text}`. Feed it from a Gmail trigger (n8n / Apps Script) or Mailgun/SendGrid inbound parse. |
| **Payments** | `/pay/:t` has a demo "Pay now" button. In production, create a Razorpay/Stripe payment link and have the gateway call `POST /webhooks/payment` with `X-Webhook-Secret` and body `{invoice_number or invoice_token, status:"paid", reference}`. |
| **Lead sources** | `POST /api/intake` with header `X-API-Key: INTAKE_API_KEY`. JSON object or array, with fields `company, contact_name/name, email, phone, website, industry, city, source, service, budget, interested, wa_opt_in, email_opt_in, notes`. Use it for website forms, Meta/Google lead ads (via n8n/Zapier), JustDial/IndiaMART exports, or the CRM. |

`BASE_URL` must be the public HTTPS URL for links in messages and for webhooks to work. For local testing, use a tunnel such as `cloudflared` or `ngrok`.

## The AI manager and the three pipes

The system acts as the **manager of the Codeace web studio**. Every lead goes into one of three pipes based on `interested`:

| Pipe | Who | What happens |
|---|---|---|
| **Conversion** | `interested = yes` | **Pitch maker** runs web research on the business (Claude with web search and web fetch, plus our website audit), then writes a pitch (headline, hook, pain points, value, package choice, objection handling, call script, intro email and WhatsApp), designs a **custom homepage concept**, and builds the brochure. A person approves it, then the intro goes out. After every touch the manager decides the **next follow-up: a call or a message, and when**. It creates call tasks with talking points and pushes the plan to the CRM. If the lead stays silent after the sequence, they move to Nurture. |
| **Nurture** (marketing) | `interested = unknown` | 5 value-first touches over about 5 weeks (configurable themes). The AI writes each message for the lead's industry. Leads without messaging permission get call tasks. |
| **Re-engage** (marketing) | `interested = no` | 3 light, no-pressure touches at 30, 90 and 180 days. Only leads with messaging permission get them; anyone else is closed. |

A positive reply, a call logged as "interested", or the CRM switching `interested` to yes moves a lead from either marketing pipe into Conversion. The pitch maker then runs automatically. "Not interested" moves a lead to Re-engage. STOP means do-not-contact.

**Replies**: the manager classifies each reply. The categories are interested, meeting request, question, a price, timing or trust objection, not interested, and STOP. It then sends the booking link, or drafts an answer for you to approve (*Today → Replies to send*), and schedules a call within 2 hours.

**Daily briefing**: after the 9 AM run, the manager writes a briefing covering who to call first, risks, and one marketing idea. It appears on the Today screen (Manager's notes) and in the digest email.

**AI setup**: add `ANTHROPIC_API_KEY` to `.env`. The default model is `claude-opus-5-5`, and server-side refusal fallback is on. Settings → AI manager controls:
- the model and the effort level for each task
- web searches per lead
- a **daily USD budget**
- the number of parallel jobs
- whether AI replies are sent automatically (off by default)

Every call is logged with its estimated cost in *Runs & log → AI calls*. As a rough estimate, expect around $0.50–1.00 per interested lead (research, pitch and design); web search results and the long design output dominate the cost. Check the real figure in the log after your first few leads. Without a key, or once the budget is reached, every step falls back to rules and templates, so the pipeline never stops.

Safety: AI-generated designs are stripped of scripts and served from `/d/:token` under a sandboxing CSP, so they can never reach the CRM session. Web pages and lead replies are passed to the model as untrusted data. The model chooses only from fixed options (call, message or close; reply intent), and our code validates each choice against permissions before acting.

## Integration with the team CRM (contract for the CRM developer)

**Who does what.** The team CRM is run by the **telecaller**: adding and editing leads and making every phone call happen there. This system only handles **conversion**: pitch, design, outreach, follow-ups, replies, meetings, proposals, payments and delivery. When the manager decides a call is the next best step, it sends `lead.call_requested` to the CRM with a call script. The telecaller makes the call in the CRM, and the CRM posts the result back to us. If no result arrives within 24 hours, the call is treated as unanswered.

**CRM → us**
| Call | Purpose |
|---|---|
| **`POST /webhooks/twenty`** (`X-API-Key`), used by n8n workflow 1 | Twenty's raw webhook body `{event, data}`. Creates or updates the lead, processes `callOutcome` and `proposalDecision`, and ignores echoes of our own writes. The field mapping is in `settings.twenty`. **This is the main path with Twenty**; the endpoints below are for other CRMs. |
| `POST /api/intake` (header `X-API-Key`) | New lead or array of leads. Send `external_id` (the CRM record id) plus company, contact_name, email, phone, website, industry, city, source, service, budget, `interested` (yes/no/unknown), `wa_opt_in`, `email_opt_in`, notes. If the same `external_id`, email or phone is sent again, it merges into the existing lead. |
| `PATCH /api/crm/leads/:external_id` (`X-API-Key`) | Update fields. Changing **`interested` re-routes the lead** between pipes; `do_not_contact: true` stops everything. |
| `POST /api/crm/leads/:external_id/call` (`X-API-Key`) | **Telecaller's call result**: `{"outcome": "interested" \| "meeting_booked" \| "callback" \| "no_answer" \| "not_interested" \| "wrong_number", "notes": "…", "callback_at": "ISO date"}`. The manager plans the next step from it. Saying yes on a call is not messaging consent, so also PATCH `wa_opt_in` / `email_opt_in` when the lead agrees to be messaged. |
| `POST /api/crm/leads/:external_id/proposal` (`X-API-Key`) | Client's decision taken by the telecaller: `{"decision": "accepted" \| "declined", "reason": "…"}`. Accepted sends the advance invoice. |
| `GET /api/crm/leads/:external_id` (`X-API-Key`) | Read our current snapshot. |

**Us → CRM**: set `CRM_WEBHOOK_URL`. Each event is POSTed as JSON with the headers `X-WebStream-Event`, `X-WebStream-Token: <CRM_WEBHOOK_SECRET>` (for n8n's check) and `X-WebStream-Signature: sha256=<HMAC-SHA256(body, CRM_WEBHOOK_SECRET)>`. Events are stored in an outbox first and retried with backoff, up to 8 times, so nothing is lost if the CRM is down.

Events: `lead.created`, `lead.stage_changed`, `lead.next_action` (the scheduled follow-up: `type` call/message/close, `at`, `note`), **`lead.call_requested`** (a call for the telecaller: `due_at`, `goal`, `script` (word-for-word), `call_script[]`, `objections[]`, and `report_outcome_to`), `lead.pitch_ready`, `lead.proposal_sent` (with the `pdf` link), `message.sent`, `lead.reply` (with intent), `lead.call_logged`.
```json
{ "event": "lead.next_action", "at": "…", "detail": { "type": "call", "at": "…", "note": "…" },
  "lead": { "id": 12, "external_id": "CRM-101", "stage": "contacted", "pipe": "conversion", "interested": "yes",
            "score": 78, "next_action": { "type": "call", "at": "…", "note": "…" }, "last_contacted_at": "…",
            "pitch_headline": "…", "links": { "brochure_pdf": "…", "proposal_pdf": "…", "design": "…", "booking": "…" } } }
```
Shared rules: sales and the CRM own `interested`, opt-ins and DNC; the automation owns `stage`, `pipe` and `next_action`.

## Code map
```
src/server.js              Express app, security headers, starts the scheduler
src/db.js                  SQLite schema + helpers
src/settings.js            Default settings, message templates, packages
src/stages.js              Stage definitions
src/scheduler.js           Daily run + sweep
src/digest.js              Daily digest email
src/pipeline/engine.js     State machine and all business actions
src/pipeline/messenger.js  Template rendering, channel choice, caps, window, logging
src/pipeline/channels.js   SMTP + WhatsApp Cloud API (live / mock)
src/pipeline/enrich.js     Website audit (SSRF-guarded) + package recommendation
src/pipeline/scoring.js    Lead scoring rules
src/pipeline/brochure.js   Personalised brochure page
src/ai/claude.js           Claude client: budget, concurrency, pause_turn, structured outputs, cost log
src/ai/playbook.js         Manager persona + rules, lead context builder
src/ai/pitchmaker.js       Web research, pitch, homepage design (+ rule-based fallbacks)
src/ai/manager.js          Message writing, reply analysis, next-action planning, daily briefing
src/crm-sync.js            Outbox + signed webhooks to the team CRM
src/web/api.js             Admin JSON API (cookie auth)
src/web/public.js          Client pages, intake API, webhooks
public/                    Admin single-page app (vanilla JS)
```

## Changes from the n8n reference
| Reference flow | This build |
|---|---|
| "Get a record" processed one company per day | Processes every due lead each run, plus instant event-driven steps |
| No "already contacted" check, so leads were re-messaged daily | Stage machine with `next_action_at`, so each message goes out exactly once |
| WhatsApp and email branches both fired for the same lead | One channel per lead with priority and fallback |
| Email branch ignored "Interested?" | All outreach is gated on interest, score and opt-in |
| Brochure node deactivated; approval checked in the same run | Brochure generated, then a human approval queue, then sent in a later run |
| Logs split across Google Sheets | One event log (exportable CSV) plus a per-lead timeline |
| Stopped after the first message | Covers follow-ups, replies, booking, proposal, payment, onboarding, delivery and review |
| No error handling | Per-send try/catch, channel fallback, error events, failed-message log |

## Before going live
- Set `ADMIN_PASSWORD`, `SESSION_SECRET`, `INTAKE_API_KEY`, `WEBHOOK_SECRET` and an HTTPS `BASE_URL`.
- Get Meta WhatsApp templates approved; verify the business; warm up the number (start with low caps).
- Use a Gmail App Password or a transactional email provider; set SPF/DKIM on your domain.
- Replace the demo checkout with a payment-gateway link and webhook (add signature verification for that gateway).
- Back up `data/crm.db` daily. For multiple instances or heavy volume, move to Postgres and a job queue.
- Make sure every cold lead has documented consent (DPDP Act / WhatsApp Business Policy).
