# Twenty CRM ⇄ n8n ⇄ WebStream: setup

```
Twenty CRM (telecaller)  ──webhook──►  n8n workflow 1  ──►  WebStream  /webhooks/twenty
                                                              │  Pitch Script Maker · Brochure Maker (PDF)
                                                              │  AI Proposal Generator (PDF) · follow-ups
Twenty CRM  ◄──REST PATCH──  n8n workflow 2  ◄──event──  WebStream  (CRM_WEBHOOK_URL)
```

WebStream does the thinking: routing, pitch, PDFs, follow-ups and replies. n8n only moves data between Twenty and WebStream.

## 1. Twenty: custom fields on the lead object (Company by default)

Create these under **Settings → Data model → Companies**. The API names must match `settings.twenty.fields` in WebStream (inbound) and the `F` block in workflow 2 (outbound).

**Filled in by the telecaller (Twenty → WebStream)**

| Field (API name) | Type | Values |
|---|---|---|
| `interested` | Select | `YES` / `NO` / `UNKNOWN`. YES starts the pitch maker; NO sends the lead to the re-engage pipe. |
| `contactName` | Text | The person to talk to |
| `whatsappOptIn` | Boolean | The lead agreed to WhatsApp messages |
| `emailOptIn` | Boolean | The lead agreed to emails |
| `doNotContact` | Boolean | Stops everything |
| `callOutcome` | Select | `INTERESTED` / `MEETING_BOOKED` / `CALLBACK` / `NO_ANSWER` / `NOT_INTERESTED` / `WRONG_NUMBER` |
| `callNotes` | Text | Optional notes for the call |
| `callbackAt` | Date & time | When the outcome is CALLBACK |
| `proposalDecision` | Select | `ACCEPTED` / `DECLINED`. Accepted sends the advance invoice. |
| `declineReason` | Text | Optional |

The built-in fields are read automatically: name, phone (`phones`), email (`emails`), website (`domainName`), city (`address`). Workflow 2 clears `callOutcome` and `proposalDecision` once WebStream has processed them, ready for the next call.

**Written by WebStream (WebStream → Twenty).** Create these as **Text** fields:
`webstreamStage`, `nextActionType`, `nextActionAt`, `nextActionNote`, `callScript`, `brochurePdf`, `proposalPdf`.

Tip for the telecaller: build a Twenty view with the filter **nextActionType = call**, sorted by `nextActionAt`. That's their call list. `callScript` holds the AI-written script for each call.

## 2. Twenty: API key and webhook
1. **Settings → Developers → API → + Create key**. Copy it; it's shown once.
2. **Settings → Developers → Webhooks → + Create webhook**, with the URL of n8n workflow 1:
   `https://YOUR-N8N/webhook/twenty-crm`.
   Twenty sends every event. WebStream only acts on `company.*` (or whatever object you configure).

## 3. n8n
1. Import `1-twenty-to-webstream.json` and `2-webstream-to-twenty.json` (**Workflows → Import from file**).
2. Workflow 1, node **Forward to WebStream**: set the URL to `https://YOUR-WEBSTREAM-DOMAIN/webhooks/twenty`, and `X-API-Key` to WebStream's `INTAKE_API_KEY`.
3. Workflow 2, node **Build Twenty updates**: fill in the CONFIG block: `WEBSTREAM_TOKEN` (= `CRM_WEBHOOK_SECRET`), `TWENTY_URL`, `OBJECT`, and the field names.
4. Workflow 2, node **Update Twenty**: create a **Header Auth** credential with name `Authorization` and value `Bearer <Twenty API key>`.
5. Activate both workflows.

## 4. WebStream `.env`
```
INTAKE_API_KEY=...            # n8n → WebStream
CRM_WEBHOOK_URL=https://YOUR-N8N/webhook/webstream-events
CRM_WEBHOOK_SECRET=...        # WebStream → n8n (sent as X-WebStream-Token + HMAC signature)
TWENTY_WEBHOOK_SECRET=        # optional: also verify Twenty's own signature (forwarded by workflow 1)
BASE_URL=https://YOUR-WEBSTREAM-DOMAIN   # PDF and booking links must be public HTTPS
```

## 5. To verify in your Twenty workspace (could not be confirmed from Twenty's public docs)
- The REST path for the object: workflow 2 assumes `PATCH /rest/companies/{id}`. Check this in the API playground.
- Exact API names of your custom fields, and the casing of Select values (WebStream accepts any casing).
- Optional Twenty Tasks per call request (`CREATE_TASKS = true` in workflow 2): verify the `POST /rest/tasks` body in the playground first. Linking a task to the company isn't wired up yet; the task title includes the company name.

## Test without Twenty
```bash
curl -X POST https://YOUR-WEBSTREAM-DOMAIN/webhooks/twenty -H "X-API-Key: $INTAKE_API_KEY" -H "Content-Type: application/json" \
  -d '{"event":"company.created","data":{"id":"test-1","name":"Test Bakery","contactName":"Asha","phones":{"primaryPhoneNumber":"9876543210","primaryPhoneCountryCode":"+91"},"interested":"YES","whatsappOptIn":true}}'
```
