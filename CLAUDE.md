# web-stream-automation (app: **AxiFlow**; agency: **Codeace**, formerly Axilume)

**Repo:** https://github.com/deepunr-codace/axiflow (branch `main`, first push 2026-11-02). `.gitignore` keeps out `node_modules/`, `data/` (the real lead database and uploads) and `.env*` (except `.env.example`); never commit those.

## Purpose & stack
A working model of a fully automated sales and delivery pipeline for a web-development service: a mini CRM plus an automation engine. It covers lead intake → website audit → score → personalised brochure → human approval → WhatsApp/email outreach and follow-ups → reply handling → booking → proposal → advance invoice → onboarding brief → project milestones → final invoice → review request.

It replaces the n8n flow shown in `reference/Web Development.png`. The README has a table of the flaws it fixes.

**Target architecture (owner, 2026-10-31):** Twenty CRM → n8n automation → Pitch Script Maker → Brochure Maker → AI Proposal Generator. The owner chose: **our app runs the automation** (n8n only moves data between Twenty and our app), and the brochure and proposal reach the client as **PDFs only**. Importable workflows and the Twenty field setup are in `n8n/` (see `n8n/README.md`).

The team's main CRM is **Twenty**, set up by a co-worker and run by the **telecaller**: adding and editing leads and all phone calls happen there. **This system's scope is conversion only**: pitch maker, outreach, follow-ups, replies, meetings, proposals, payments and delivery. Calls are requested from the CRM (`lead.call_requested` event with a script) and results come back via `POST /api/crm/leads/:external_id/call`. Do not add lead add/edit/call-logging UI here. The integration contract is in the README section "Integration with the team CRM".

Stack: Node ≥22.13, Express 5, **Postgres** (Supabase in production via `DATABASE_URL` and `pg`; embedded PGlite in `data/pg` when `DATABASE_URL` is empty), Vercel Blob for uploads (`data/uploads` locally), nodemailer, `@anthropic-ai/sdk` (Claude, `claude-opus-5-5`), and a vanilla-JS admin SPA in `public/`. There is no build step. Code map: see README. The old SQLite file `data/crm.db` is kept only as a backup/migration source.

## Working setup (owner, 2026-11-12): live CRM + AxiCore only; AWC removed
- **Owner:** "remove awc. now on we will work on live setup(crm + axicore - 2 supabase db)".
- **The live setup:**
  - **CRM:** https://atomic-crm-flame.vercel.app; repo karuncodeace/atomic-crm on the co-worker's Vercel; Supabase `vedzrmwpojeyykjkkqyy`. Working clone: the session scratchpad `live-crm`.
  - **AxiCore = this repo:** https://axiflow-v1.vercel.app; Supabase `urjgjuleerifdvuxcmoa`. The CRM proxies the tool paths here.
- **AWC (Axilume Web CRM):**
  - **Removed:** the local folder `Axilume Web CRM/` was deleted (2026-11-12; git was clean and matched GitHub).
  - **Vercel project `axiflow-v1` deleted** (owner: "why two axiflow? delete unused"): the duplicate made by mistake at the first setup (axiflow-v1-alpha.vercel.app, rebuilt on every push). Live AxiFlow is the project **`axiflow`**, which serves axiflow-v1.vercel.app; this folder's `.vercel/` is linked to it.
  - **Vercel project `axilume-web-crm` deleted** (owner, same day; `vercel project rm --yes`; the address now gives 404 DEPLOYMENT_NOT_FOUND).
  - **Kept, unused:** GitHub repo deepunr-codace/axilume-web-crm and Supabase `hzxtdianyucccuogeygw`. Its `axicore-tick` workflow now pings a dead address and fails harmlessly.
  - Do not port changes to AWC. The AWC notes further down are history.
- **Vercel function storage (2026-11-12):** Vercel warned that the team was at 75% of the free 10 GB.
  - **Why:** every push kept a full deployment (163 axiflow, 133 axiflow-v1, 43 axilume-web-crm, 214 presenta, 3 acestudio). Since 11 Nov each AxiFlow deployment includes Chromium (~75 MB), and notes-only pushes deployed too.
  - **Owner: "do it" / "for all projects in the vercel".** Old deployments deleted through the Vercel API (scratchpad `vclean.mjs`): each existing project keeps its current production deployment plus the newest 5; deleted projects lose all of theirs. The API allows about 200 deletions per 10 minutes, so it ran in rounds.
  - **`vercel.json` `ignoreCommand`** (8119d45, fixed in 692514d): a push that changes only `.md` files is not built. It compares with `VERCEL_GIT_PREVIOUS_SHA` (the last deployed commit), not `HEAD^`. The first version would skip a code commit pushed together with a notes commit. If the check fails, it builds. Checked live: the notes-only 6fb4422 shows CANCELED; 692514d built.
  - **Result:** 546 deployments deleted in 3 rounds. Left: axiflow 5, presenta 5, acestudio 3.

## Status (2026-11-13): HTML files as templates; the Ceakay brochure imported exactly (LIVE c87881b; live template id 30)
- **Owner:** "downlds/codeace-brochure-ceakay (1).html import this to templates. add option to upload html files too in template import", then "add this exact template to axiflow templates. need exactly same".
- **Code** (written by an earlier session that ended before testing; finished and tested here): `src/html-docs/imported.js` + `imported-core.js` (the pure part, shared with `claude-worker/validate.mjs`). Templates → "Import PDF or HTML": the file is kept as it is (scripts / remote files removed, Google Fonts inlined), pages found (`.page` / data-page), every text block = a slot `t<n>`; printed by Chromium as on screen (A4 when the pages have its shape). Per lead, Claude rewrites the slots about the sample client ("Prepared for …") and keeps CodeAce's own texts; code checks lengths and that the sample's name, place and web address are gone; `importedLook` = "needs a look" when a text no longer fits. API `POST /api/design/templates/import-html?kind&name&sample` (text body, 4.4 MB). Row: mode html, source `html-import`.
- **Fixed here:** animations stopped in print (the search cursor blinks; a print could catch it hidden); the sample's web / email addresses (`ceakayinteriors.com`) are now words that must go (a whole-word test on "Ceakay" missed them).
- **Ceakay file:** 22 A4 pages, 352 text blocks, sample "Ceakay Interiors, Kottayam", 8 font files inlined, no element moved. Original (Chrome) vs the template's PDF (pdf.js), 2×: 1.4-5.5 % per page, all text-edge anti-aliasing (layout, colours, photos identical).
- **Tests** (`data/tests/`, no real key): `ceakay-e2e.mjs` 18/18 (auth, bad file, list, preview, sample PDF 22 pages, job, answer accepted / refused, document HTML + PDF + layout check, page API), `ceakay-ui.mjs` 6/6 (headless: dialog, card, View 22 pages, no console errors), `ceakay-compare.mjs`; p4-render 7/7, regress-test 17/17, import-all 88.
- **LIVE** (owner: "push", "push directly to vercel"): c87881b pushed, then deployed with `vercel deploy --prod` from a clean `git archive` export. The file was imported on live through the API: **template 30** "CodeAce Website & SEO (Ceakay)", brochure, not the default, 22 pages, 352 blocks, nothing moved, import 7 s. Live sample PDF (Vercel Chromium, 3.7 s, 2.0 MB, 22 pages) vs the original: the same 1.4-5.7 % text-edge differences as locally.
- **Default follow-up (LIVE, see the commit after c87881b):** owner made template 30 the default ("i made it defult but still using old template"). Found: a brochure written again (Try again, Write it again, CRM retry) kept its first template (`generate` used `doc.template_id`), and "Website + SEO" leads use their own type setting (`automation.website_templates.brochure['website-seo'] = 26`, wins over the default). Fixed: `tools.generate()` re-picks `autoTemplate()` for documents the automation made (`input.auto`; design_json cleared on a switch); hand-made ones keep theirs. `data/tests/retemplate-test.mjs` 5/5, regress-test 17/17, p4-render 7/7. Waiting on the owner: push, and whether "Website + SEO" should also use template 30 (Integrations → Templates). The live DB read of doc #493's timing was blocked by the permission check.
- **Owner: "CodeAce Website & SEO (Ceakay) - use this for alll":** live settings saved through the API: `automation.website_templates.brochure` = 30 for all 5 website types (website-seo was 26) and `automation.auto_template.brochure` = 30; template 30 is also the default. Proposals unchanged (CodeAce Proposal).
- **Unreadable import error (owner screenshot; LIVE, see the commit after 3a429a4):** errors showed as a grey box: (1) the monochrome theme sets `--bad` to near-white, so `.toast.err` was white on white (fixed at the end of styles.css: normal toast colours + red edge, dark and light); (2) a toast shown while a dialog is open sat behind its backdrop (`toast()` now moves it into the open dialog; errors stay 5-10 s). The HTML import also writes the error on the dialog's status line. Tested headless: error readable, success import 6/6.
- **"html file too large" (owner; LIVE, see the commit after 1857e78):** the import had a 4.3 MB cap (Vercel refuses requests over 4.5 MB). Now: files over 4 MB are sent in parts of up to ~4 MB (`POST /api/design/templates/import-html/part?upload=<id>&n=<i>`, kept in storage under `html-import/<id>/<n>.txt`; the import call joins them with `?upload=<id>&parts=<n>`; max 12 parts / 40 MB); on import `shrinkInPage` scales every data: picture over 200 KB to 3x its largest drawn box and stores opaque PNG photos as JPEG 0.9 (only when 20% smaller); a template still over 12 MB is refused. The import message says how many pictures were scaled. Tested: a 10.7 MB file (Ceakay + a 4000x3000 PNG as <img> and as a background) uploaded in parts through the dialog, template 12.0 → 2.0 MB, pages compared as before; ceakay-e2e 18/18, regress 17/17, import-all 88. The uploaded parts are not deleted afterwards (small; storage has no delete helper yet).
- **Not seen yet:** a real Claude run on this template for a lead (about 350 blocks to tailor: watch time and the "needs a look" check).

## Status (2026-11-13): CRM brochure rows removed; Delete + Edit in the CRM brochure list (LIVE: AxiFlow c387e7d, CRM 45365434)
- **Owner:** "ABAD FOODS PALAKKAD: website plan remove this from crm, also add option in crm to delete brochure", "edit option also", "Jazaash Design: website plan remove these too".
- **Removed in the live CRM** (looked at first; each was its company's only row): brochures row 8 (ABAD FOODS PALAKKAD, company 58, pending) and row 1 (Jazaash Design, company 35, pending), plus their two PDFs in the `brochure` bucket (public links now "not found"). AxiFlow's own documents were kept (ABAD brochure #490); editing or remaking one sends a new CRM row as usual.
- **Delete:** the CRM's RLS has no delete policy on `brochures` (and a column guard on updates), so a browser delete would remove nothing; changing CRM policies is a CRM DB change (not done). AxiFlow `atomic.js` `deleteCrmBrochure(rowId, by)` (GET the row, DELETE it, remove the PDF only when the link is in the configured bucket, clear `leads.crm_brochure_state`, log `brochure_deleted`) + `POST /api/axicore/brochures/:id/delete` (AxiCore roles only). Note: `atomic.brochures_table` is an on/off switch (`true`), not the table name (the test caught a first version that asked the CRM for table "true").
- **Edit:** CRM row menu "Edit in AxiCore" → the company's newest finished AxiCore brochure (`/api/axicore/company/:id/docs`) opens in the AxiCore editor (`/axicore/brochure/:id`); a saved edit re-uploads the PDF to the same row. No finished AxiCore brochure → a notice.
- **CRM** (`data/live-crm`): `brochures/BrochureParts.tsx` (Edit / Delete in the "…" menu for AxiCore roles, a confirm dialog), labels in English and French. prettier, eslint, tsc, canAccess test pass.
- **Tested:** `data/tests/crm-delete-test.mjs` 7/7 on a stand-in CRM (401 / 404 / row + PDF deleted / lead state cleared and logged / a link outside the bucket leaves files alone / not an open route).
- **LIVE (owner: "yes" to pushing both, AxiFlow first):**
  - AxiFlow c387e7d (atomic.js + api.js only; the brochure session's uncommitted edits were left out).
  - CRM f38d7e11, rebased onto d5289f71 as **45365434**: prettier passes on the committed files, tsc passes.
  - Checked live: `POST /api/axicore/brochures/999999/delete` with the admin login answers 404 "This brochure is not in the CRM any more" (the route is live; nothing deleted). The live CRM bundle `index-KTDSXIDK.js` has the delete call.
  - Not seen yet: a real Delete / Edit click in the CRM brochure list.
- **Still to tell the co-worker:** CRM commits 45365434 and d5289f71.

## Status (2026-11-13): brochures use the template's own photos, not the client's (LIVE b92754a, with the follow-up fixes below; owner: "push")
- **Owner:** "use same image used in the template". Chose "Template's own photos" for "Both" brochure templates.
- **Now:** no photos are collected from client websites for brochures (`collectImages` / `leadImages` / `pickPhotos` stay in images.js, unused).
  - **Growth Brochure (template 25):** `tools.addTemplatePhotos()` (replaced `addClientPhotos`) sets cover = sample-strip, challenge = sample-shelf, closing = sample-cta, as in the template's own sample. Photos added by hand still win.
  - **Designed brochure:** `templateImages()` offers 4 photos (I1 strip, I2 bowl, I3 shelf, I4 wide band) as JPEG copies `assets/html-docs/img/design-*.jpg`. A PDF cannot hold WebP, so Chromium stored them raw: 6.5 MB, now 948 KB.
    - The writer must place at least 3 (`MIN_DESIGN_PHOTOS`; `checkOutput` sends an answer without them back once).
    - The visual review is told to keep them, and `applyReview` refuses a change that drops one. In an earlier run the reviewer removed them all as "off-topic spices for a saree store".
  - **Brief / writer:** they say the photos are CodeAce's decorative design photos, never the client's products.
- **Left out on purpose:** the template's idea-page picture `sample-phone.webp` shows Nirapara's brand (logo, nirapara.com/scan), so no idea-page picture is used.
- **Note for the owner:** the template photos are food and spices (rice, chilli, curry leaves, jars). For non-food clients the review model calls them off-topic.
- **Tested:**
  - Template 25 re-rendered for Thread Stories (template photos, 721 KB).
  - The Designed brochure was generated again on the local CLI (3.3 min, 0 layout issues, photos on cover / drop-off page / closing, 948 KB after the JPEG change).
  - 12 + 22 checks pass.

## Status (2026-11-13): brochure fix guide, Phases 1-5 LIVE in 361f050 (pushed by the SWOT session with its phases, owner: "push all to axiflow"); follow-up fixes LIVE in b92754a
- **End-to-end run** (`compare-brochures.js 276 --only designed`, local Claude CLI, read-only, no API key): **3.3 min in all**.
  - Opus wrote 10 pages in 115 s; the claims check found all supported (11 s).
  - The first render had 5 layout issues; the Sonnet visual review (26 s, 12 turns) redid those pages, and the second render had 0 issues → not "needs a look".
  - The output is clearly better than template 25: real composition, the client's photos, specific facts (244 products, WooCommerce → Shopify, "Share WordPress admin access").
  - **Watch:** the first live brochure run's time (template 25 now runs lean with Opus pinned; one local run took 48 min, the next only 2 min).
- **Follow-up fixes (local, NOT pushed; waiting for the owner):**
  1. **Cover photo was a crystal tree:** the og:image was labelled with the page title ("Handloom Sarees Online…"), so the writer took it for a saree photo. It now has alt '' and a note ("the website's share image; what it shows is not described").
  2. **PDF size:** big photos are scaled to 2,000 px and heavy photo PNGs re-encoded as JPEG (`shrink()` in images.js, through Chromium, no new dependency). The PDF went from 17.6 MB to 2.6 MB; it was over the 4.5 MB a /pdf link can serve on Vercel.
  3. **Dark-page numbers:** card numbers on dark pages were unreadable; they are light now.
  4. **Bottom alignment:** bottom-aligned boxes use `safe flex-end`, so the layout check still sees text that overflows a card (found by the render test after the card change).
  - Checked: 12 + 22 checks pass, and the Thread Stories brochure re-renders with 0 issues.
- **CRM side, not done:**
  - `crm/brochure-rejection-reason.sql` (CRM team);
  - the Documents panel should show `needs_look` / `look_reasons` with a link to AxiCore (the API already returns them).
- **Next:**
  1. Owner: push the follow-up fixes.
  2. Watch the first live brochure (time, PDF size).
  3. Pick the Designed brochure for one real lead, or run `scripts/compare-brochures.js` on the golden set and do the blind review against Claude web (guide section 10) before making it the default.

## Status (2026-11-13): brochure fix guide, Phases 2-5 built: the "Designed brochure" (local, NOT pushed)
- **Owner:** "do all remaining without using our key" (after Phase 1 below).
- **Rules:**
  - No test may use the Anthropic API key: every AI call in testing runs on the local Claude Code CLI (subscription).
  - The production path also avoids the key: write, claims check and visual review all run on the GitHub runner.
  - Template 25 stays the default. The new template is selectable but not the default until the comparison (section 10) is won.
- **Phase 2, brief:**
  - `src/brochure/brief.js`:
    - `briefText()` builds the plain-text brief: BUSINESS, OFFER (decided), PACKAGE, VERIFIED FACTS (V-ids), EVIDENCE (E-ids, gated research), SWOT (approved only, S-S1/S-W1/S-X1 with refs, never cut), CRM (contacts, call notes, team notes, tasks; a deal / call-stage contradiction is said out loud: the interested call wins), LAST REJECTION, IMAGES (I-ids);
    - `buildBrief(leadId, parts)` reads only what earlier stages stored (no AI) and saves it on `leads.brief_json`.
  - **Rejection reason:** `crmLead` maps `brochures[].rejection_reason`. The CRM column does not exist yet: `crm/brochure-rejection-reason.sql` is for the CRM team (not run; the CRM is read-only for us).
  - **Copy brief for Claude:** the lead page More menu → GET `/api/tools/brief/:leadId` (brief + style note, for Claude web).
- **Phase 3, design system and writer:**
  - `assets/brochure-ds/ds.css`: components with fixed boxes and capacities (head / eyebrow / h-display / lead, grid-2/3/4 + card --accent/--dark, stats, statement, quote, split, steps, timeline, photo-panel --left/--right/--full, photo-grid, checklist, metrics, row / col, cover --photo/--type).
    - Themes `ink-red` (default), `ivory-maroon`, `sand-forest`, `slate-blue`.
    - Font pairings `manrope`, `playfair-manrope`, `fraunces-inter` (self-hosted).
  - `src/brochure/writer.js`: catalogue text, the guide's prompts 7.1 / 7.2 / 7.5 (V-ids where the guide says F-ids, noted in the prompt), `WRITER_SCHEMA`, `designedJob()` (Opus, no web, 3 turns), `checkOutput()` (7.3).
  - **The new HTML template** `builtin-designed` "Designed brochure" in `html-docs/index.js`. Page view, design mode, Chromium PDF and CRM delivery work as for the others. It is seeded at start (not default) with a 4-page sample, and `buildClaudeJob` has a DESIGNED path.
- **Phase 4, render and check:**
  - `src/brochure/render.js`:
    - `sanitizePage()` (cheerio; only design-system tags, classes and image ids);
    - `designedHtml()` (header, last-page contact block, theme, fonts inlined);
    - `checkInPage()` (the guide's 6.5 overflow check + headings over 2 lines, empty pages, missing pictures).
  - `claude-worker/designed.mjs` (the GitHub runner, subscription): write + output check + 1 repair → claims check (Sonnet, verdict per claim, find / replace in the page HTML) → render + check → visual review (Sonnet opens the page JPEGs with Read; the guide's 7.4 prompt) → apply, render, check again → `out/result.json` with `check`.
    - **Workflow:** `npm ci` step only for purpose `brochure_designed`; timeout 35 min; AxiFlow re-sends GitHub jobs only after 37 min.
  - **AxiFlow side:**
    - `acceptHtml` sanitises again and runs the output check;
    - `completeDoc` → `designedLook()` runs the layout check on the final pages. Anything wrong, or claims not checked (API backup path: writer only), = **"needs a look"**: not sent to the CRM.
    - The brochure page shows the reasons + "Send to the CRM" (POST `/api/tools/docs/:id/release`).
    - The CRM Documents panel API returns `needs_look` / `look_reasons`. **The CRM UI must show them** (CRM repo change, not done).
- **Phase 5, comparison:** `scripts/compare-brochures.js <lead ids> [--only ps|designed]`:
  - read-only (new opt-in `DB_READ_ONLY=1` in `src/db.js`), API keys removed from the process, local storage, local Claude CLI (`CLAUDE_BIN`);
  - writes `A.pdf` / `B.pdf` (shuffled), `key.json`, `brief.txt` (for the Claude web baseline) and a README per lead.
  - The blind scoring with Claude web, and switching the default, are people's work.
- **Tested:**
  - 12 render / unit checks: sanitiser, data-fit, output check, claims and review applied, designed job, brief text, rejection, acceptHtml, every theme × font renders, the layout check finds overflow and 3-line headings, sample preview + PDF;
  - the 22 Phase 1 checks still pass; all modules import.
  - The sample pages were looked at, and the card / row layout was fixed after the first look.
  - **End-to-end run** (`compare-brochures.js 276 --only designed`): see the note above.

## Status (2026-11-13): brochure fix guide, Phase 1 of 5 (quick wins) built (local, NOT pushed; waiting for the owner's OK)
- **Owner:** "downloads/AxiFlow-Brochure-Fix-Guide.pdf do this". The guide's Appendix A says: one phase at a time, do not push, after each phase rebuild Thread Stories (lead 276, doc 489) read-only, render it to PNG, show the diff + job prompt + pages, wait for the OK. Owner, same session: **"dont use our anthropic key for any testing purpose this task"**.
- **Done in Phase 1 (the guide's section 8, ten quick wins):**
  1. **Nirapara example and copy guard removed from the brochure jobs:** `EXAMPLE_TERMS`, `exampleLeaks` and the validate.mjs check are gone; the guide's style note (`STYLE_NOTE`, section 7.5) replaces the example. The SEO brochure keeps its own wording example; proposals keep theirs.
  2. **Limits as numbers:** `limitsText(schema)` adds a `<limits>` section generated from the schema. `clean()` now cuts at the last whole word within the limit (slack 0 for brochures, 40 for proposals and SEO), and every cut is logged (event `tools / html_cut`, `content.html.cuts`).
  3. **SWOT as numbered lines, uncut:** `swotLines()` (S1/W1/O1/T1/X1); it was JSON cut at 4,000 chars.
  4. **Call notes and business_description:** already done by the SWOT session in crmLead / leadDossier.
  5. **Decided offer:** new `src/brochure/offer.js` `decideOffer()` builds the `<offer>` block (offer + package + timeline) from the CRM website type and the website status in the verified facts. The guide's 6.1 table is followed, plus "Shopify → rework, no re-platforming". **No website type = the brochure is not written** (error: set the type in the CRM, then Try again).
  6. **Brochures: no strategy section, no quality review, no strategy / review in the schema.** The SWOT session asked me to drop the strategy section for script jobs too (same line).
  7. **Lean mode + pinned model for brochure jobs on the GitHub runner** (`job.purpose === 'brochure_html'`; HTML proposals keep the full path):
     - prepare.mjs writes the inline files with the schema in the prompt (no `--json-schema`: 114 fields is the size the API refused);
     - one repair round (new `claude-worker/repair-prompt.mjs`);
     - the workflow reads `job.model` / `job.max_turns` (data-driven, so the SWOT session sets its own); brochures use `claude-opus-5-5`, 14 turns;
     - post.mjs adds the repair run's usage.
  8. **Client photos:** new `src/brochure/images.js` `collectImages()` (home page + up to 3 category pages; logo, hero, ≤10 products; skips < 600 px, icons, payment logos, duplicates; stored in AxiFlow storage under `brochure-img/<lead>/`; cached 30 days in `leads.images_json`). `pickPhotos()` fills the 4 photo areas of the Growth Brochure (wide → cover / closing, tall → challenge / idea page), in `tools.completeDoc` → `addClientPhotos`.
  9. **Chromium PDF to the CRM:** `completeDoc` no longer converts HTML documents to the classic design. `docPdf` prints the HTML unless the classic design was changed by hand (`content.html.design_edited`, set by saveDoc / chat; reset when the words are re-laid out). Applies to HTML proposals too.
  10. **One "Brochure ready" deal note per lead**, updated in place (`atomic.upsertBrochureNote`, `leads.crm_brochure_note_id`); GitHub jobs are never re-sent before 27 min (`retryStale`).
- **Checked:**
  - 22 unit checks (offer table, limits, SWOT lines, word-boundary cut, copy guard gone, job sections, image sizes, photo picking); scratchpad `p1/unit.mjs`;
  - read-only rebuild of doc 489's job (scratch copy with a SELECT-only DB guard; `buildClaudeJob(..., { preview: true })`): 18.3k chars (was 24.7k), offer = "Move the online store threadstories.in (WordPress / WooCommerce) to Shopify", package E-commerce Store about 5 weeks, no Nirapara / strategy / quality.
  - **Real writing run** on the local Claude Code CLI (subscription, not the API key; exact lean runner flags, Opus 5.5, max 14 turns):
    - valid JSON the first time (no repair round), no text cut, 10 turns, 4 web searches;
    - copy specific to the decided offer ("All 243 products… carried over", "Share WordPress admin access for the audit");
    - **but it took 48 min** (48 min of API time for ~19k output tokens; GitHub Sonnet runs did 10k tokens in 72 s). This is over the workflow's 25-min limit: watch the first GitHub run, and consider Sonnet or a lower effort if it repeats.
  - **Rendered** (`p1/finish.mjs` → `p1/out/thread-stories-p01..13.png`, `thread-stories-phase1.pdf`): 13 pages, no heading over two lines, 12 client images collected (7 have AI-tool file names: used last).
    - **Photos:** cover = kurti, challenge = ajrakh blouse, closing = amazonite bracelet.
    - **Idea-page picture dropped:** the cards no longer fit beside it; the render check in `overflowingPages` drops it.
    - **PDF size:** 734 KB, after huge originals were swapped for the site's resized copies (was 8 MB).
    - **Left for Phase 4:** the delivery page's 10-line "includes" list runs into the bottom margin; the existing fit check only splits idea pages.
- **Coordination:** the SWOT-guide session (web-stream-automation-86) works in the same files; agreed split by function (it owns the script branch, the research block, `job.web`, enrich.js and research.js).
- **Note:** the old SWOT doc 244 still says "no phone or email", which is wrong; the SWOT session's fix needs a new SWOT for lead 276.
- **Next:** show the owner the diff (`p1/out/phase1.diff`), the job prompt and the rendered pages; on OK, Phase 2 (brief.js / buildBrief, leads.brief_json, the "Copy brief for Claude" button), after the SWOT guide's phases 1-3.

## Status (2026-11-13): "CodeAce Website & SEO" brochure + "Website + SEO" website type (LIVE: AxiFlow 53bc7dd, CRM d5289f7)
- **Owner:** "downlds/CodeAce Website & SEO Brochure (2).pdf add this template". Chose: tailored to each lead; prices set in Tool settings; "add a Website + Seo category and make this default for that".
- **Template** (`src/html-docs/brochure-seo.js`, sample `samples/codeace-seo-brochure.js` word for word, source `builtin-html-brochure-seo`): 18 A4 pages rebuilt from the picture PDF (cover, contents ×2, intro, who, website, capabilities, Google SEO & AI search, SEO breakdown, more ways, results, our work, brands, packages, package options table, retainer, retainer terms, back).
  - **Placement:** text sits on the PDF's own OCR baselines plus 0.11 × size (the OCR layer sits that much above the real baseline).
  - **Fonts and pictures:** Inter (variable, optical sizes) and Geist Mono in `assets/html-docs/fonts/seo-*`; photos `assets/html-docs/img/seo-*.jpg`.
  - **Layout:** fixed pages (no fit check); the website / capability rows flow with their text.
  - **Check:** compared page by page with the reference.
- **Per lead (Claude):** `BROCHURE_SEO_SCHEMA` (toc lead, intro, who, website lead + 3 services, 3 capabilities, highlighted SEO service, 6 SEO lines, quote, packages lead, 3 package texts, recommended package) plus the fact check.
  - **Process and guide:** the research process with its own step 3 (`processFor`). The example is the brochure's own general wording (`seoExample`), so there is no Nirapara copy guard for it.
  - **Fixed parts:** `cleanSeo` keeps CodeAce's facts (results, clients, brands, numbers, package contents) from the sample and fits each text to its space (`fitLen`: cut at a sentence).
  - **Recommended package:** highlighted in the options table and named "Recommended" on the packages page; the cover says "Prepared for <client>".
- **Prices** (`settings.seo_brochure`: 3 package prices, 0 = "On request"; retainer ₹70,000/month, 6 months): Tool settings card "Website & SEO brochure prices" (`#/settings/seo`). Every "6 months" / "6-month" in the brochure follows the retainer length.
- **Website type `website-seo` "Website + SEO"** (`src/website-type.js`, with build notes for Claude): its brochure template is set once at boot (`automation.website_templates.brochure['website-seo']`, state `html_seo_type_default`; a later choice in Integrations is kept). Other types are unchanged (live default brochure: "Ecom Growth Brochure", id 25).
- **Classic editor:** `public/html-convert.js` now has:
  - `data-ax-bg`: a page or box with layered / radial gradients is captured as a picture on the server;
  - more room (×1.12) for lines that never wrap;
  - tag pills: the words are in their own span, so the dots survive the conversion.
  - **Classic vs HTML:** 5-18 % per page, mostly text edges.
  - **Known gap:** big Inter headings are a little wider in the classic version (Google serves Inter's text cut only; Chrome uses the display cut), the same kind of gap as Fraunces on the old Growth Plan.
- **Tested:**
  - scratchpad `seo/seo-e2e.mjs`: 23 checks on a throwaway DB with a stand-in OpenRouter (row, type default, restart keeps a choice, job content, tailored words, facts kept, recommended, fact check, classic design 18 pages, prices / On request / 3-month retainer, PDF 18 pages, over-long answers, no copy guard, sample clean);
  - the same on an export of the staged commit;
  - the other 3 HTML templates still convert (`bps/classic-unit.mjs`).
  - **Live (53bc7dd):** template row 26, `website-seo` → 26, sample PDF printed on Vercel (18 pages, 6 s, < 1 % different from the local print).
- **CRM (LIVE, d5289f7; owner: "push crm"):** `axicore/packages.ts` gets the "Website + SEO" choice in the Interested popup.
  - Pushed to karuncodeace/atomic-crm main on top of 713c636 (nothing newer on origin). The first local commit 4c6c77cd was lost with an old scratchpad, so the change was redone in a fresh clone (session scratchpad `crm`).
  - Checked: prettier passes (the checkout's CRLF aside); tsc and eslint passed on the identical change earlier. The live bundle `index-BGzYeHbW.js` contains `website-seo`.
  - Not seen yet: the popup with the new choice in a browser with a real login.
- **Not seen yet:** a real Claude run for this schema; the first real "Website + SEO" lead.

## Status (2026-11-13): SWOT fix guide, Phase 1 of 5 done (local, NOT pushed; waiting for the owner's OK before Phase 2)
- **Owner:** "downloads/AxiFlow-SWOT-Fix-Guide.pdf do this guide. dont miss any points. exactly do this". The guide (12 pages, Codeace, 13 Nov 2026): five stages Collect (code, V-ids, `leads.facts_json`) → Research (API, Sonnet 5.5, E-ids, seen-URL gate, 30-day cache) → Gate → Write (no browsing, refs on every point, playbook restricted, no strategy fed in, model pinned) → Check (critic, Sonnet 5.5). Rollout in 5 phases; Appendix A: one phase at a time, after each run the tests, rebuild the Thread Stories job (lead 276) read-only, show the diff and the job, **wait for the owner's OK**, **do not push** (section 9 says "push the local fixes" in Phase 1: Appendix A wins, owner told).
- **Phase 1 (Clean up), done:** contact name equal to the company → "unknown" (`leadPrefill()` + `buildClaudeJob()` for older docs); CRM company and contact phone / email / WhatsApp sent as verified contact details in the dossier; `business_description` read in `crmLead()` and passed (dossier + the vertical check); `call_logs` read in `crmLead()` (`calls`) and the newest 6 call results with notes in the dossier; social links read from the website (`socialLinks()` in enrich.js; an `info` finding; the CRM has no Instagram / Facebook columns and must not change); `crmContradictions()` adds a Warning line when the deal stage and the contact's call stage disagree; "Web research: not run" removed (the block appears only with research); dead `effort` / `maxTokens` removed from `scriptJob()`; the `templateScript()` fallback was already gone.
- **Checked:** rebuilt Thread Stories job (scratchpad `swot-job-244-p1.json`): "Contact person: unknown", website contact line + social pages, CRM verified contact details, business description, the 13 Nov call (Midhun KV: interested), the stage warning, no "not run". Suites (run one at a time: this PC runs out of memory when they run back to back): rulefree 10, nodefault 10, grammar 4, crm-broch 4, fb 14, ai-setup 17; contradiction unit 4/4.
- **Phase 2 (Collect), done (owner's OK):** `collectFacts(lead, { crm })` in `src/pipeline/enrich.js` (cheerio 1.2 added, the guide allows it). Reads the CRM record (company and contact phone / email / WhatsApp) and the website: home, contact page, about page (a same-site link saying about / our story / founders), up to 3 category or service pages from the main menu, robots.txt and the sitemap (robots.txt `Sitemap:` lines, else /sitemap.xml, /sitemap_index.xml; an index's children: up to 5, product / post / category / page first), at most 3 fetches at once, same SSRF guard / 10 s timeout / 5 redirects (`safeFetch` now takes a method for the HEAD checks). Facts `{ id V1…, area, kind seen | absent | not_checked, text, source }`: contact routes (site + CRM), main menu order, platform (generator tag + code), sitemap counts by type, prices per page, out-of-stock products per section (Best Sellers…), images (count, empty alt, AI-tool names like ChatGPT, stock names, camera / WhatsApp names), title / meta / H1 per page + duplicates, JSON-LD @types, tracking (GTM, GA, Meta Pixel), blog link + newest post date, social links, HTTPS, viewport, one load time, footer year, robots.txt, up to 20 internal links (HEAD). A failed page is `not_checked`; a script-rendered home page (< 500 characters of text) gets a "facts limited" fact and no absences. Stored by `saveFacts()` in new columns `leads.facts_json` (the array), `facts_at`, `site_fingerprint` (sha1 of the home page text, for the Phase 3 cache). `auditWebsite(url)` is now `collectFacts().audit` (the old findings, same rules, from the same pages). Wired: `buildClaudeJob()` collects once per job and returns `facts` (no save, so read-only rebuilds stay read-only); `sendToClaude()` saves them; the pipeline's first step and the lead page's re-audit collect and save. The SWOT prompt is unchanged until Phase 4.
- **Checked:** Thread Stories: 31 website facts + 2 CRM facts = 33 (guide: 15 or more), incl. menu order (Healing Crystals before the sarees), "2 of 8 products in Best Sellers marked out of stock", "8 of 113 images have file names from an AI image tool (ChatGPT)", 70 camera-named images, missing meta descriptions on the category pages, GTM + Meta Pixel, sitemap 244 products / 60 categories / 22 posts; about 20 s. No website / unreachable (not_checked, no absences) / private address (blocked) cases; facts saved and read back on a throwaway DB; suites nodefault 10, rulefree 10, grammar 4, crm-broch 4, fb 14, ai-setup 17. Not built: the optional PageSpeed / SEO-data APIs (owner, 2026-11-13: "paagespeed/seoapi pls skip").
- **Phase 3 (Research + Gate + cache), done** (owner: "dont use our key for testing": all tests on a stand-in Anthropic API; memory `no-real-keys-in-tests`):
  - `src/pipeline/research.js` `runResearch(leadId, { facts, fingerprint, crm, input, force, preview })`: the guide's research system prompt (6.1) word for word + its schema; `researchPrompt()` = the `<lead>` block (business, website, city, sector, CRM description, social pages from the facts + CRM LinkedIn) and `<verified_facts>` ("V3. text (source)") only, never the job prompt (P9); `runText()` with `claude-sonnet-5-5`, `web_search_20260209` max_uses 6, `web_fetch_20260209` max_uses 8, effort medium, 16k tokens, pause_turn resume as before; the answer is parsed and checked with `checkSchema(RESEARCH_SCHEMA)`, one correction call without tools if it fails; `seenUrls()` (the guide's code) over all content blocks; saved in `leads.research_json` = the pack (keys business_summary, what_they_sell, target_customers, online_presence, pain_points kept) + `_seen_urls`, `researched_at`, `fingerprint`, `model`, `source: 'research'`. Cache: reused when younger than 30 days and the website fingerprint is unchanged; `force` reruns; `preview` never calls or saves (returns the request).
  - `ai/claude.js` `runText()` returns `message: { content (every block of every turn), stop_reason, model }` too.
  - Gate: `tools.usableResearch(r, { hasWebsite })` exactly as in 5.3 (drops evidence whose URL the run did not see; < 5 left → null; a website but no website-area evidence → null).
  - `buildClaudeJob(doc, s, { preview })`: collect → research (cached) → gate; a SWOT on thin or failed research throws "Research thin, needs a look: … Nothing was written." (shown with Try again in the CRM); brochures and proposals use the pack when it passes, else go on without it. The usable pack (without `_seen_urls`) is the writers' `research` (the SWOT's "Web research" block, the HTML templates' `<research>`, the proposal's earlier research). `researchFor()` and the dossier's "Earlier research" line (old pitch-maker research) removed.
  - CRM "Refresh research": `POST /api/axicore/company/:id/research` (OPEN_ROUTES; collects the facts again, then `runResearch(force)` in the background; 409 while running); the company docs list returns `lead.research` (`researchSummary`: researched_at, evidence, kept, usable) and `researching`; `plainDocError` explains "Research thin". CRM `CompanyDocuments.tsx` (clone `live-crm`, **uncommitted**, on top of another session's unpushed commit 4c6c77cd and the co-worker's e646dd63): a research line ("Research: <date> · N sourced facts" / "too thin to write from" / "Not researched yet") with a Refresh research button; tsc, eslint, prettier pass.
  - **Checked:** `research-test.mjs` 17/17 on the stand-in (model / tools / input, pack + seen URLs, unseen evidence dropped, cache across documents, fingerprint change, 30 days, one correction, thin → no SWOT, CRM summary, Refresh research 200 / 409 / 401 / 404, no key → no SWOT, preview calls and saves nothing); the six older suites pass with a seeded pack (`research-seed.mjs`). Thread Stories rebuilt read-only: the research request (lead block + 33 verified facts) shown, not sent. Found: the live DB has no facts columns yet (added at start-up of the new code); `runResearch` reads the lead with `SELECT *`.
  - **Result blocks, checked against the API docs (no key; owner 2026-11-13 "Only no key for testing": production research and the critic stay on the API key, no test or check may use it):** `web_search_tool_result.content` = list of `web_search_result { url }` (an error is a single object); `web_fetch_tool_result.content` = `web_fetch_result { url, content: document, retrieved_at }` (an error is `web_fetch_tool_result_error`, no url). The `_20260209` tools filter through code execution and the docs say those calls can come back as nested pairs with a `caller` field, so `seenUrls()` now walks nested blocks too (and skips fetch errors); unit-checked on documented + nested shapes.
- **Scratchpad lost (2026-11-13, ~12:57):** the session temp scratchpads were emptied: the `live-crm` CRM clone (with another session's unpushed commit 4c6c77cd "Website + SEO" popup, and my uncommitted research line in `CompanyDocuments.tsx`) and every scratchpad test suite (research-test, rulefree, nodefault, grammar, crm-broch, fb, ai-setup, `an-standin.mjs`, bps/*, seo/*) are gone. Before the next phase: rebuild the stand-in API and the suites; re-clone the CRM and redo both CRM changes when needed. Keep future test scripts in a git-ignored folder in the repo (e.g. `data/tests/`) so they survive.
- **Phase 4 (Write), done (owner's OK; local, NOT pushed):**
  - `src/ai/script.js`: `context(input, facts, research)` per the guide's 6.2 sketch (`<verified_facts>` "V3. text (source)" + `<evidence>` = the gated pack's evidence / competitors / not_checked; "Website check" / "Web research" gone). **One addition to the sketch (flagged to the owner):** absent / not-checked facts carry their kind, "V19. (absent) …", because the guardrail lets a "missing" claim rest only on an absent fact and the sketch's line hides the kind. `SWOT_BRIEF` = the guide's SWOT rules; quadrant items `{text, refs, basis: evidence|market}` + `swot.to_confirm` (6.3); `packagesLine()` exported.
  - `postScript(content, input, { ids })` flattens to the same string arrays (swotText / renderSwot / swotSection / swotLines / swotPdf unchanged) and stores `content.swot_refs` ([{ quadrant, text, refs, basis }], matched by text) and `swot.to_confirm`. In code: ids written in the sentence ("[V6]") count and are stripped from the text; ids the job did not give are removed; an evidence point with no id, or a market point in strengths / weaknesses, is dropped (`swot_dropped`); a quadrant left empty fails the try (no filler). Plain-string answers of jobs built before this (ids unknown) are still accepted.
  - `src/ai/claude-jobs.js`: `SWOT_GUARDRAILS` (the guide's 4 lines) in guardrails(), the guide's `<process>` and output contract word for word.
  - `src/tools.js` buildClaudeJob: script branch passes the facts; `ctx.ids` = the job's V/E ids; `job.web = !(script && research)` (the writer does not browse); `job.model = 'claude-sonnet-5-5'` for script (the workflow passes job.model as `--model`: the other session made claude-generate.yml data-driven, so the yml itself is unchanged); strategy section skipped for script (line edited by the brochure session on request), playbook kept. `saveDoc`: a hand edit keeps the refs of unchanged points and the to-confirm list.
  - `src/claude-worker.js`: runOnApi never researches for script jobs; postProcess passes `ctx.ids`. `prepare.mjs` already says "Do not research; use only the data in the task." when job.web is false.
  - **Checked:** answer checks 11/11 and the SWOT PDF / text from a refs answer (no DB: `data/tests/p4-test.mjs` part 1, `p4-pdf.mjs`); Thread Stories rebuilt read-only (`data/tests/rebuild-readonly.mjs`: every non-read DB statement blocked at the pg driver, incl. the start-up schema step; result `data/tests/swot-job-244-p4.json`): 33 verified facts, guide process / rules / guardrails / contract, no website-check or web-research block, no strategy, playbook kept, model pinned, schema points with refs. Live lead 276 has no research pack yet, so that rebuild shows `<evidence>` none and web true (a real run without a usable pack stops with "Research thin").
  - **Full tests (owner: "run tests without using my key"; run once memory was free; no `.env`, fake key, stand-in API `data/tests/an-standin.mjs`):** `p4-test.mjs` 29/29 (job with a usable pack: web false, model pinned, no strategy, playbook kept, schema; full run on the API engine: one writer call, no research call, no tools, refs stored, hand edit keeps refs, PDF); `p4-render.mjs` 6/6 (brochure job reads a refs SWOT as plain lines, proposal job builds, all 4 HTML templates print: 12 / 14 / 13 / 18 pages). Brochure jobs now need the lead's website type (the brochure session's rule): test leads must have one.
- **Phase 5 (Check), done (owner: "do all remaining without using our key"; local, NOT pushed):**
  - `src/ai/critic.js`: the guide's critic prompt (6.4) word for word, `CRITIC_SCHEMA`, `criticPrompt()` (the same fact lines as the writer + evidence + the SWOT with refs), `applyCritic()` in code (unsupported → dropped, overstated → the fix, ids stripped; solutions' problems likewise; a quadrant may stay short, never padded; `content.swot_check = { status, model, at, checks, removed, changed }`), `checkSwot()` = runJson Sonnet 5.5, no tools, 2,000 tokens, effort low. **When the critic cannot run** (no key, spend limit, error) the SWOT is kept with `swot_check.status = 'not_checked'` + reason (the guide does not say; owner told): the person approving sees it.
  - `claude-worker.js` postProcess (script): postScript → checkSwot → `content.sources` (id → "fact (source)" for the cited ids). The job's `ctx.sources` (facts, evidence, competitors) is stored with the job; a job built before it skips the critic.
  - **Approve SWOT** (guide 5.6): columns `docs.approved_at` / `approved_by`; `tools.approveSwot()`; `POST /api/axicore/docs/:id/approve` (AxiCore roles only, NOT in OPEN_ROUTES) and `POST /api/tools/docs/:id/approve`; 404 unknown / not a live CRM lead, 409 not finished / already approved. `leadSwot()` returns only the newest **approved** SWOT, so brochures and proposals get no SWOT until one is approved (htmlJob's "No SWOT has been made" path). A hand edit clears the approval (keeps swot_check, sources, refs of unchanged points). The CRM docs list adds per SWOT: approved_at / approved_by / can_approve (newest ready SWOT, AxiCore role) / check summary / to_confirm count. **Existing SWOTs are not approved, not re-run and not removed** (owner, 2026-11-13: "dont re run existing swots. i will re run manually. dont remove existing swots").
  - Brochure and proposal jobs get a `<verified_facts>` section (`factsSection()` in tools.js, same lines; a fact taken from it counts as confirmed with its V-id as the source). The brochure session agreed (its FACT_STATUS needs nothing new).
  - Script page (`public/scripts.js` renderSwot): source tags under each quadrant (hover = the fact), "market" tag, a Review card (removed / reworded / not checked, to-confirm list), Approve SWOT button / "Approved by"; an edit asks for approval again. Styles `.sw-*` at the end of styles.css.
  - CRM (`data/live-crm`, a fresh clone in the git-ignored data folder; **local commit 713c6368 on top of the co-worker's 602791a2, NOT pushed**): `CompanyDocuments.tsx` research line + Refresh research (the lost uncommitted change redone) and per SWOT the review line + Approve SWOT button. prettier, eslint, tsc pass.
  - **Golden set** (guide section 8): `tests/golden/fixtures.json` (only Thread Stories so far, written from AxiFlow's verified facts: 10 true, 5 tempting false incl. "no phone or email" and "Mumbai"; the owner reviews it and adds 9 leads) and `scripts/golden-set.js` (`npm run golden`): checks each golden lead's latest SWOT, read-only by default (every DB write blocked at the driver); `--from file.json` checks contents without a DB; `--generate --yes` writes new SWOTs first (real AI spend: only when the owner runs it). Runs saved in `data/golden-runs/` and compared with the previous one.
  - **Tests (all in `data/tests/`, no real key, stand-ins):** p5-test 27/27 (critic applied, critic call Sonnet / no tools / 2,000, critic down → not checked, approve API 200/409/404/401, brochure without SWOT before approval and with it after, facts section, edit clears approval, golden runner pass + catches false claims), p5-ui 8/8 in headless Edge (tags with hover, review, to-confirm, approve, edit re-asks, phone width, no console errors), p4-test 29/29, p4-render 7/7 (incl. the brochure session's new 4-page `builtin-designed`), regress-test 17/17 (AI off → no content + reason; Try again 200/409/404/401; GitHub dispatch with the pinned model and no browsing; callback 401/404/200/409 through the critic; GitHub down → API backup, no research call, no tools), crm-test 6/6 (no finished brochure → nothing to the CRM; finished → PDF to the bucket + pending row; one deal note; SWOT note without [ids]; nothing outside the allowed tables), import-all 86 modules. p5-ui can time out when run right after the print tests on this busy PC; alone it passes.
- **LIVE (owner: "push all to axiflow", "check whts the recent crm push and if that is ours then push that too", "directly push to vercel"):** AxiFlow **361f050** (SWOT phases 1-5 + the brochure session's brochure phases, one commit; secret scan clean) pushed after checking origin/main was unchanged; Vercel built it from the push in 28 s (Production, aliased to axiflow-v1.vercel.app), so no separate CLI deploy was needed. Checked live: health 200, `/api/axicore/docs/1/approve` 401 without login, the new script page served. CRM: the newest CRM push before ours was the co-worker's 602791a2 (karun@codeace.com, "Sync contact status with lead stage"); ours **713c6368** (Documents panel: research line, Refresh research, SWOT review + Approve SWOT) pushed on top of it; the live CRM bundle contains it. Not yet seen live: a real research / critic run (the owner re-runs SWOTs by hand), an Approve SWOT click by a CRM manager.
- **Still to tell the co-worker:** CRM commit 713c6368 (axicore/CompanyDocuments.tsx only).

## Status (2026-11-13): OpenRouter (free AI) removed from AxiFlow completely (local, NOT pushed)
- **Owner:** "remove all free ai from our axiflow(openrouter)" (the live key had already been removed from Vercel and `.env` the same morning).
- **Code:** `ai/claude.js` is the Claude API only (`orRun`, `orModel`, OpenRouter errors, the `:free` model branch and the in-app backup provider `withBackup` deleted; `aiProvider()` always 'anthropic'; a forced provider other than anthropic is refused). `claude-worker.js` ENGINES = github | anthropic (`missingFor`, `API_MODEL`, the research tools follow). `keys.js`: no OPENROUTER_API_KEY entry or key test. `integrations.js`, `.env.example`, `public/app.js` (Integrations / Settings key rows) no longer mention it.
- **AI page:** two accounts (Claude subscription, Anthropic API); the editor assistant is Anthropic or Off with no backup choice; no OpenRouter models in Advanced; OpenRouter is refused on save ("Unknown AI"). The "off" sentence and toast now say documents fail with Try again (no standard text).
- **Saved settings:** `settings.js` `dropOpenRouter()` on every load: ai.provider → anthropic, `openrouter_model` dropped, an OpenRouter main engine → anthropic, an OpenRouter backup → none, `api_model.openrouter` dropped (saved with the next save).
- **Also:** the "CodeAce Website & SEO" template (another session's commit 53bc7dd) filled any empty tailored text from its sample: `cleanSeo` now fails the try when a tailored field is empty; the growth brochure's empty idea-page heading ("The Ideas") fails too. Its committed `fallbackData` (definition only, no caller) is deleted again in the working copy.
- **Tested:** the three suites that used a stand-in OpenRouter now use a stand-in Anthropic API (scratchpad `an-standin.mjs`, streamed answers): fb-test 14/14, grammar-test 4/4, ai-setup-test 17/17 (rewritten: API key outage → subscription, spend limit → subscription, assistant on Anthropic, OpenRouter refused, old OpenRouter settings converted); rulefree 10/10, nodefault 10/10, crm-broch 4/4. AI page in headless Edge on a live-like DB: no "OpenRouter" text, two account cards, no console errors.
- **Next (owner's go):** push everything from today that is local (contact-page check, no rule-based generation, OpenRouter removal), then redo Thread Stories' SWOT and brochure.

## Status (2026-11-13): rule-based generation removed everywhere; research always on (local, NOT pushed)
- **Owner:** "remove rule based default generation from the system completely(swot,brochure,proposal, etc & everywhere). use only reasearch".
- **Pipeline (`pipeline/engine.js`):** `runPitchMaker` (rule-based pitch + `lead.pitch_ready`) and `generateBrochure` (built-in HTML brochure, `brochure_version`) deleted. Stage researching → only `runLeadTools` (Claude SWOT if none + brochure) → brochure_ready. A lead turning interested by reply or call → `armLead` (the AI tools, unless a brochure is ready or being written). `approveBrochure` makes nothing. `regenerateBrochure` = a new AI brochure (`runLeadTools({ force: true })`). `createAndSendProposal` needs a finished proposal document (`docId`), else throws; `startProposal` always makes the AI document and returns `{ error }` if it fails (no built-in proposal); the CRM moving a lead to proposal_sent → `startProposal`. Lead actions: regenerate = new AI brochure, repitch = new AI SWOT, pitch_note only saves.
- **Deleted:** `src/ai/pitchmaker.js`, `src/ai/proposal.js`, `src/pipeline/brochure.js`, `src/pdf/pdf.js`, `templateScript` + `writeScript` (script.js), `writeBrochure` (brochure.js), `writeProposalDoc` (proposal-doc.js), `fallbackData` (html-docs/index.js). `tools.writeDeck` (another session's uncommitted edits are inside it) now throws at its first line; it has no caller. `/b/:token` (old HTML brochure page) redirects to the finished brochure's PDF or 404s.
- **Kept on purpose:** `templateBrochure` / `templateProposal` only supply agency facts around the AI's text (contact, portfolio, logo) and the sample preview on the Templates page; message templates and the message manager's rule fallbacks (`ai/manager.js`; channels are mock).
- **Research always on:** `job.web = true` for every job (tools.js, claude-freeform.js); the AI page switch "Research each business on the web first" is replaced by a note; `saveAiSetup` ignores `web_research`.
- **Tested:** `rulefree-test.mjs` 10/10 (pipeline → SWOT + brochure to the AI, no pitch / built-in brochure / pitch_ready; every job web: true even with the old setting off; proposal without a document refused; AI off → startProposal error, no proposal; interested call → AI brochure; rebuild brochure → one more AI brochure; /b/ 404 then 302 to the PDF), nodefault 10/10, grammar 4/4, crm-broch 4/4, fb-test 14/14, ai-setup-test 17/17 (stand-in answers now built from the schemas; research check updated).

## Status (2026-11-13): wrong "no phone or email" in Thread Stories' SWOT (fixed locally, NOT pushed)
- **Owner:** "check thread stories swot. swot says there is no phn number & email in the contact page", "https://threadstories.in/contact-us/ this also have phn and email. why swot wrong?".
- **Found:** the lead's site is threadstories.in (Palakkad, Bindu and Dhanya; the CRM website). Its `/pages/contact` → `/contact-us/` lists contact@threadstories.in and +91 90742 25900. (threadstories.co.in, which the owner opened first, is a different Mumbai business.) SWOT #244 (Claude, GitHub, 2026-11-06) said 4 times there is no phone or email; brochure #489 repeated it. Cause: AxiFlow's website check read only the home page (no phone there) and said "No WhatsApp chat button" / "No enquiry/contact form. Visitors have no quick way to reach you"; Claude turned that into a contact-page claim and its own browsing did not correct it.
- **Fixes (local):**
  - `pipeline/enrich.js`: `contactDetails(html)` (tel: / mailto: links, phone numbers and emails in the visible text, WhatsApp link, contact form) on the home page AND the contact page (`contactLinks`: a same-site "contact" link, else /contact, /contact-us, /pages/contact). A finding of severity `info` lists the phones and emails found and which pages were checked; "no phone or email", "no WhatsApp", "no enquiry form" now name the pages checked. `issues` counts only real problems; `audit.contact` holds the details. `WEBSITE_CHECK_RULE` (never claim a missing phone / email / WhatsApp / form unless the website check says so) is added to the SWOT context, the HTML template `<website_check>` and the deck brochure notes. `info` findings are kept out of the old problem lists (pitch maker, messenger, scoring, old brochure / pdf).
  - No default content in the post-processors either: `postScript` (no rule-based fill-in; a missing summary / quadrant / pitch point / <2 solutions fails the try), `postProposal` and `postBrochure` (every AI field required) throw "the … answer was incomplete (…)".
- **Tested:** the check on threadstories.in (finds both, contact page /contact-us/), threadstories.co.in, codeace.com, example.com ("no contact page found"); strict-answer unit checks 6/6; fb-test 14/14 and ai-setup-test 17/17 (their stand-in SWOT answers made complete), grammar 4/4, crm-broch 4/4, nodefault 10/10.
- **Next (owner's go):** push; then redo Thread Stories' SWOT (#244) and brochure (#489) so the CRM note and brochure are corrected.

## Status (2026-11-13): no default content ever; Try again in the CRM (pushed with the fixes below)
- **Owner:** "push. make sure dont generate any default bad content at any cost. disable that option fully. if any AI is failed or any error show a try again button in crm", then "remove openrouter keys".
- **No default content:** `tools.generate()` has no non-AI path any more: AI writing off, a local server or an imported PDF template → the doc fails with `noAiReason()` (rule-based SWOT, template general copy `fallbackData`, the smart template writers and the token-filled imported template are no longer used by it). `pdf/docs.js` `buildBrochureFor` / `buildProposalFor` print only a finished document (`readyBrochure`, `readyProposalDoc`; class `NoDocument`): the old built-in "website plan" brochure and built-in proposal are gone; `/pdf/brochure/:token` and `/pdf/proposal/:token` answer 404 without one. The CRM "Brochure ready" deal note only goes with a real upload.
- **Try again in the CRM:** `GET /api/axicore/company/:id/docs` adds `error` (plain words, `plainDocError`), `detail` (raw, 300 chars) and `can_retry`; new `POST /api/axicore/docs/:id/retry` (OPEN_ROUTES, any CRM user; only a failed doc of a live CRM lead: 409 for ready / working, 404 unknown). CRM `axicore/CompanyDocuments.tsx`: "Failed" + reason (raw detail on hover) + Try again button, "Last PDF" of the last finished version, checks again every 15 s while something is being made.
- **Tested:** `nodefault-test.mjs` 10/10 (all 3 kinds fail with the reason and no content when AI is off; brochure link 404; CRM list; retry 200 / 409 / 404 / 401) plus the suites below, all on an export of the staged commit. CRM: tsc, eslint, prettier, vite build.
- **LIVE:** AxiFlow ef4baaf (pushed after checking origin/main; only my hunks: another session's uncommitted work in `src/tools.js`, `public/app.js`, `src/design/*`, growth assets stays local); CRM 5b9d183b on top of 16b3832a (co-worker had pushed nothing). Checked live: retry 401 without login, 409 on a ready doc; the company docs list has error / detail / can_retry; the live CRM bundle has the Try again button.
- **OpenRouter removed** (owner: "remove openrouter keys"): editor assistant switched to the Anthropic API key first (it was the only OpenRouter user; AI page now shows OpenRouter not set up, used for nothing); `OPENROUTER_API_KEY` removed from Vercel project `axiflow` (Production + Preview) and from local `.env`; redeployed from a clean `git archive` export (a `vercel redeploy` of the same commit is cancelled by the ignoreCommand). The key itself is not revoked at OpenRouter: the owner can delete it at openrouter.ai.
- **Not seen yet:** a real failure showing in the CRM panel and a Try again by a CRM user; the API JSON-text path on the real Anthropic API.

## Status (2026-11-13): Thread Stories bad PDF + API backup refused (pushed together with the entry above)
- **Owner:** "if api and claude web failed, the system generating a bad brochure", then "check wht happend to threadstories brochure? it first generated a bad pdf, then i manually run then only mangr got the new brochure".
- **Live log of lead 276 / doc 489 (2026-11-13 UTC):**
  - 04:52 the lead turned interested; #489 went to GitHub; at the same second the old pitch maker made its built-in "website plan" (brochure_version 1) and `lead.pitch_ready` uploaded that **11 KB PDF** to the CRM (the bad PDF the manager got);
  - 04:53 GitHub run ended without `out/result.json`;
  - 04:55 the API backup got 400 "The compiled grammar is too large" (HTML brochure schema = 114 fields), and retry() gives up at once on a 4xx → error;
  - 05:04 the owner's manual rerun (GitHub) worked and the real 236 KB PDF replaced the file;
  - 05:10 the deal moved to `not_interested` but the setting key is `not-interested`, so the action fell back to the call stage ("interested").
- **Fixes (local):**
  - `atomic.js` `upsertBrochure` and `answerBrochureRequests`: only a ready brochure doc with a design or HTML content goes to the CRM; never the old built-in layout (`buildBrochureFor` fallback). Without one: skipped, logged; the finished doc sends `lead.brochure_ready` itself.
  - `atomic.js` `lookupStage` / `actionFor` (exported): stage names compared without case, spaces, "-" or "_" (deal stages and call stages).
  - `claude-worker.js` `runOnApi`: schemas over 80 fields (or >12 unions, or kind free) ask for JSON text; any other schema the API refuses as too complex (`SCHEMA_REFUSED`) switches to JSON text in the same try. `jsonTextAnswer` checks the answer with the shared `src/ai/schema-check.js` (soft: fonts, strategy, review, gaps, verification), one repair round with the problems if under 130 s, else the try fails (no half-empty brochure).
  - `claude-worker.js` `toolKind`: `html` jobs (Codeace HTML templates) use the brochure / proposal tool's engine and backup (before, they matched no tool and followed `claude.fallback_engine`).
  - Worker: `claude-worker/post.mjs` adds Claude Code's stop reason (e.g. error_max_turns, steps) when `out/result.json` is missing; `INSTRUCTIONS.md` lists kind `html` and says to write a complete first file early; `validate.mjs` imports `checkSchema` from `src/ai/schema-check.js`.
- **Tested** (scratchpad): `grammar-test.mjs` 4/4 (big schema → text, missing section repaired, never-matching → error not laid out, proposal strict refused → text), `crm-broch-test.mjs` 4/4 (pitch_ready / failed doc → no CRM write; finished doc → 490 KB upload + row; stage names), `fb-test` 14/14, `ai-setup-test` 17/17, worker validator on a scratch copy.
- **Not checked live:** the real Anthropic API with the JSON-text path (stand-in only).
- **Done since:** the "CodeAce Website & SEO Brochure" template (see its own section above).

## Status (2026-11-12): the AI page (#/ai): everything about AI in one place, in plain words
- **Owner:** "make the AI integration properly. its now not understandable. add one ai integration page - enable disable - key adding options - fallback options etc. it should be user friendly". The owner also asked for simple English explanations in this session.
- **Before:** AI was spread over the sidebar Claude button, Integrations (Claude mode card with engine / engine per tool / fallback_engine, the Keys card with AI and GitHub groups, the Editor AI card) and Tool settings (Claude mode and AI writer cards). It used technical words, and there was one backup for all documents, only from the subscription to an API key.
- **The page** (`public/ai.js` + `public/ai.css`, server `src/ai-setup.js`; menu Options → AI; the sidebar row is now "AI writing"):
  1. **"AI writes your documents"** = `claude.mode`, with a generated plain sentence about who writes what and which backup can take over, plus a grouped list of problems.
  2. **Who writes what:** SWOTs, Brochures, Proposals and the Editor assistant, each with a "Written by" and an "If that fails" select, plus a status chip. Accounts that are not set up are greyed out. Changes save at once. The same card has "Research each business on the web first" (`claude.web_research`).
  3. **Your AI accounts:**
     - **Claude subscription through GitHub** (full width): status (working / last answer / resting until the reset), what it is used for, a Check button, and a 3-step setup that folds away once it works:
       1. the GitHub access key;
       2. the Claude login (`claude setup-token`, saved straight into GitHub);
       3. the return key ("Set up automatically" = generate `CLAUDE_WORKER_SECRET` if missing and copy it to `AXIFLOW_CALLBACK_SECRET`).
     - **Anthropic API** and **OpenRouter:** key saved / last 4, Test, Replace, Remove, a "get a key" link; a new key is tested at once.
  4. **Paid AI spending:** today against the limit (bar), this month, the daily limit (`ai.daily_budget_usd`; $0 = never use paid AI).
  5. **Recent AI work:** the last 8 documents, who wrote each, "(backup)" with the reason on hover, and the status.
  6. **Advanced** (folded): models for documents and for the assistant on each API, wait minutes, tries, GitHub repository.
- **API:**
  - `GET/PUT /api/ai-setup`. The save refuses AI writing on with a main AI that is not set up, and the assistant on a missing key.
  - `POST /api/ai-setup/check-github`: repo, workflow, push right, secret names. It records the secrets it finds in state `github_secrets`, so the steps tick.
  - `POST /api/ai-setup/return-key`.
  - Keys still go through `/api/keys`.
- **Engine changes:**
  - **Backup per job:** `claude.fallbacks = { script, brochure, proposal }`, each an engine or 'none'. A job without its own choice follows the old `claude.fallback_engine`, so live behaviour is unchanged until something is picked (`backupSetting`, `backupEngine`, `fallbackFor(engine, kind)` in claude-worker).
  - **The backup works from any main:**
    - an API key failing or reaching the spend limit, or no answer in time, moves the job to its backup, including the subscription;
    - a main that is not set up hands the job straight to its backup;
    - a job moves once (no ping-pong); a paid backup that hits the spend limit hands the job back to its main.
  - **Editor assistant backup:** `ai.backup_provider` in `ai/claude.js` (`withBackup`). It is used once on a failure or a missing key, not when AI is off or the spend limit is reached, and never for forced document calls.
- **Integrations and Tool settings:** their AI cards are replaced by one link card. The AI key groups left the Keys card; the scheduler's CRON_SECRET GitHub row moved to the sync group. The "missing" texts on documents now point to the AI page.
- **Tested** (scratchpad):
  - the old 14-check backup test `fb-test.mjs` passes unchanged;
  - `backup-logic.mjs` (12 pure checks);
  - `ai-setup-test.mjs` (17 checks on a throwaway DB with stand-in GitHub / OpenRouter / Anthropic): per-job none, OpenRouter outage → subscription, spend limit → subscription, assistant backup, forced calls untouched, save rules;
  - headless Edge `live-crm/ai-ui.mjs` (switch refused then on, selects, GitHub key, check, return key, backup, limit, advanced, Integrations and Tool settings link cards, phone 390 px without overflow, light theme) and `ai-ll.mjs` on a live-like seeded DB (summary "Your Claude subscription writes SWOTs, brochures and proposals. If it fails or reaches its limit, your Anthropic API key takes over.", no problems, all Ready, no console errors).
- **Memory note:** this PC was at ~0.7 GB free commit charge. A leftover test server of mine (port 3417) was stopped; servers on 3150 and 3477 were not mine and were left. Run tests with `--max-old-space-size=256 --max-semi-space-size=1`.

## Status (2026-11-12): instant CRM → AxiCore sync (LIVE on both sides; the 5-minute timer is waiting on the owner)
- **Why:** no instant link existed. The CRM DB trigger was never installed on the live CRM (last `crm_webhook` 2026-11-06), and GitHub's "every 30 min" `axiflow-tick` really runs every 4-10 h. Measured: lead 473 waited 221 min for its SWOT; leads arrived within minutes only while someone used AxiCore.
- **Owner's workflow plan (chose "start.. 4 will do later"):**
  1. The CRM app tells AxiFlow after every save, plus a 5-minute backup check.
  2. Progress shown in the CRM ("SWOT being written…").
  3. Manager alert for brochures/proposals waiting for approval.
  4. Real WhatsApp / email sending (later).
  - The owner also asked for simple English explanations in this session.
- **AxiFlow (live, e199431):**
  - `POST /api/axicore/changed` (OPEN_ROUTES, any CRM user): one `pollCrm({force})` 1.5 s later per burst, then flushOutbox; `seen('crm_app')`.
  - `/webhooks/atomic?from=backup` records `crm_backup`.
  - Integrations → Live sync shows the app message, the 5-minute backup and the optional DB trigger.
  - Tested locally with a stand-in CRM (no login 401, one message → read after 1.6 s, burst of 5 → 1 read, backup door 401/200). Live: no login 401; backup with the real WEBHOOK_SECRET 200 and `crm_backup` recorded.
- **CRM (LIVE, 16b3832a; owner: "ok now push this"):** pushed to the CRM main on top of 12b118e0, after checking that the co-worker had pushed nothing since. The live bundle `index-BKwadWeJ.js` contains `/api/axicore/changed`.
  - New `axicore/notify.ts`: `withAxiCoreNotify` wraps the Supabase data provider in `getDataProvider`.
  - Sends after create/update/delete on companies, contacts, deals, brochures, proposal, call_logs, call_assignments, and after importLeads, recordCallOutcome, unarchiveDeal, mergeContacts.
  - One message per 800 ms burst, keepalive, never blocks a save; off in demo mode.
  - Checks: tsc, eslint, prettier, vite build, and a vitest of the wrapper (3 tests; the test file was not kept) all pass.
- **5-minute backup timer: NOT set up. Owner, after the cost check: "dont check current setup is fine".**
  - **Why:** one full CRM read (`pollOnce`) downloads about 550 KB from the CRM Supabase (companies `select=*` 296 KB, contacts 200 KB, deals 52 KB; 238 / 235 / 234 rows on 2026-11-12). Every 5 minutes that is about 4.7 GB a month, nearly the free plan's ~5 GB egress.
  - **Every forced read costs the same 550 KB:** each instant message (one per save burst) and each pollSoon while AxiCore is used (at most one per minute). At about 100 saves a day, that is roughly 1.5 GB a month of CRM egress.
  - **The light check was offered, not built:** a ~1 KB "anything new?" fingerprint (counts + max id, deals/brochures `updated_at`), followed by a full read only on a change. Companies and contacts have no `updated_at`, so plain field edits outside the CRM app would be missed. Build it if CRM egress becomes a problem.
  - `/webhooks/atomic?from=backup` stays in the code (harmless). The script `cron-setup.mjs` was never run.
- **Found:** the live CRM has **no `proposal` table** (PostgREST 404; OpenAPI lists no table like it), so proposal rows and PDF links cannot be written to the CRM. Ask the co-worker whether it was removed or renamed.
- **Next:**
  1. Tell the co-worker about CRM commit 16b3832a (`axicore/notify.ts` + one line in the Supabase dataProvider).
  2. Live check with a real save: Integrations shows "From the CRM app".
  3. Then parts 2 and 3.

## Status (2026-11-12): classic editor always for the HTML templates, same PDF structure and styles (2c2a43e)
- **Owner:** "use clasic editor always. but i need my same pdf structure and styles".
- **How:** when an HTML-template document is ready (`tools.completeDoc` Claude path, `generate` no-Claude path), `tools.classicDesignOf(doc)` → `src/html-docs/to-design.js` `htmlToDesign()`:
  1. `fitPlan()` (index.js; the fit check + saved split, shared with `htmlDocPdf`) gives the HTML;
  2. Chromium renders it at 2× and runs `public/html-convert.js` `convertPages()` in the page;
  3. fonts go through `resolveFont` (Google Fonts by family + weight), and pictures are saved with `saveDataUrl(…, 'images', <sha16>)`.
  - The document gets `design_json` and opens in the classic editor. `docPdf` prints the design (HTML only when there is no design).
  - `content.html` is kept (Write it again, the fact check, re-layout when words come in through the API: `saveDoc` re-converts).
  - Older HTML documents without a design are converted when opened (`POST /api/tools/docs/:id/to-design`; app.js shows "Opening … in the editor"); if that fails, the page view is the fallback.
- **Converter** (`public/html-convert.js`, shared by the server and the admin's "Open in classic editor"):
  - boxes (fill, linear / radial-approximated gradients, outline, single-side rules), CSS `::before` decorations with empty content (bullets, rules, dots, circles), photos and `<img>` (re-encoded PNG / JPEG), inline SVG icons (as pictures);
  - texts: wrapped texts keep the browser's width, single-line ones get 3 % + 6 px of room; a bold or coloured phrase becomes `**…**` with `hl` + the new text option `hlf` (font of the highlighted words, in `model.js`, `render-pdf.js` `tokenFont`, `editor.js`; `preloadUserFonts` loads it); non-breaking hyphens become plain ones;
  - a box with overflow hidden whose `::before` sticks out (Growth Plan CTA circle) becomes a server screenshot (`data-ax-shot`; the browser path leaves the decoration out);
  - the proposal's price table (`data-pricing` in proposal-codeace.js) becomes a live `pricing` element with `look: 'codeace'` (fonts `font` / `fontm` / `fontb`; `editor.js` `pricingCodeace`, `render-pdf.js` `drawPricingCodeace`), so the Prices dialog updates it.
- **Fidelity:** pixel diff of the classic PDF against the HTML PDF: CodeAce Growth Brochure 3-4.7 % per page, CodeAce Proposal 3.6-7.6 %, Shopify Store Template (old Growth Plan) 5-7.5 %: text edges and photo re-encoding. **Known gaps:**
  - italic Manrope does not exist on Google (the proposal's italic note is upright);
  - Fraunces' optical size is lost in the old Growth Plan (big serif headings a bit heavier);
  - a clipped decoration is only captured on the server.
- **Tested:** `bps/classic-unit.mjs` (3 templates convert in 1-3 s and print), e2e 35 checks (4 website types + Claude doc converted, long content → 17 design pages), browser `bps/cl-ui.mjs` (8: older doc converted on open, new proposal opens in the classic editor, CodeAce table, Prices dialog changes it, saved, PDF, no console errors). All on an export of the staged commit.
- **Not checked live:** the conversion on Vercel. Live has no HTML-template documents yet, and making one writes to the CRM. The first real lead's brochure / proposal is the first live run: check the doc opens in the classic editor (if conversion failed: event `tools / to-design / error`).

## Status (2026-11-12): drag and drop on the HTML documents; brochures researched and fact-checked per lead (abbdf67)
- **Owner:** "i need my editor. its just content editor. where is my drag n drop editor?" (chose "Both": drag and drop on the real pages + "Open in classic editor"), then "for each brochure generation, the contents should be generated separately according to the lead details and SWOT. we research and update each and every content. also verify they are correct".
- **Design mode** (default; Words / Design switch on the document page, remembered in `localStorage axf-hd-mode`): `public/html-design.js` `mountDesign()`.
  - **How it works:** the pages are the template HTML, shown full size in an iframe (no sandbox; a CSP meta blocks scripts inside) and scaled to fit.
  - **What you can do:** click to select (Esc = the box around it), drag to move, 3 resize handles, double-click / Enter to type (plain text), panel (text colour, fill / no fill, size, weight, corners, to front, hide, reset), add text / picture / box (on the page in view), Ctrl+Z / Y, arrows nudge, Delete hides (added ones are removed), "Undo all page changes".
  - **Storage:** `content.html.edits = { els: { "<page>:<child path>": { tx, ty, w, h, color, bg, size, weight, radius, z, hidden, text } }, added: [...] }`.
  - **Rendering:** `src/html-docs/edits.js` `applyEdits()` tags every element of a page with `data-k` (a small tag walker over the templates' own HTML; `<style>` skipped, `<br>` not counted) and applies the edits. `htmlFor()` always runs it, so the page view and the PDF match.
  - **Fit check:** documents with edits keep their page plan, so the keys stay put.
  - **Text conflicts:** text typed on a page wins over the Words form, and the form says so. "Write it again" starts with no edits.
- **Open in classic editor** (More menu): `convertToDesign()` walks the rendered DOM and builds the classic design model at 0.75 pt/px:
  - boxes (fill, linear gradients; radial gradients approximated as a diagonal), single-side borders as thin bars, background photos and `<img>` (re-encoded to JPEG / PNG and uploaded);
  - texts with font (each family + weight through `/api/design/fonts/resolve`, i.e. Google Fonts), size, colour, letter spacing and line height; a bold part in another colour becomes `**…**` + `hl`. Boxes get 3 % + 6 px of room because the classic font measures a hair wider.
  - `POST /api/tools/docs/:id/classic` saves it as a new document of the same lead ("<title> (classic)", source `converted`).
  - **Lost in the conversion:** inline SVG icons (proposal contact page), italic Manrope (Google has none).
- **Brochure content per lead** (`src/html-docs/index.js`, both HTML brochure templates; proposals unchanged):
  - `BROCHURE_PROCESS`: research first (website, Google listing, social pages, marketplaces, 2-3 competitors), then the lead data, then each section from named sources, then verify every fact.
  - The job now carries `<website_check>` (audit, `tools.js`) and says so when the lead has no SWOT.
  - The answer has `verification { sources, facts[{claim, source, status: confirmed | from_crm | from_swot | removed}], not_found }`. It is stored as `content.html.verification` and shown as "Fact check" in the Words form, with a one-line summary in the design panel. `post.mjs` treats it as soft.
  - **Copy guard:** `exampleLeaks()` / `acceptHtml()` refuse an answer that uses words particular to the Nirapara example (`EXAMPLE_TERMS`) unless the lead's own sections contain them or a fact confirms them with a URL. The answer is then written again (retry). The same check is in `claude-worker/validate.mjs` via `job.example_terms`, so Claude on GitHub fixes it in the same run.
- **Tested:** `bps/edits-unit.mjs` (3 templates: keys, balance, move / text / hide / add, escaping); `bps/verify-unit.mjs` (15 checks: process / website check / SWOT in the job, copy caught and refused, confirmed words allowed, Nirapara itself not flagged, worker validator both ways); e2e 33 checks; browser `bps/dd-test.mjs` (17: drag, colour, resize, type, add, undo, select + delete, PDF, Words, classic copy 13 pages printing, no console errors). All re-run on an export of the staged commit only.
- **Not seen yet:** a real Claude run with the research process and fact check (time and cost will go up a little); a manager using the design mode on a phone (not built for touch).

## Status (2026-11-12): "CodeAce Growth Brochure" = new default brochure template (LIVE, 8a8080c)
- **Owner:** "downloads/Nirapara Ecom Growth Brochure — Proposal Style (3).pdf: add this to brochure template and make this default". Its source is `Downloads/Nirapara Ecom Growth Brochure — Proposal Style.html` (Claude design bundle, 13 landscape pages, each page a nested bundle; unpacked with the scratchpad `bps/unpack.cjs` twice).
- **Built like the other HTML templates:** `src/html-docs/brochure-ps.js` (source `builtin-html-brochure-ps`; every style copied from the page markup; 1123 × 794 px printed by its own `@page` size, `cssPage`) + `samples/nirapara-brochure-ps.js` (word for word). Pages: cover → contents (page ranges computed) → challenge → opportunity → journey → plan → idea pages (4 ideas; 2 beside a `statement` card; 4 beside a picture when `photo` and a photo are set) → economics → delivery → results.
  - Assets: the bundle's own Manrope files (`fonts/manrope-2-*.woff2`, `manrope-2.css`: newer than the proposal's), `img/sample-shelf.webp`, `img/sample-cta.webp`; cover and phone photos are the existing `sample-strip` / `sample-phone`. Without photos the areas show dark gradients.
  - `index.js`: `HTML_TEMPLATES` entry with `photos` slots (the document page shows one upload button per slot, now for every HTML template), context (`docName`, lead website on the cover, contact = settings phone / email, one per line instead of the reference's "[Phone] · [Email]" placeholders), `BROCHURE_PS_SCHEMA` + `BROCHURE_PS_GUIDE` (two-line Title Case headings with "\n", `**bold**` in leads), `cleanHtmlData`, `fallbackData` (general copy per website type), `replanPs` (an overflowing idea page is split in half; `split.ideaPages`), `sampleDoc(source)` (template preview and `/api/design/templates/:id/sample.pdf`).
  - Made the brochure default once at boot (state `html_brochure_ps_default`); a later "Make default" is kept.
- **Tested:** pixel diff against the PDF 3-6 % per page, all sub-pixel edges (layout, words, photos identical). The reference PDF was not printed by Chrome: its own source HTML in our Chrome gives 1 px taller auto-height lines (42 vs 41 px list rows), so a small drift in long lists is expected. Throwaway-DB e2e (scratchpad `bps/e2e.mjs`, 29 checks): row + default + restart keeps a later choice; automatic template for every website type; documents without Claude for 4 types (11 pages, no overflow); Claude answer (stand-in OpenRouter) word for word → 13 pages; hand edit; long content 13 → 17 pages with nothing overflowing; GitHub worker validator; the other two HTML templates still print. Browser (headless Edge): Templates card first and Default, viewer 13 pages, document page with 4 photo buttons and the idea page headings, edit → preview → saved, no console errors. Fixed on the way: text with a line break now gets a multi-line box in the form (before, a two-line heading lost its break).
- **Not seen yet:** a real Claude run for this schema; the first live PDF of it.

## Status (2026-11-12): design images blank inside the CRM (found, NOT fixed)
- **Owner:** imported a PDF template "Ecommerce Growth" (live id 24, brochure, 13 pages); the viewer in AxiCore inside the CRM showed white pages.
- **Cause:** `/api/design/file` sits behind `requireAuth`. Inside the CRM, AxiCore logs in with a Bearer header (no cookie), and `<img>`/CSS image loads cannot send it, so every design image there answers 401. The 13 page images are fine in storage (`upload:images/<16 hex>.jpg`). The admin page (password cookie) is not affected.
- **Tried and dropped:** serving random-named images, assets and stock photos without a login worked locally, but the push was blocked by the permission check as a security weakening; reverted, nothing pushed.
- **Proposed fix (waiting on the owner):** in embedded mode the browser fetches design images itself with the CRM token and uses blob URLs (`fileUrl` in public/editor.js and its users: thumbnails, viewer, editor backgrounds); no server change.
- **Also found:** the import made 0 text boxes; every page is a flat picture, so nothing changes per lead. Suspected cause, not checked: on this Chromium-printed PDF the importer's text-free render (`fillText` override in `pdfToTemplate`) did not hide the text, so no run counted as visible text. The PDF is the Nirapara brochure, already the live "Shopify Store Template" (HTML), so the import may not be needed; the owner decides.

## Status (2026-11-12): Delete on every template card (LIVE, 449ccbb); only 2 templates left live
- **Live templates now** (owner: "keep first proposal and remove next", "in brochure - delete all except Shopify Store Template"): brochure **Shopify Store Template** (id 20, the HTML brochure renamed by the owner) and proposal **CodeAce Proposal** (id 22), both default. Hidden on live: ids 1, 4, 5, 7, 9, 11, 13, 15 (brochures) and 2 (Codeace Default Proposal). When the uncommitted "Codeace Business Website" work is deployed, its seed adds a new visible `builtin-growth` row: hide it too if the owner still wants only one.
- **Owner:** "add delete option for each template". Every card in Templates now has Delete, built-ins included (smart and HTML).
- **How it works:**
  - Imported and saved templates are removed, as before.
  - Built-ins are hidden instead (new column `design_templates.hidden_at`). The seeding re-adds missing built-in rows at every start, so a real delete would not stick. Hidden rows are left out of `listTemplates`, `defaultTemplate`, `autoTemplate` (per-type looks and fallback) and the Integrations list. Documents made with them keep their template.
  - Deleting the default makes another one the default (HTML first, then built-in, then oldest).
  - The last template of a kind cannot be deleted (400 with the reason, shown as a toast).
- **No restore button yet:** to bring one back, `UPDATE design_templates SET hidden_at = NULL WHERE id = …`.
- **Tested** on a throwaway DB (scratchpad `tpl-del/t.mjs`): deleted the HTML default, then deleted growth (business-website falls back to the default); a reboot does not re-add them; the last proposal template is refused.

## Status (2026-11-12): AxiCore for CRM managers too; search box in long dropdowns
- **Owner:** "give axicore access to manager also", then "add search option too" (screenshot of the long "CRM lead" picker).
- **Managers:**
  - AxiFlow `src/web/auth.js` `AXICORE_ROLES` default is now `admin,manager` (not set on Vercel, so the default applies); `public/app.js` login text.
  - CRM `axicore/axicore.ts` `VITE_AXICORE_ROLES` default `admin,manager` (sidebar tile, `/axicore` route, canAccess); `AxiCorePage.tsx` text; comments in canAccess, CrmSidebar, CompanyDocuments. BDEs still see only the company Documents panel.
- **Search:** `public/select.js` adds a search box at the top of every dropdown with more than 8 options (`SEARCH_FROM`; `<select data-search>` forces it).
  - It gets focus when the menu opens. Every typed word must appear in the option (case and accents ignored, the icon name is not searched).
  - Empty group headings hide, and "No matches" shows when nothing fits. Arrows / Enter / Esc still work while typing.
  - Styles `.xsel-search`, `.xsel-none` (dark and light).
- **Tested** in headless Edge on a throwaway DB with 12 CRM-style leads (scratchpad `live-crm/search-ui.mjs`): "kottayam int" → the 4 Kottayam interior firms, ArrowDown + Enter picks and fills the form, no-match message, Backspace restores the list, Esc closes and stays on the page, light theme, phone width, no console errors.
- **Live:** AxiFlow bfd1872, CRM 12b118e0 (on top of the co-worker's 53c71284); both bundles checked to contain the change. The live CRM has 3 admins and 1 BDE, no manager yet and no sales row without a role (a row without one would count as a manager in `auth.js`). **Not seen yet:** a real manager login.

## Status (2026-11-11): the Claude-web brochure and proposal are the default templates, printed exactly (HTML engine)
- **Owner:** "i generated brochure and proposal from claude web. can u convert this exactly to our system. next generations should use this as default. but it should be same as exactly without any difference" (`Downloads/Nirapara Ecom Growth Brochure - Premium (source).html` = the brochure made in this session, and `Downloads/Nirapara Shopify Store Proposal — CodeAce.html`, a Claude design bundle: `__bundler` manifests of gzipped pages, each page a design-canvas file of static HTML with inline styles, Manrope, logos, WebP photos).
- **Why a new engine:** the pdfkit design model cannot reproduce CSS exactly, so these two documents are kept as HTML and printed by Chromium (`src/html-docs/`):
  - `chrome.js`: one puppeteer-core browser per process; Vercel = `@sparticuz/chromium` (binary in `node_modules/@sparticuz/chromium/bin`, added to `vercel.json` includeFiles; about 75 MB), locally Chrome or Edge (`CHROME_PATH`). Photo areas marked `data-flatten` are screenshotted (text hidden) and used as a flat JPEG background before printing: Chrome's soft masks made pdf.js show the proposal's dark photo strip pink. Puppeteer 25 returns a Uint8Array from `screenshot()`: wrap it in `Buffer.from` before base64.
  - `proposal-codeace.js`: every style copied from the Claude pages; cover → summary (photo strip + 3 stats) → scope (up to 6 per page, spread evenly; 10 = 5 + 5) → site map → one page per feature group (stack / 2×2 / beside a picture) → timeline → investment (AxiFlow's line items, rows as blocks: a background on table rows printed a seam per cell) → deliverables and terms → contact (settings agency phone, email, website; "Cyberpark, Kozhikode"). A4: 794 × 1123 px printed at scale 793.7/794.
  - `brochure-codeace.js`: the CSS verbatim in `assets/html-docs/brochure.css`, the same page markup; idea pages 4 or 2 per page (`ideaPlan`), a lone idea spans the full width (`.pair.solo`, added). Printed by its own `@page` size (`cssPage`).
  - Fonts and images inline as data URIs (`assets.js`); fonts local in `assets/html-docs/fonts` (Manrope from the bundle; Fraunces, Instrument Sans, Noto Serif Malayalam fetched once by `scripts/fetch-html-doc-fonts.js`).
  - `index.js`: template rows `builtin-html-brochure` "Codeace Growth Plan" and `builtin-html-proposal` "CodeAce Proposal" (mode `html`), seeded at boot and made the defaults once (state `html_templates_default`); a document stores `content.html = { template, data, split }` and has no design. `htmlDocPdf` checks the fit in Chromium and re-paginates (scope per page down, idea pages halved) up to 3 times, saving the plan. Claude job kind `html` (`htmlJob`: guide + lead + CRM dossier + research + SWOT + commercial terms + the Nirapara content as the reference example); the schema Claude gets has no length/count limits (strict structured output refuses them); `cleanHtmlData` enforces them. Without Claude: `fallbackData` (general Codeace copy). Hand edits: `sanitizeEdit`.
- **Hooks:** `tools.js` (autoTemplate: an HTML default wins over the per-type looks unless a template is set for the type or for automatic documents; buildClaudeJob; generate; completeDoc; saveDoc; docPdf; templatePreview; resumeDocs skips HTML documents), `claude-worker.js` postProcess kind `html`, `pdf/docs.js`, `app.js` boot. API: `GET /api/tools/docs/:id/html`, `POST /api/tools/docs/:id/html-preview`, `GET /api/design/templates/:id/sample.pdf` (the Nirapara sample, no document, no CRM write); HTML templates cannot be deleted. UI: `public/html-docs.js` (document page = the real pages in a scaled iframe beside a form with every text, live preview, autosave, Prices dialog, proposal cover / strip photo upload; template cards and the viewer use the same iframe).
- **Tested** (scratchpad `prop/`): pixel diff against the source PDFs (`live-crm/pdfdiff.mjs`): brochure 11 of 12 pages 0 %, page 12 0.08 %; proposal 4-7 % on every page = sub-pixel text edges (layout identical). End to end on a throwaway DB (`html-e2e.mjs`, 15 checks: rows + defaults, automatic template per type, documents without Claude → PDF, with Claude through a stand-in API → PDF matching the reference, hand edit, preview); the same test on a clean copy of the commit (`commit-check/`); the GitHub worker's validator on both schemas (`validator-test.mjs`); fit check with over-long content (`fit-test.mjs`); UI in headless Edge (`live-crm/hd-ui.mjs`: pages + 257 fields, edit → preview → saved, prices, PDF, template cards and viewer, no console errors).
- **Not checked yet:** Chromium on Vercel (first live PDF), a real Claude answer for these schemas, cover photos for other clients (none: a dark red gradient; the Nirapara photos are only in the sample).

## Status (2026-11-10): PDF template import keeps the design (own fonts, picture pages kept)
- **Owner:** "the pdf templates import is not same as the pdf its changing the design".
- **Causes found:**
  1. The PDFs the owner imports are often **pictures with an invisible text layer**: `Downloads/jayabharathams's - proposal.pdf` (Inter names, never drawn as text) and `Digital Growth Solutions for Bodhis LUXE.pdf` ("Glyphless" font). The old importer laid black Poppins text over text that was already in the picture.
  2. Real-text PDFs (Canva: Open Sauce One, Mont, Monument Extended…) were reset in Poppins at 94% and reflowed.
  3. Rotated or tiny text vanished (taken out of the background, never made a box).
- **Now** (`pdfToTemplate` in public/editor.js, `src/design/user-fonts.js`):
  - **Visible text only:** a run that adds no pixels (full render vs text-free render) stays part of the picture. With the client name given, each line naming the client gets a patch: the background rebuilt row by row from the colours left and right of it, an image uploaded via `/api/design/images`, plus a text box in the name's colour, in a Poppins weight chosen by how much of the line the letters cover. `{{company}}` replacement still works.
  - **Fonts** (`POST /api/design/fonts/resolve`, table `design_fonts`, code `X<8 hex>`, files in storage `fonts/`, served publicly at `/fonts/x/<code>`):
    - the same family and weight from Google Fonts (metric aliases Arial→Arimo, Times→Tinos…);
    - else the PDF's own font file as pdf.js builds it. Its cmap is rebuilt from pdf.js's `toUnicode`/`toFontChar` (pdf.js moves glyphs to private-use code points), and a space is mapped to an empty glyph at 0.25 em (Canva subsets have none: pdfkit drew boxes).
    - **Fallback:** a subset lacking a letter of an element sets that whole element in its `fallback` face (Inter or Lora by weight), with the same rule in the editor and the PDF (`effectiveFont`).
    - **Font keys:** fonts are keyed per pdf.js font object (`loadedName`): Canva reuses one name for different per-page subsets.
  - **Text:** real size, letter spacing measured per run against the chosen font, y from the font's own ascent/descent, right alignment detected.
  - **Rotated / tiny text** stays in the background.
  - **Font menu:** the editor lists imported fonts under "Fonts of imported PDFs".
  - **PDF renderer:** `preloadUserFonts` + `registerUserFonts`; metrics come from the stored hhea numbers.
- **Tested** (local throwaway DB):
  - `Digital Growth Solutions.pdf` (12 pages, 78 boxes): editor and server PDF match the original on pages 1, 3, 10 and 12 (fonts, tight spacing, line breaks, Thank-you page).
  - The JB proposal (17 pages) and the Bodhis picture PDF come through as their pictures, with the client name editable and seamless.
  - Scripts in the scratchpad: `live-crm/imp-one.mjs`, `shot-one.mjs`, `pdf2png.mjs`, `../pdf-render.mjs`, `imp-debug.mjs`, `cmap-test.mjs`.
- **Not done:**
  - Templates imported before this keep their old Poppins boxes: import them again.
  - A typeface for text inside pictures is only approximated (Poppins).
  - A client name with letters missing from a subset font is set in the fallback face.

## Status (2026-11-10): Templates → View
- **Owner:** "in templates i need a view option". Each template card has **View** (clicking the preview opens it too): `viewTemplate()` in app.js opens the dialog with class `viewer` (1180 px wide; `modal()` removes the class) showing every page from `/api/design/templates/:id/preview?all=1` for the sample client, each sized to fit the window height, with "Page n of N", Close and "Use this template" (→ `#/<kind>/new` with the template chosen). Styles `.tv-*` / `dialog.viewer` at the end of styles.css.
- **Tested** in headless Edge on a throwaway DB (scratchpad `live-crm/tv-test.mjs`): Precision 12 pages, Default Proposal 11 A4 pages (one whole page fits), Mono at 390 px width (no page scroll), dark and light, Esc closes, Use goes to the New form, a later dialog keeps its normal 680 px, no console errors.

## Status (2026-11-10, latest): every tool on Claude Code (GitHub) first, the API key as fallback
- **Owner:** "for all use claude code on github. if usage limit reaches or any errors then use API".
- **Code** (`src/claude-worker.js`): setting `claude.fallback_engine` (default `anthropic`; '' = no fallback, the old wait-for-reset behaviour). `fallbackFor('github')` = that engine when its key is set and today's AI spend is under `ai.daily_budget_usd` (`budgetLeft()` in `src/ai/claude.js`).
  - **When a GitHub job moves to the API:** usage-limit answer (no try used; `claude_hold` still set, so later jobs skip GitHub until the reset), any other error answer (next try), a failed dispatch (at once), no answer in time (`retryStale`, even on the last try), and jobs held for the limit (next sweep).
  - Once moved, a job stays on the API for its remaining tries (`input.claude.fell_back` = why). An older GitHub run that reports an error afterwards is ignored (API answers carry `body.engine`); a late GitHub answer that worked is still taken.
  - API spend limit reached during a fallback → the job goes back to GitHub (waits for the reset if held).
  - Integrations → Claude: "If GitHub fails or hits the usage limit" select; Last jobs shows an "API" / "API fallback" tag (hover = why).
- **Tested** (scratchpad `fb-test.mjs`, throwaway DB, stand-in GitHub / OpenRouter / Anthropic): 14 checks: limit, held, failed checks, dispatch failure, late GitHub error, timeout, no budget, budget back, Anthropic refusal (gives up, no loop), fallback off.
- **Live settings:** `claude.engines` for script / brochure / proposal cleared (all follow `claude.engine = github`), `claude.fallback_engine = anthropic` (Opus 5.5, $15/day limit).
- **Watch:** brochures on GitHub take longer than on the API (about 2-5 min vs 2.7 min) and use the subscription; the Usage page shows which engine ran each job.

## Status (2026-11-10, latest): "Codeace Business Website" brochure template (local, not committed, not live)
- **Owner:** "can u create a new default template for bussiness website plan? downloads/Digital Growth Solutions for Bodhis LUXE.pdf" (12 slides, 960×540; text is outlined, so its fonts are unknown).
- **Built:** `src/design/growth.js` `growthDesign(data)` (design id `growth`, template source `builtin-growth`, name "Codeace Business Website", seeded once like the Signature rows, same duplicate clean-up). Lavender grid paper, Codeace blue #2b45d6, ink #0a0f2c, Inter Bold headlines (new font `IB7`), JetBrains Mono eyebrows (`JM5`, OFL file added), white cards with a soft shadow image, photo cards with a floating badge, blue→violet CTA, "Thank you." close. Slides: cover → about → insight (verified stats only) → gaps (lead SWOT) → how we help (cards) → one per service → why us → CTA → thank you.
  - Assets `assets/brochure/growth/` (paper.jpg, cta.jpg, glow.png, shadow.png, sphere.png; drawn in headless Edge). New icons: chat, search, dashboard, like, users, shield, cart, calendar, bolt, growth, play, code.
  - `TYPE_TEMPLATES['business-website']` = `builtin-growth` (was Precision); live has no per-type template pinned, so it applies as soon as this is deployed. The general default template is unchanged.
  - `writeDeck`: gaps from the SWOT also for `growth`; the sample stylist cover is dropped unless the lead is a salon/beauty business (the layout then shows the website mockup); `about.more` = the second About paragraph. Claude gets a `<design_system>` section for this design.
- **Tested:** the reference content rebuilt and compared with the PDF slide by slide; a sample lead with 2/3/4 gaps; throwaway-DB e2e (business-website → this template; automatic doc ready, 13 pages, gaps from SWOT, no stylist; Claude-shaped answer ready, invented stat removed); editor in headless Edge (fonts load, no console errors); Signature looks still render. **Not seen:** a real Claude run, real stock photos.
- **Next:** owner reviews the sample PDFs; commit + push (deploys live) when the owner says so.

## Status (2026-11-10, newest): Codeace Signature brochure designs + website package popup (LIVE)
- **Owner:** a folder of agency brochures (`Downloads/brochure samples`: Quadcubes, Andrija Designs, ColorWhistle, b:web, Angular Minds, WeDoWebApps, AscentSpark): "we need like this. can u make it as our templates? or plan it", then "also complete our plan" and "category selection on intrest also pls finish".
- **Built** (AxiFlow commit e53fe2f, on top of 9035969 = the website type engine work):
  - `src/design/signature.js`: one type-led slide system, four looks (`SIGNATURE_STYLES`): **precision** (white grid paper, royal blue + charcoal two-tone headlines, ghost word), **mono** (black / white, upper-case Franklin, one coral accent), **bold** (upper-case Archivo, red panels), **commerce** (deep green + warm yellow, soft corners). Palette and typefaces are fixed per look (Claude's theme is ignored). The generic sample images are never used; a photo shows only when it is `stock:` / `upload:`.
  - Slides: cover (panel "Prepared for <client>" + services) → about → **gaps** ("where the client loses customers today") → insight (only with verified stats) → approach (services as contents with page numbers) → one per service (text + colour panel "What you get", sides alternate) → why us (2×2 figures) → CTA → closing with contact rows.
  - New optional `gaps` { heading, highlight, note, items[{title, text}] } in the deck schema, parse, `toBrochureData`, `normalizeData`, limits and the task line (`PROMPT_VERSION` 2026-11-10.1). The classic and editorial designs ignore it.
  - `tools.js`: designs `signature-<look>` (`DECK_DESIGNS`, `drawDeck`); `leadSwot()` (the lead's latest ready script doc) feeds `<swot>` into the brochure job and, without Claude, the gaps slide; `<design_system>` section for Signature jobs; `TYPE_TEMPLATES` = the look per website type when no template is set for it (business → Precision, e-commerce → Bold, Shopify → Commerce, landing page → Mono). Leads without a website type keep the general automatic template.
  - Templates seeded once: Codeace Precision / Mono / Bold / Commerce (`builtin-signature-*`), default unchanged. Assets `assets/brochure/sig/` (dark logo `codeace-ink.png`, `grid.png`).
- **Tested:** four looks rendered to PDF and checked page by page (scratchpad `samples/sig/*.pdf`, script `samples/sig-test.mjs`); throwaway-DB e2e `samples/sig-e2e.mjs` (template per type, `<swot>` + `<design_system>` + `<website_type>` in the job, invented stat removed, doc ready, 9-page PDF); classic + editorial regression and an 8-service stress case. **Not checked:** the browser editor on a Signature doc, a real Claude run, real stock photos.
- **CRM popup:** checked in the demo CRM in headless Edge (list-view stage → dialog, Cancel keeps the stage, pick → POST with deal, company and package); committed locally as 26db527a on top of adcb0629.
- **Live** (owner: "make it live", 2026-11-10): AxiFlow `main` pushed first (9035969, e53fe2f, then 52085d2), then the CRM `main` (adcb0629 bigger collapsed rail + 26db527a popup).
  - **Found live and fixed (52085d2):** two server instances starting together each added the template rows (Precision, Mono, Bold twice). `seedTemplates` now keeps the oldest row of each `builtin-signature-*` source and moves documents to it. Tested on the throwaway DB; the live list is clean.
  - **Checked live:** AxiFlow health 200, package endpoint 401 without login and 400 for a bad type, the four templates and four website types in Integrations; CRM (owner login, headless Edge): list-view stage New → Interested opens the dialog with the four choices, Cancel keeps the stage, no write sent; collapsed rail is the wider one.
  - **Not yet seen live:** a real lead marked Interested with a package, and the Claude brochure that follows in its look.
- **Re-check (owner: "check everything again", same day; fixes live in 62e1d8c):**
  - **Editor:** all four looks opened in the editor on a throwaway DB (headless Edge): fonts Archivo / Libre Franklin / Inter load, the grid background shows, no console errors, slides match the PDFs.
  - **Popup entry points in the demo CRM:** list-view stage, Leads board drag (keyboard drag; Cancel leaves the card, pick posts deal + company + package and moves it) and the deal form (Cancel restores the stage; the package row shows and saves). The call-result dialog could not be exercised (the demo has no call lists): typecheck only.
  - **Live package call through the CRM address** with the owner's CRM token: bad package 400, no ids 400, no login 401 (proxy, token login and the open route all work; nothing stored).
  - **Gap found and fixed:** `deals.categories` is not in the sync hash, so a package changed alone in the deal form never reached AxiFlow. `syncLead` now reads it before the "unchanged" return (tested: same deal, only the package changed → lead updated; package removed → kept).
  - **Worker:** `claude-worker/post.mjs` treats `gaps` problems as soft (a missing gaps key on the GitHub engine would have caused a paid retry); validator run on a sample answer.
  - **Small:** gaps rows spread over the page (3 rows no longer leave the bottom empty); Integrations per-type select says "Automatic: <its look>".
  - **Still not seen:** a real Claude brochure in a Signature look, the call-result dialog with a real call, a manager / BDE login.
- **Still open from the plan:** visual check by Claude after layout, golden set of 8 leads, proof bank, rejection reasons, real photos per vertical (Pexels / Unsplash keys).

## Status (2026-11-10, latest): website type popup + premium brochure plan
- **Owner:** "on change a lead to intrested, show a popup to select the package (website types - shopify store, ecommerce, etc), and store that as a field and send to axicore when brochure generation. based on this input axicore will assign templates". Choices: short list (Business website, E-commerce store, Shopify store, Landing page); stored in the existing unused `deals.categories` (no DB change); popup everywhere a lead turns Interested; a new design per package.
- **Built and tested, NOT live:**
  - **CRM** (scratchpad clone `live-crm`, uncommitted, on top of local commit adcb0629 = bigger collapsed rail, also not pushed): `axicore/packages.ts` (types, `withPackage`, `savePackage`, `sendPackageToAxiCore`) and `axicore/PackagePicker.tsx` (`usePackagePicker`, `PackageChoices`), hooked into the Leads board drag (Cancel = card stays), the list-view stage picker, the deal form (`WebsitePackageInput`, Cancel restores the stage) and the call-outcome dialog (choices inline; package saved before the RPC). `updateDealStage` takes `extra` fields. Typecheck and lint pass.
  - **AxiFlow** (uncommitted): `src/website-type.js` (`WEBSITE_TYPES` with build notes, column `leads.website_type`, state map `website_types` by company/deal, `websiteTypeFor`, `websiteTypeSection`); `POST /api/axicore/package` (open to every CRM user); the CRM read selects `deals.categories`; `autoTemplate(kind, type)` uses `automation.website_templates.brochure.<type>`; doc `input.website_type`; the Claude prompt gets `<website_type>`; Integrations → Templates has one select per type. Tested on a throwaway DB (scratchpad `wt-test.mjs`): 401/400 guards, lead stored, Editorial chosen for shopify-store, unmapped type falls back, prompt section present.
- **Premium design-system plan** (owner: "we are premium company … for each package how can we create a design system … i need ur best contribution"). Owner chose: I propose 2-3 visual directions on a specimen page → pilot **Business website** → 16:9 PDF deck. Clarified by the owner: the brochure is Codeace's services deck personalised to the client (their drawbacks and how we fix them), with the structure of the manually sent `Downloads/Digital Growth Solutions.pdf` (cover for the client, about, the digital shift in their industry, how we help, one slide per service with 4 benefits, why us stats, CTA, thank you). No client photos in mockups.
- **Next:** owner says "make it live" for the popup (both repos); then the direction specimen for the Business website pilot.

## Status (2026-11-10): AxiCore 2.0 inside the live team CRM (no replacement)
- **Owner:** "they dont want replacemnt … add our builded system to live without affecting existing datas", then "move our axiflow to crm app like in our combined system in vercel". Live CRM = https://atomic-crm-flame.vercel.app (repo `karuncodeace/atomic-crm`, co-worker's Vercel account, hash routing, no vercel.json before); engine = live AxiFlow.
- **Design:** the CRM proxies `/api`, `/axicore-app`, `/pdf`, `/d`, `/fonts`, `/fonts.css`, `/brand` to https://axiflow-v1.vercel.app (Vercel external rewrites). No CRM database, schema, role or migration change; AxiFlow keeps its own DB. Roles: `admin` opens the tools (no `axicore` role in the live CRM).
- **AxiFlow side (live, 4fdbf39):** `auth.js` `currentUser` / `crmUser` (CRM Supabase `/auth/v1/user` + `sales` role; apikey = `CRM_SUPABASE_PUBLISHABLE_KEY`, else the secret key), `AXICORE_ROLES` default `admin`, `OPEN_ROUTES` for other CRM users; password cookie unchanged. `/api/me` returns user + axicore; `GET /api/axicore/company/:id/docs`; `/axicore-app/` = index.html with `class="embedded"` (app.js sends the CRM token from `sb-*-auth-token`, "Back to the CRM" tile `.axc-crm`). vercel.json includeFiles `{assets,public}/**`. Checked live with the owner's CRM admin login: me = admin/axicore, tools API 200, no-login 401.
- **CRM side (LIVE, owner: "push directly to atomic crm vercel"):** commit 667c76fe pushed to `karuncodeace/atomic-crm` main (origin/main was unchanged at 6884999; the co-worker's Vercel deployed it in ~30 s). Ported from AWC: `src/components/atomic-crm/axicore/*` (default role admin, "SWOT" label), sidebar tile (`AxiCoreFooter`), `canAccess` resource axicore, company `CompanyDocuments`, `/axicore/*` route, flat `.axc-*` styles, `vercel.json` external rewrites, PWA `navigateFallbackDenylist`. Typecheck, prettier and `vite build` passed. Working clone: scratchpad `live-crm` (git core.longpaths true).
- **Checked live** (headless Edge, owner's CRM admin login): CRM sign-in, AxiCore tile in the sidebar, KIDONEX company page shows "Documents (AxiCore)" with its SWOT (PDF / Open), the tile opens /axicore-app/ on the CRM address as Deepu NR (Admin) with the "Back to the CRM" tile; API via the CRM address: no login 401, fake token refused, admin 200. One harmless 404 in the console (probably /favicon.svg, which the CRM does not have).
- **Full-height sidebar** (owner: "make the crm sidebar full height as per our AWC design", then "push to live"): 568c4d2f on the CRM main: Sidebar variant `sidebar` (square, full height), SidebarInset and Header flush (no rounded card). Checked live with the owner's login.
- **Sidebar design** (owner: "make axicore sidebar design more slim", "make the main content box's top left rounded corner & make left sidebar slightly black. use premium original icons in sidebar. on minimize sidebar the toolbar need more good and creative", then "make it live"): 3fb0036f on the CRM main. `layout/NavIcons.tsx` = own duotone line icons (`.nav-duo` fill, stronger on the active page); `--sidebar` dark #0b0b0c / light #f3f3f4 (accent #1c1c1f / #e8e8ea); SidebarInset = sheet with `md:rounded-tl-[1.25rem]` + top/left hairlines and `md:mt-2` (Header has the same corner), sidebar border-r removed, provider bg-sidebar; collapsed rail 4rem: each SidebarMenu is a dock capsule, active page = solid sidebar-primary tile, pending brochures = red dot; AxiCore tile 53px. Checked live with the owner's login (dark, open + collapsed).
- **To undo:** revert 3fb0036f, 568c4d2f and 667c76fe in the CRM repo (no data to clean up).
- **Next:** tell the co-worker (their repo/main got this commit); test with a manager/BDE login (should see documents only, no tile); AWC stays as a test copy, stop double-porting.

## Status (2026-11-09): Claude usage tracking (live AxiFlow + AWC)
- **Owner's request:** "shall we add a setup to track usage?"; chose Claude token usage, in live AxiFlow + AWC.
- **How it works:**
  - `claude-worker/post.mjs` sends `usage` (turns, tokens, cache, cost-equivalent, ms, web searches, per model) with every answer;
  - `acceptResult` records one row per answer in table `claude_usage` (`src/usage.js` `recordUsage`) with outcome ok / limit / error / late; tracking never blocks the doc.
- **The page:** `GET /api/usage?days=` (`usageReport`) feeds the page `#/usage` (panel Options → "Claude usage"; link under Integrations → Claude → Last jobs). It shows:
  - KPIs: runs and tokens today, last 5 hours, average per SWOT, API-equivalent;
  - the limit hold banner and the last limit hit;
  - tables by day, by tool and by lead, and the latest 30 runs with their GitHub links.
  - Averages count only runs that reported numbers.
- **Tested** on a throwaway PGlite DB (5 recorded answers; report checked) and in headless Edge (no console errors).
- **Deployed:**
  - **Live AxiFlow:** 5328460, at https://axiflow-v1.vercel.app; `/api/usage` answers with a real login and is empty so far.
  - **AWC:** d52fdda, deployed.
- **Deploying live AxiFlow (owner: "in live there may somebody updated codes. so push this feature only to vercel"):**
  - **Correction (same day):** GitHub pushes DO deploy project `axiflow`: each push today got a deployment within ~1 min (the 09:35 push had not finished building when first checked). A push to `main` therefore goes live; check `origin/main` and `vercel ls axiflow` first.
  - **Deploy from a clean export** of the pushed commit: `git archive origin/main` into the scratchpad `axiflow-deploy/` + `.vercel/project.json`, then `vercel deploy --prod` from there.
  - **Never `vercel deploy` from the repo root:** there is no `.vercelignore`, so it would upload `.env`, `data/` and the AWC folder.
  - **Before deploying, check that no one else changed the code:** `git fetch` and compare with `origin/main`; `vercel ls` (all deployments so far are by deepunr-9593).
- **SWOT rerun status:** 106/233 by Claude; the remaining 127 keep the built-in SWOT (the throttled rerun stopped with the session); restart on request.
- **Token analysis** (owner pasted the Usage page: one SWOT used 2% of the 5-hour limit; "analyze whts wrong"):
  - **Found:**
    1. A malformed JSON answer failed the checks and cost a second paid run (73k tokens each).
    2. **The repo's CLAUDE.md (125 KB ≈ 50k tokens) was loaded into every Claude run on GitHub**, and re-read on every step of the full jobs. Proof: a one-word prompt from the repo folder = 51k tokens, from an empty folder = 1k.
    3. Claude Code's default system prompt and tools (we don't need them for a SWOT).
    4. Research had been skipped (0 searches).
  - **Fixed** (live 5308f69 + efd9651, AWC 6ff348e; GitHub-side only, no Vercel deploy needed):
    - the workflow runs `rm -rf CLAUDE.md .claude` (AWC also `AGENTS.md` and the parent folder's) before Claude, for every job kind;
    - SWOT jobs run lean: `--system-prompt` (job.system + worker rules, `work/SYSTEM-inline.txt`), `--tools "WebSearch,WebFetch"`, `--strict-mcp-config`, `--json-schema` (answer read from `structured_output` by `inline-result.mjs`), max 8 turns, and at least 1 search when research is on.
    - `--bare` is not usable: it needs an API key, not the subscription OAuth.
  - **Result** (real run on Haritha Pharmaceuticals, doc 439): about 30k tokens in total (6.5k cache write, 18k cache read, 5.3k output), **$0.09 API-equivalent** (before: 73k / $0.27, and 420k / $0.14–0.35 on 2026-11-06). Valid JSON the first time; research done (found the suspended site, flagged "to confirm" items). Output is now the largest part.
  - **Follow-up** (live b421eb1, AWC 1c940c2, both deployed):
    - the Usage page shows **Research yes/no** (`usage.js` `research` = web_searches or a Haiku line in the model usage, since Claude Code leaves the search counter at 0);
    - lean SWOT max turns 8 → 10 (the 30k run finished on step 8).
- **Full Claude rerun** (owner: "re run all swots in live", 2026-11-09 04:59 UTC, `swot-claude-rerun.mjs --go --all --conc=5`):
  - 207/233 done in about 38 min with 0 failures, then the 5-hour limit;
  - the last 26 waited for the hold and finished at 09:18 UTC: **233/233 by Claude, 0 failures**.
- **Anthropic API key:** added by the owner in live AxiFlow Keys (source app, `…nwAA`); `/keys-test/anthropic` OK.
  - **Not used yet** (owner chose "keep it as backup"): Claude mode stays on the GitHub engine (subscription), and the in-app AI stays on OpenRouter free.
  - **To use it:** set `claude.engine = anthropic` (pay-per-use, no 5-hour limit), with the model set to Sonnet to keep costs low.
- **Engine per tool** (owner: "dont use api key for swot. only for brochure and proposals"; live d01b309, AWC 3bbcc14):
  - setting `claude.engines` = {script, brochure, proposal}; unset follows `claude.engine`;
  - `engineFor(kind)` maps job kinds to tools (deck / free / brochure → brochure);
  - `claudeMissing()` checks every engine in use; `dispatchJob` uses the tool's engine;
  - the usage-limit hold only applies to GitHub jobs;
  - API-key runs total their `ai_calls` rows (`apiUsage`) and report them to the Usage page;
  - Integrations → Claude has an "Engine per tool" section.
  - **Live settings now:** script = github (subscription), brochure = anthropic, proposal = anthropic (model `claude-opus-5-5`, daily spend limit `ai.daily_budget_usd` 15). Checked: mode on, nothing missing.
  - **First real brochure on the API key** (owner: "last brochure still running, not completing"):
    - **Why it waited:** doc #474 (Feet Fashion Kottakkal) was dispatched at 06:39 UTC on GitHub, before the switch, and was held by the subscription limit.
    - **Bug 1:** regenerated on the API key, it failed 3 times with **400 "Schemas contains too many parameters with union types (29…)"**: the deck `BROCHURE_SCHEMA` has 29 nullable/union fields, over the strict structured-output limit. Each try paid for research again, about **$1.60 wasted**.
    - **Fixes** (live 948dd3a, AWC 6a1b8f0):
      - `runOnApi` asks for JSON text (`runText` + `parseJsonText`, like `free`) when `unionCount(schema) > 12`;
      - `retry()` gives up at once on a refused request (`API error 4xx` other than 408/409/429);
      - `retryStale` re-sends a held job at once when its tool's engine is no longer github.
    - **Result:** #474 ready in 164 s for **$1.01** (Opus 5.5; 175k tokens incl. research), Editorial, 12 slides, specific copy ("Every step to your counter"), no truth-check removals.
    - About 2.7 min is well under Vercel's 300 s limit. Proposals use a simple schema (0 unions), so they keep strict structured output.
- **Next:**
  2. First real brochure / proposal on the API key: check time and cost on the Usage page.
  2. Watch the Usage page for real per-run numbers on brochures and proposals now that CLAUDE.md is gone from the runner.
  3. AWC still needs `GITHUB_DISPATCH_TOKEN`, then Claude mode on, then a test lead.

## Status (2026-11-06): Pitch Script Maker = SWOT + how we solve it (no call script)
- **Owner's requests:**
  - "the pitch script generating is wrong, we want SWOT of the lead", with a SWOT prompt (strengths, weaknesses, opportunities, threats; short, structured, factual);
  - "how we solve the problem: AEO, GEO, website development, automations, SEO";
  - "dont need call script";
  - "re run all pitch points and update db".
- **What a script doc holds now** (`src/ai/script.js`; kind stays `script`, so the flow and CRM writes are unchanged):
  - `pitch_point` (the CRM field);
  - `swot` {summary, strengths, weaknesses, opportunities, threats};
  - `solutions` [{service ∈ `SERVICES` (Website development / SEO / AEO / GEO / Automation), problem, how, outcome}].
  - The owner's brief is `SWOT_BRIEF`, used word for word; `SERVICE_NOTES` defines AEO and GEO for the model.
- **Rule-based version:** `templateScript` builds a SWOT from the website check, the vertical and the place (unverified points are marked "to confirm").
- **Other changes:**
  - `repair` keeps the model's usable parts;
  - `swotText()` is the plain text used for the CRM note (`atomic.js scriptText`), the lead's `pitch_json.telecaller_script` and the CRM event;
  - `claudeScriptJob` (claude-jobs.js) is a strategist prompt: research, then the SWOT, then the mapping;
  - script page `renderSwot` (scripts.js: summary, 4 quadrants, solution rows, "Send to the CRM");
  - PDF `swotPdf` (A4: band, pitch point, summary, 2×2 coloured grid, service pills);
  - `cleanScript` keeps the new shape.
  - Old call-script docs still open in the old layout.
- **Rerun (owner chose "Rule-based SWOT now"):** all 60 live CRM leads' script docs regenerated and sent with use-for-lead (pitch point + SWOT note to the CRM). Scratchpad `swot-rerun.mjs` logs in with ADMIN_PASSWORD from `.env`.
- **Then (owner: "generate pitch points for existing leads and push to crm"):** the CRM had 233 leads (all deal stage `new`) and 113 were not imported yet (20 per read). `POST /api/atomic/sync` was repeated until none were left. Checked read-only in the CRM: **233/233 have the pitch point and a SWOT contact note.** 10 contacts have two SWOT notes (likely two AxiFlow leads on one contact; not deleted, since the CRM is read-only).
- **Claude mode is OFF on live AxiFlow** (switched off for the owner, who asked for it).
  - **Why:** the Claude subscription behind `CLAUDE_CODE_OAUTH_TOKEN` hit its **5-hour usage limit**. Every GitHub run since about 2026-11-05 16:25 UTC failed in 2 s, and the run conclusion says "success" because of continue-on-error.
  - **OpenRouter can't replace it yet:** the key is free tier with 0 credits, so Claude models are refused (402).
- **Fixes for the usage-limit case:**
  - the workflow prints Claude Code's error and post.mjs sends it (`Claude Code: …`);
  - `retry()` treats a usage-limit error as a hold: no try used, state `claude_hold` until the reset time + 3 min, new GitHub dispatches wait, and `retryStale` re-sends after the reset.
- **Ported to AWC engine** (c31cc97, b9bc106; deployed).
- **Also today:** owner asked for an admin in the **old live team CRM** (explicit exception to read-only): auth user deepunr@codeace.com made via the Auth admin API (needed a `user_invitations` row first: "Sign up is not allowed"), sales id 4 set to admin, sign-in checked. The new AWC already had that account.
- **Claude rerun of all 233** (owner: "claude limit is back. pls re run all and push to db as soon as possible", 10:12 UTC):
  - scratchpad `swot-claude-rerun.mjs`, 10 at a time; each result goes straight to use-for-lead;
  - first results in about 13 min, of good quality (site-specific findings, "to confirm" where unverified).
  - **Bug found:** the reset-time regex in `resetAt` had lost its backslashes in a heredoc patch, so every hold lasted 1 hour. Fixed in both repos (8d9710a, f8de028). The live hold was released in the AxiFlow DB by `release-hold.cjs` (10 docs).
- **AWC repo secrets** (owner: "add it"):
  - `AXIFLOW_CALLBACK_SECRET` (= AWC `CLAUDE_WORKER_SECRET`) and `CRON_SECRET` added via the GitHub API (sealed with libsodium, this machine's git login);
  - `CLAUDE_CODE_OAUTH_TOKEN` was added by the owner.
  - **Token-use logging** (owner asked how many tokens one pitch uses): the workflow prints `USAGE {...}` after each Claude run (turns, tokens, cache, cost, web searches, per model; numbers only, 1ddb661). Scratchpad `usage-collect.mjs` reads them from the run logs. Next: report the numbers and offer savings (Sonnet for SWOT via `--model`, fewer turns, capped research, a trimmed playbook/strategy/quality block for scripts).
  - **Measured** (8 runs, Sonnet 5.5 + Haiku for WebFetch): about 9 turns, 13k cache-write + 420k cache-read + 3.3k output tokens, about $0.14 API-equivalent, 45 s per SWOT.
  - **Limit:** the 5-hour limit was hit again at 94/233 (resets 15:23 UTC); the owner's usage was at 100%.
  - **Lean SWOT jobs** (owner chose "Cut tokens, then finish"; 486675e, AWC 629830e):
    - `prepare.mjs` writes `work/PROMPT-inline.txt` (system + task + schema inline) for kind script;
    - the workflow runs it with only WebSearch/WebFetch and max 8 turns, and `inline-result.mjs` saves the final message as `out/result.json` (validate + post as before);
    - research capped at 2 searches + 2 fetches;
    - `buildClaudeJob` leaves out `qualitySection` and the review scores for scripts (`withStrategy(schema, { review })`).
    - Tested locally on a copy (prepare → inline-result → validate OK). Not yet seen on a real run: check the USAGE lines after 15:23 UTC.
  - **Finish of the remaining 139:** `swot-claude-rerun.mjs --conc=3` (skips docs Claude already wrote and docs waiting on the server), started 10:46 UTC; it waits for the reset by itself.
  - **Still missing for AWC:** `GITHUB_DISPATCH_TOKEN` (owner: a fine-grained token for axilume-web-crm, Contents rw, saved in AxiCore Keys), then Claude mode on, then a test lead.

## Status (2026-11-06): merged project "Axilume Web CRM" (CRM + AxiCore 2.0), local only; rebranded and restyled
- **Owner:** "maintaining two systems seems difficult… merge crm and these 3 tools… a new user role… a new option in sidebar 'AxiCore 2.0'". Then "build a new project by copying and merging these, build locally", "dont do anything that existing", and "on click axicore from sidebar, let it be a new page".
- **Where:** `D:\projects\web-stream-automation\Axilume Web CRM` (the owner made the folder inside this repo; it is untracked here, and this repo was not changed). Move it next to the other projects before giving it its own git.
- **Built from:**
  - the CRM: github.com/karuncodeace/atomic-crm at 683acac, copied without `.git`;
  - this project: copied to `engine/`.
- **Changes** (all inside the new folder):
  - **Role `axicore`:** in the CRM types and canAccess, the users form and badge, the edge function and the schema. The migration `20261106100000_axicore_role.sql` is **not applied**.
  - **Sidebar:** "AxiCore 2.0", shown only for that role, opens `/axicore-app/` as its own full page with "Back to the CRM".
  - **Login:** the engine accepts the CRM Supabase token and reads the role from `sales` (`AXICORE_ROLES`). Every other CRM user may only read documents.
  - **Company pages:** a Documents panel.
  - **Proxy:** Vite proxies the engine paths.
  - **Engine safeguards:** `CRM_HARD_READ_ONLY=1` blocks every CRM write and upload. The engine has its own fresh local database, and `AXICORE_DEV_AUTH=1` applies only on this machine.
- **Run:** `npm run dev:axicore` (engine :3300 + CRM demo data :5174). The project guide is `AXICORE.md` in that folder.
- **Checked:** CRM typecheck passes; screenshots of the sidebar, the full-page tools and the company Documents panel; auth refuses no-login and fake tokens; no CRM write was sent (local outbox only); this repo unchanged.
- **Next:**
  1. Move the folder.
  2. New git repo plus Vercel (CRM build + engine function + rewrites + env + cron).
  3. Apply the role migration.
  4. Move the engine tables into the CRM database (needs the CRM DB password).
  5. Retire the old AxiFlow site.
- **Plan memory:** `axicore-merge-plan`.
- **Vercel setup (pushed, 2377f05):**
  - one project for the CRM and the engine: root `vercel.json` (Vite build to `dist/`; function `api/engine.js` = `engine/src/app.js`, 300 s, region sin1, engine assets/public/claude-worker included);
  - rewrites for `/api`, `/axicore-app`, `/pdf`, `/d`, `/fonts`, `/fonts.css`, `/brand`, `/webhooks`; daily cron;
  - the PWA service worker skips those paths (`navigateFallbackDenylist`, checked in `dist/sw.js`);
  - local production build passes.
  - The env values to import are in git-ignored `Axilume Web CRM/.env.production.local` (secret key still to fill).
  - **Owner:** import as ONE project (root `./`, preset Vite, not Services).
  - **LIVE since 2026-11-06:** https://axilume-web-crm.vercel.app (Vercel project `axilume-web-crm`).
    - **How it was deployed:** with the owner's permission, from the CLI (`vercel deploy --prod` in the AWC folder, linked via `.vercel/`); production env vars added from `.env.production.local`.
    - **Keys:** the project also has Vercel's Supabase integration (`SUPABASE_URL`, `SUPABASE_SECRET_KEY` and others, marked sensitive, so the CLI cannot read them). `engine/src/crm-key.js` makes the engine use that key when the CRM is the same project, so no `CRM_SUPABASE_SECRET_KEY` is needed.
    - **Fixes made while deploying:** rewrites for `/axicore-app/` and `/health`; `.vercelignore` (no env files or local data uploaded); the auth pages no longer filter the logo to one colour.
    - **Checked live:**
      - `/`, `/health`, `/api/me` (the engine reaches the database), `/api/settings` (401 without login), `/axicore-app/` with its JS and CSS, `/fonts.css`, the manifest;
      - the sign-up page for the first account (branded, no console errors).
  - **First account:** created by the owner (Deepu NR, deepunr@codeace.com, role `admin`). Owner chose option 1: admins open AxiCore too (`AXICORE_ROLES` and `VITE_AXICORE_ROLES` = `axicore,admin` on Vercel and locally; redeployed, checked in the live bundle). Managers and BDEs only see documents.
  - **Workflow tested live (2026-11-06):** test leads created like an import (company + contact + `open_cold_deal`), with nobody logged in.
    - **Trigger:** migration `axicore_notify` (pg_net trigger on 7 CRM tables; URL + secret in `axicore.notify_config`, not in git).
    - **Steps and timings:**
      - new lead → script, pitch point and script note with PDF (5 s);
      - Interested deal or interested call → brochure PDF in the bucket + `brochures` row pending (4 s);
      - approve → brochure_approved;
      - Proposal stage → proposal PDF + `proposals` row pending;
      - approve → proposal sent (₹17,700 from the price list);
      - Won → won;
      - Not interested → closed.
    - **Fixed during the test:**
      - CRM stages Proposal / Won / Lost added and the engine's stage map matched (the saved settings were updated too);
      - `crmCall` no longer moves a lead in researching / brochure_ready to replied (that skipped the approval);
      - Not interested closes leads in a conversation;
      - CRM notes say AxiCore.
    - Also stopped my local engine, which was running on the production database, and pointed local `engine/.env` back to its own local database.
    - **Test data removed:** the CRM is empty again; the AxiCore copies are hidden. 4 test PDFs remain in the brochure / proposal buckets: the Storage API needs the secret key, which only Vercel can read, so the owner deletes folders 228eae96…, cb5f3689…, b93474fb… in Supabase Storage.
    - **Safety rule seen:** an empty CRM read never marks leads removed.
  - **Next:**
    1. The owner opens AxiCore 2.0 from the sidebar with the real login; check the tools page.
    2. Claude on GitHub (owner: "move github workflow into this repo", then "dont move.. copy"):
       - **Done:**
         - copies at the repo root: `.github/workflows/axicore-claude-generate.yml` (steps in `engine/`) and `axicore-tick.yml` (every 2 h, new URL); the originals stay in `engine/.github`;
         - `claude.github_repo` = `deepunr-codace/axilume-web-crm` (default + saved setting);
         - `CLAUDE_WORKER_SECRET` on Vercel; redeployed. The repo is private (API 404 to visitors).
       - **Owner:** a fine-grained token for axilume-web-crm (Contents + Secrets read/write) → AxiCore → Integrations → Keys → GitHub token; then "Save to GitHub" for CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`), AXIFLOW_CALLBACK_SECRET and CRON_SECRET; then switch Claude mode on. Then I run a live test lead.
       - **Template leftovers** (owner: "ya remove unwanted"):
         - removed `doc/` (the template docs site), `deploy.yml` (Pages deploy) and `claude.yml` (the @claude issue bot);
         - `check.yml` runs on pull requests or by hand only;
         - the remote `gh-pages` branch is still there: deleting it was blocked by the permission check, so the owner deletes it.
  - **Team data moved** (owner: "fix 1", "create a new admin midhunkv@codeace.com"), 2026-11-06:
    - **How:** scratchpad `awc-move-team.cjs`; reads the old CRM over REST, never writes to it; one transaction; dry run first.
    - **Copied:** 67 companies, 67 contacts, 67 deals, 35 call assignments, 1 call log and 1 import batch with their ids, plus the 62 sectors. The old CRM had no notes, tasks or brochures.
    - **Users** (auth user + invitation row, so the CRM trigger makes the sales row):
      - Karun (admin) and Princy (BDE, so imports work) got random passwords: they reset to log in;
      - Midhun is **admin** with the password the owner gave.
      - Owners of every lead and call mapped to the new user ids (Deepu 1, Karun 9, Midhun 10, Princy 11).
    - **Checked with a real login:** Midhun signs in; the live engine `/api/me` says admin + axicore; AxiCore settings answer 200; he sees 67 companies.
    - **AxiCore CRM automation is PAUSED** (`atomic.enabled=false` in `axicore.settings`), so the 67 copied leads did not each get a script at once. The owner decides when to turn it on (better after Claude mode).
    - Changes made in the old CRM after this copy are not in AWC: re-run the script before the switch (new rows only; edits to existing rows are not updated).
  - **Gap check (2026-11-06):**
    - **Found and fixed:** a burst of CRM changes sent one ping each (57 in a second → 26 × 503, database connections exhausted). Fixes:
      - migration `axicore_notify_debounce`: at most one ping per 3 s;
      - the engine reads the CRM again 10 s after a ping;
      - pool size 2 on Vercel;
      - the setup page says AxiCore.
      - Re-tested: 31 changes → 3 pings, all 200.
    - **Still open:**
      - edge functions not deployed (`/functions/v1/users` returns 404, so no user invites);
      - no BDE users, and `import_leads` refuses without one;
      - team data still in the old CRM;
      - Claude token and repo secrets;
      - email / WhatsApp mock;
      - no Pexels / Unsplash key;
      - Auth Site URL;
      - DB password reset;
      - 4 test PDFs in the buckets;
      - Supabase free tier (pauses after a week of no activity, no point-in-time backups);
      - no alerts.
    3. Connect email / WhatsApp so the approved brochure and proposal reach the client (now mock).
    2. Supabase Auth Site URL = https://axilume-web-crm.vercel.app.
    3. `supabase functions deploy` (owner: login + link).
    4. Reset the DB password, then update `DATABASE_URL` on Vercel and in the local env files.
  - **Next after the first deploy:**
    1. Check `/health`, the login page, `/axicore-app/` and a PDF on the Vercel address.
    2. Set the Supabase Auth Site URL to that address.
    3. Deploy the edge functions; first admin sign-up; give the `axicore` role.
    4. Move the Claude GitHub workflow from `engine/.github` to the repo root, or use an API engine.
- **Git:** its own repo, https://github.com/deepunr-codace/axilume-web-crm (`main`, first push 2026-11-06, 1,275 files). The folder has its own `.git` (nested in this repo's folder, untracked here). Push over HTTPS; SSH has no key. Checked before pushing: no env files except the CRM's own placeholder `supabase/functions/.env`, no keys or passwords in any file.
- **Own Supabase project** (owner 2026-11-06, `hzxtdianyucccuogeygw`, Singapore, session pooler because the direct host is IPv6 only):
  - CRM migrations pushed, plus the axicore role and `axicore_documents` (buckets brochure + proposal, table `proposals`);
  - the engine's tables are in schema `axicore` of the same database (`DATABASE_SCHEMA`), and it points at this project as its CRM;
  - secrets only in git-ignored env files; details in AXICORE.md.
  - **Owner to do:** reset the DB password (pasted in chat), give the secret key, run `supabase login` / `link` / `functions deploy`, set the Auth URLs.
  - **Then (me):**
    1. Run `npm run dev` against the new project.
    2. The owner signs up as the first admin; I give the `axicore` role.
    3. Check AxiCore 2.0 with a real login. Turn `AXICORE_DEV_AUTH` off for that test.
  - The live CRM and live AxiFlow were not changed (owner: "dont make any changes in the existing system - its currently live and working").
- **AWC preloader** (owner: "lightning speed feel", then "premium standard"): a monochrome app-icon tile with the lightning mark, a fast sheen, the name and a slim progress line.
  - Used both for the boot screen (`index.html`) and in the app (`awc-preloader.tsx` via `loading.tsx`).
  - It follows the CRM theme from the first frame and respects reduced motion.
  - The v1 glow and streaks were dropped.
- **Rebrand:** all Atomic CRM / LEGO / Marmelab names removed from the screens (name Axilume Web CRM, AWC mark and icons, own welcome card and changelog, template telemetry off); details in AXICORE.md.
- **Sidebar:** the CRM sidebar is full height with square corners. At its bottom, AxiCore 2.0 is a **flat** tile (owner 2026-11-06: "remove the 3d effect", replacing the earlier neumorphic one; daa4e47, deployed): sidebar surface with a hairline top edge, mark / 2.0 chip / arrow as flat fills with hairline borders, hover changes the fill only; light and dark via the sidebar tokens. The main area and its top bar are flush (no rounded corners, no outer margin). The AxiCore panel has a matching "CRM" tile at its bottom (it replaced the top "Back to the CRM" link).

## Status (2026-11-05): classic deck closing slide redesigned
- Owner (screenshot of the old "THANK YOU." slide: blur photo, orbit rings, caps): "redesign this last. dont generate anymore".
- **New `closingSlide()`** in `src/design/deck.js` (exported), on the theme ink background (no stock photo):
  - logo;
  - "Thank you,\n<client>." in the heading face, with the client name in the accent colour. It shrinks to fit long names.
  - a one-line lead and the next-step pill (`cta.buttonLabel` + arrow);
  - a contact card ("Prepared for <client>", then call, visit, write and web rows with icons);
  - the usual footer rule and folio. It follows the brochure's palette and font pairing.
- **`tools.refreshClosingSlide(id)`:** lays out the saved content again and swaps **only the last page** of a classic-deck brochure (other edits kept). It then calls announce (edited), which queues one waiting CRM PDF upload.
- **Applied live without regenerating:** docs #46 and #53 (Wiseup) and #55 (Samsung). Backup of their old designs: `data/backup-closing-2026-11-05T18-25-13-340Z.json`.
- Not touched: the Editorial decks (their own closing slide), the Claude-drawn decks and the old 1440×810 "Codeace Default" brochures. No documents were generated.

## Status (2026-11-05): vertical playbooks, one strategy per lead, quality review, stock photos
- **Owner's goal:** "creative brochures with premium quality with correct pitch and contents and relevancy according to the business vertical and their needs. the case of proposals also needs like that". Then "ok do it" for: playbooks, strategy, review, stock photos (Pexels + Unsplash).
- **`src/ai/verticals.js`:**
  - `PLAYBOOKS` for the owner's 7 verticals plus Other: buyers, buying journey, what the owner cares about, website must-haves, angles, objections with answers, proof, tone, look, font pairings, photo searches;
  - `verticalFor(...texts)` (industry + CRM sector, name and description; "hospital", "retreat" and similar → Wellness);
  - `playbookSection(vertical)`.
- **`src/ai/strategy.js`:**
  - every Claude job gets `<strategy>`: either work out the lead's needs, angle, offer, proof, tone and what to avoid, or follow the agreed one;
  - every job gets `<quality_review>`: score relevance, specificity, consistency, premium and facts from 1 to 10 and rewrite anything below 8;
  - `withStrategy(schema)` adds `strategy` + `review` to every output schema.
  - `acceptResult` keeps the **first** strategy on the lead (`leads.strategy_json`) and stores `content.strategy` / `content.review`.
  - post.mjs treats strategy, review and font fields as soft.
  - Integrations → Last jobs shows the lowest score (hover for all five).
- **Everything is added in `tools.buildClaudeJob`** (playbook + strategy + quality sections appended to `job.prompt`; `job.vertical`).
- **`src/images.js`:**
  - **Search:** with PEXELS_API_KEY and/or UNSPLASH_ACCESS_KEY (Keys, group "Stock photos", with a Test button), brochure jobs search with the industry plus the playbook's photo queries (up to 8 queries, about 40 candidates). The candidates join `brief.assets` first (ids `px-…` / `us-…`, src `stock:<id>`); the sample images are marked "generic, use only if nothing fits".
  - **Download:** `materializeStock` (in claude-worker `postProcess`, for deck and free) downloads only the chosen photos at 1600 px, saves them as `upload:stock/<id>.jpg`, records the photographer and page in table `stock_images`, and reports Unsplash downloads as its API requires. A failed download drops the image.
  - **Sources allowed:** `SRC_RE` / `SAFE_SRC` accept `stock:` until the photo is saved.
  - **Tests only:** `PEXELS_API_URL` / `UNSPLASH_API_URL` overrides.
- **Fix:** `resumeDocs` no longer gives scripts a proposal layout at start-up.
- **Tested** (`quality-e2e.mjs`: stand-in OpenRouter + Pexels):
  - the playbook (Wellness for an Ayurveda retreat) and the review section were in the jobs, and the script's strategy reached the proposal prompt;
  - Pexels was searched with the playbook queries, and the chosen photo was downloaded and is the cover image in the design;
  - all 4 kinds ready; GitHub-engine e2e passes.
  - **Not tested:** the real Pexels and Unsplash APIs (no keys yet).

## Status (2026-11-05): classic typefaces + font pairings for brochures and proposals
- Owner: "use standard fonts too. not generic ai feel fonts", "in brochure, proposal".
- **Typefaces:** 16 OFL families as static TTFs from the Google Fonts CSS API, in `assets/fonts` with their OFL files (about 7 MB): EB Garamond, Libre Baskerville, Bodoni Moda, Playfair Display, DM Serif Display, Libre Caslon Text, Source Serif 4, Libre Franklin, IBM Plex Sans, Work Sans, Jost, Archivo, Oswald, Bebas Neue, Anton, Abril Fatface.
- **`src/design/fonts.js`** (no dependencies):
  - `EXTRA_FONTS`: codes like EG5/EG7, BK4/BK7, LF4/5/7, PX4/5/6, BB4…;
  - `PAIRINGS`: 13 heading + body pairings, each with a mood;
  - `withFonts(pairing, fn)` + `mapText` / `mapFont`: a layout built inside swaps its template codes by role (UM/LM/LR heading, US/LS/PB heading bold, H*/I*/P* body) and scales the heading letter spacing (`hLs`), so text is measured and wrapped in the new faces;
  - `resolvePairing(setting, chosen)`.
- **Where they are used:**
  - `classicDesign` / `editorialDesign` read `data.theme.fonts`; `brochureDesign` / `proposalDesign` read `content.font_pairing`;
  - the setting `fonts.brochure` / `fonts.proposal` is `auto` (Claude's choice; the default), `template`, or a fixed pairing (Tool settings, brochure and proposal cards);
  - `tools.withPairing` applies the setting to decks;
  - Editorial's ₹ stays in Inter.
- **PDF:** brand.js registers all faces. render-pdf measures their metrics from the font file (`measuredMetrics`, `fontNormal`). deck-kit `NORMAL` is a Proxy through the active pairing.
- **Editor:** `/fonts.css` is generated (linked in index.html); `/api/design/meta` returns `fonts` and `pairings`; the font menu has two groups, "Classic typefaces" and "Template fonts".
- **Claude:**
  - the deck schema has `theme.fonts` (an enum of pairings, with a typography rule plus the pairing list in the art direction);
  - the proposal job has `font_pairing`, and `postProposal` keeps it;
  - "Claude designs" gets every code and the pairings in its font guide;
  - a missing or invalid font field is a soft warning in post.mjs, so the template fonts are used.
- **Checked** in headless Edge, editor vs PDF: Editorial with Garamond + Franklin, classic with Bebas + Plex, proposal (A4) with Garamond + Franklin all match. The GitHub-engine and OpenRouter-engine e2e both pass. Known: the proposal price table stays Poppins.

## Status (2026-11-05): BYOK keys + Claude engines (GitHub / Claude API / OpenRouter)
- **Keys** (owner: "add options to add keys. BYOK + this claude integration", then "add open router too"):
  - **Store:** `src/keys.js`, table `app_keys`; AES-256-GCM, key from `KEYS_SECRET`, else `SESSION_SECRET`.
    - Changing SESSION_SECRET makes saved keys unreadable (shown as such; save them again).
  - **What can be set** (`KEY_DEFS`): Anthropic, OpenRouter, the GitHub token, the callback secret, CRM URL and key, WEBHOOK_SECRET, CRON_SECRET, SMTP_*, WA_*.
  - **What cannot:** DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET.
  - **How they apply:** `loadKeys()` (request middleware, cron, server start; 30 s cache) writes them into `process.env`. A saved key wins over the server value; Remove goes back to the server value. `claude.js` `resetClient()` picks up a new Anthropic key.
  - **What the browser gets:** only the source (app / server / unreadable) and the last 4 characters.
  - **API:** `GET /api/keys`, `PUT|DELETE /api/keys/:name`, `POST /api/keys/:name/generate` (random secret, shown once), `POST /api/keys-test/anthropic|openrouter`, `POST /api/github-secret`.
    - `/api/github-secret` saves the repo secrets AXIFLOW_CALLBACK_SECRET (from CLAUDE_WORKER_SECRET), CRON_SECRET and a pasted CLAUDE_CODE_OAUTH_TOKEN (not stored). It seals them with libsodium (new dependency `libsodium-wrappers`) and needs a token with **Secrets: read and write**.
- **Engines** (`claude.engine`; `ENGINES`, `engineOf`, `engineModel` in claude-worker.js):
  - `github`: as before;
  - `anthropic`: own API key, model `claude.api_model.anthropic`, default claude-opus-5-5;
  - `openrouter`: own key, model `claude.api_model.openrouter`, default anthropic/claude-opus-5.5.
  - **How the API engines run:** `runOnApi` in `background()`: web research with runText when `job.web`, then runJson with the job schema. "Claude designs" asks for JSON text, parsed by `parseJsonText`. The result goes through the same `acceptResult`, so retries, CRM writes and follow-ups are unchanged.
  - **Provider choice:** `runJson` / `runText` take `force: { provider, model }`, independent of the editor assistant's provider and of "Use AI"; the daily budget still applies.
  - **Setup checks:** `claudeMissing()` depends on the engine (the API engines need only their key, no https).
  - **Retries:** they run only on the live host; API jobs retry after 7 minutes (the Vercel function limit is 5).
- **UI** (Integrations):
  - a Keys tile and card (groups, Save / Generate / Remove / Test, "Save to GitHub" rows for the repo secrets);
  - the Claude card has a 3-way engine picker (saves at once), the models and the daily spend limit;
  - the Claude-mode setup dialog links to Integrations.
- **Tested:**
  - throwaway DB + stand-in OpenRouter (`byok-e2e.mjs` in the session scratchpad): key saved through the API (not in env), stored encrypted, survives a restart; script, Editorial deck, "Claude designs" (10 slides) and proposal all ready on the openrouter engine; no key in `/api/integrations` or `/api/keys`;
  - GitHub-engine regression e2e passes; page checked in headless Edge.
  - **Not tested:** the real Anthropic and OpenRouter APIs, the GitHub secrets API.

## Status (2026-11-05): automatic = template, by hand = choice; Integrations page
- **Automatic vs by hand** (owner: "let auto creation use template and manual show options"):
  - `tools.autoTemplate(kind)`: documents made by the automation (`createDoc(..., { auto: true })`) use `automation.auto_template.<kind>` (a template id; 0 = the default). They never use "Claude designs"; if that is the default, the first real template is taken (Editorial first).
  - The New form (`renderTool`) offers two choices: "Use a template" (picker without the Claude template) or "Claude designs it". The second is disabled without Claude mode; `/api/tools/options` returns `claude_mode`.
  - "Claude designs" without Claude falls back to the Editorial layout (`DECK_DESIGNS['builtin-claude']`).
- **Integrations** (owner: "provide detailed integration settings in sidebar and settings"): `#/integrations` (rail icon `hub` with an amber dot when something is wrong, panel Options, account menu), `renderIntegrations` in app.js, styles `.int-*` and `.how-*`.
  - API: `GET /api/integrations` (`src/integrations.js` `integrationsStatus`; secrets reported only as set or not set) and `POST /api/integrations/test/crm|github` (a CRM read; the repo, its visibility, the workflow file and the token's push right).
  - Last seen (state `integrations` via `seen()`): `crm_webhook` (/webhooks/atomic), `claude_result` (callback, with doc and outcome), `cron_tick`.
  - Cards:
    - Claude Code: missing setup, env keys, the repo secrets list, callback URL, settings, and the last 8 jobs with GitHub run links;
    - templates for automatic documents;
    - Team CRM: test, read now, all `atomic.*` options incl. buckets, tables and status values;
    - live sync: webhook URL, last change, SQL steps;
    - scheduler; files and database; editor AI; email and WhatsApp; login.
  - Tool settings' Claude card links to it. Checked in headless Edge (local server, no console errors).

## Status (2026-11-05): editable headings and stickers; "Claude designs (no template)"
- **Editing fix** (owner: "some texts or items editing not working properly"):
  - highlighted headings are now one text box: the words in the highlight colour are marked with `**…**` and the element has `hl` (colour);
  - stickers are one text box with `arc` (radius), drawn around the circle;
  - both work in the editor (spans / SVG textPath) and the PDF (`drawRich` / `drawArc` in render-pdf), and the properties panel has Highlight colour and Circle size. Checked editor vs PDF on all editorial slides.
  - Not changed: chips and benefit cards still have their text separate from the box behind it. Existing documents keep the old split elements until regenerated.
- **"Claude designs (no template)"** (owner: "without any templates claude can design? pls bypass for now let me test"): brochure template row `builtin-claude` (seeded, not the default). Claude Code returns every slide as positioned elements of the design model (`src/ai/claude-freeform.js`: `freeformJob`, `postFreeform`; job kind `free`). Guard rails:
  - images only from the catalogue plus the logo;
  - slides are 1920×1080;
  - text is measured, and text that runs off a slide is shrunk (to 70%) and moved up.
  - `validate.mjs` gives soft `layout:` warnings (off slide, overlap, unknown image, slide count).
  - The result is stored as `content.free.design` and used as is by `brochureLayout`.
  - Timing: the workflow timeout is now 25 min with 60 turns; free jobs are retried only after 27 min.
  - Without Claude mode it falls back to the classic layout.

## Status (2026-11-05): Claude mode live and working; brochures from scratch
- **Live setup (owner's tokens):**
  - `GITHUB_DISPATCH_TOKEN`: fine-grained, Contents read and write, expires 2026-12-05. It is in `.env` and on Vercel, and was pasted in chat, so regenerate it after testing.
  - `CLAUDE_WORKER_SECRET`: on Vercel.
  - Repo secrets `CLAUDE_CODE_OAUTH_TOKEN` (also pasted in chat, so regenerate it with `claude setup-token`) and `AXIFLOW_CALLBACK_SECRET`.
  - The repo is still public, on purpose for testing; the owner makes it private afterwards.
- **First real runs:**
  - script #34: GitHub run about 1 min, `source: claude`;
  - brochure #39 for Back To Roots: about 2 min, Editorial design picked by Claude, green/gold palette, concept and copy specific to the lead, no removed stats, no layout issues.
- **Bug found live and fixed:** my local dev server (sharing the Supabase DB, started with an empty token) re-sent a waiting job three times without credentials, then the job was rewritten in-app. Fixes:
  - `retryStale` only runs where `claudeOn()` holds (`claudeHost` = https);
  - on the live site, Claude mode with missing setup makes the job wait with an error (`claudeBroken`), never in-app.
- **Owner: "same result in all generations … build the brochure from scratch based on the lead's data".** Claude jobs now get:
  - `leadDossier()` (tools.js): the CRM record read live via `crmLead()` (company, sector, description, contacts with call stage and last result, deals, team notes without AxiFlow's own, open tasks), earlier research, AxiFlow notes, and the website check;
  - web research: `claude.web_research` (default on) allows WebSearch/WebFetch, and INSTRUCTIONS.md tells Claude to research the business first;
  - brochures always as the deck job (from scratch). With the classic template, Claude picks the design (`ctx.design || r.design`).
- **Scripts and proposals from scratch too** (owner: "do the same system for proposals and pitch generation. let claude fully build based on the lead"). `src/ai/claude-jobs.js` has `claudeScriptJob` and `claudeProposalJob`:
  - each has its own identity, guardrails and craft layers (banned list shared from `brochure-deck-core.js`), a `<lead>` dossier section and a research-first `<process>`;
  - they reuse the in-app schemas, context and post-processing;
  - no agency example to copy; the proposal job carries no price figures at all.
  - Live test on Back To Roots: script #42 and proposal #43 done in about 1 min. The proposal found the real address (Poolany, Meloor) and built the page structure from the business's treatments, programmes, physicians, rooms and stay flow; prices stayed AxiFlow's line items.
- **Prompt review and data fix** (owner: "whts prompt going to claude"). `tools.buildClaudeJob(doc)` builds the exact job without sending it; `sendToClaude` uses it. The prompts page was published as a private artifact (https://claude.ai/artifact/XPX9GMKTvvMUyTxDuYmQyf); the workflow page is https://claude.ai/artifact/CxUMdJ4DqgGp8xaaKMCsa3.
  - **Found:** lead 10 had `website = amazon.com` and Codeace's fallback research (CRM id reuse), and AxiFlow's own "Brochure ready…" deal notes were sent as team notes.
  - **Fixed:** the CRM website wins (empty = no website check); `usableResearch()` drops fallback research or research about another business; `OWN_NOTE` filter, dedupe, and notes under 4 characters skipped.
  - **Done:** docs #39, #42, #43 regenerated by Claude with the corrected data (no Amazon, no false website claims). The brochure is Editorial, "Rest begins before you arrive". AxiFlow's own `leads.website` for lead 10 is still amazon.com but is no longer used for Claude jobs.
  - **Bug fixed live:** opening a script showed "H.$$ is not a function". An earlier `String.replace` patch had turned `$$` into `$` in `setupScripts({ $, $$, … })` in app.js (the known gotcha; use the Edit tool or function replacements). The script page now also labels `source: claude` as "Written by Claude".
  - The owner's "Delete the old database" request was withdrawn by the owner ("its a mistake"); nothing was deleted.
- **Old in-app AI writing removed** (owner: "remove old logics"; chose "In-app AI writing" and "Delete the data too"):
  - `writeScript`, `writeBrochure`, `writeProposalDoc` and the old pipeline's `writeProposal` are standard-template only; `generateDeckData` (the in-app staged deck pipeline) and `brochureJob` are gone;
  - imported PDF templates get token fill only (no `fillTemplate` AI);
  - in-app web research (`maybeResearch`) is gone;
  - the pitch maker is rule-based (`fallbackPitch`), with no research step and no homepage designer (`runDesign` removed; the API `redesign` action answers an error);
  - Claude mode writes everything. Without it (mode off or a local dev server) documents are the standard templates.
  - **Kept:** the editor's AI assistant (`chatEdit`), the manager briefing, and the job builders and post-processors Claude uses.
  - **Data** (backup `data/backup-2026-11-05T16-20-46-163Z.json`): 31 `ai_calls` rows of the removed writers deleted; `leads.research_json` cleared (3, including Codeace's on lead 10); `design_html` / `design_version` cleared (3).
- **Speed** (owner: "make it fully automated at high speed"):
  - an interested lead in Claude mode dispatches the brochure first; `runPitchMaker(id, { design: false, ai: false })` runs rule-based afterwards and keeps the existing `telecaller_script`; no second script when one exists;
  - the workflow caches the Claude Code npm install (`actions/cache` on `~/.npm`, weekly key) and runs `claude -p`; job timeout 12 min;
  - Claude retry wait 20 → 12 min (startup upgrade of the saved 20);
  - new `.github/workflows/axiflow-tick.yml` calls `/api/cron/tick` every 30 min (needs repo secret `CRON_SECRET`; skips when it is missing).
- **No login needed:** with the trigger installed, the whole flow runs with nobody in AxiFlow. `/webhooks/atomic` now also calls `retryStale()`, so Claude retries no longer wait for the daily cron or a logged-in request.
- **Live sync:** the filled trigger SQL is `crm/axiflow-webhooks.READY.sql` (git-ignored; the secret matches the live WEBHOOK_SECRET, which answered 200). The owner runs it in the CRM Supabase SQL Editor; not run yet.
- **Next (offered):** a GitHub scheduled pinger every 30 min on `/api/cron/tick` (needs repo secret `CRON_SECRET`); CRM-side buttons calling a secure AxiFlow endpoint (the owner asked about moving the tools into the CRM; the advice was to keep AxiFlow as the engine and add buttons in the CRM).
- **Known limit:** the image catalogue is the template's generic sample set (salon stylist, 3D props), so visuals do not fit every industry. An image library per vertical is a possible next step.

## Status (2026-11-05): Claude mode (the 3 tools write with Claude Code on GitHub) + Codeace Editorial
- **Owner's requests:**
  - "integrate claude through git repo with an invoke function … sends back to axiflow"
  - "add an icon of claude in sidebar (colored) on click claude mode enable"
  - "need same setup for 3 tools"
- **Owner's choices (AskUserQuestion):**
  - make the axiflow repo private and run the worker in it (the repo is public today, and Actions logs of a public repo are public);
  - Claude subscription login: `claude setup-token` → repo secret `CLAUDE_CODE_OAUTH_TOKEN`;
  - Claude returns content and AxiFlow lays it out;
  - **on failure: retry Claude, no in-app fallback.** This is a deliberate exception to the fallback rule below.
- **Flow:**
  1. `tools.generate()`: when `claudeOn()` (`settings.claude.mode` and nothing in `claudeMissing()`), `sendToClaude()` builds the same job the in-app AI would run:
     - `scriptJob` (src/ai/script.js);
     - `brochureJob` (classic 12-page, src/ai/brochure.js);
     - `deckJob` (Growth Deck / Editorial, src/ai/brochure-deck.js: brochure-stage prompt layers plus a concepts → draft → critique → repair process);
     - `proposalJob` (src/ai/proposal-doc.js).
     Imported PDF templates stay in-app.
  2. `claude-worker.dispatchJob` sends a GitHub `repository_dispatch` `axiflow-generate` with `client_payload { doc_id, token, kind, job, callback }` and stores `input.claude` (job, ctx, attempts, run_url). `startJob` sees `'waiting'`, so the doc stays `working`.
  3. `.github/workflows/claude-generate.yml` runs `claude-worker/prepare.mjs`, then `npx @anthropic-ai/claude-code -p` (PROMPT.txt → INSTRUCTIONS.md; allowed tools Read/Write/Edit/`node claude-worker/validate.mjs`, plus WebSearch/WebFetch when `job.web`), then `post.mjs` → `POST /webhooks/claude-result` (header `x-webhook-secret` = `CLAUDE_WORKER_SECRET`).
  4. `acceptResult` runs the same post-processing as in-app (`postScript`, `postBrochure`, `postProposal`, `postDeck` = `toBrochureData` truth checks). Then `tools.completeDoc` lays out and calls `announce()` (CRM writes), and `afterReady` runs the automatic follow-ups:
     - **script:** `useScriptForLead`;
     - **brochure:** an activity;
     - **proposal:** `engine.proposalDocReady`, which is split out of `startProposal`.
     The callers (`runLeadTools`, `prepareScript`, `startProposal`) treat `tools.waitingForClaude(d)` as fine.
  5. **Retries:** `retryStale()` (cronTick + pollSoon) re-dispatches after `claude.timeout_minutes` (20) or a failed dispatch. After `claude.max_attempts` (3) the doc becomes `error` "Claude did not finish it"; Regenerate tries again.
- **Webhook responses:** 401 wrong secret, 404 wrong doc or token, 409 doc not waiting.
- **Shared, dependency-free core:** `src/ai/brochure-deck-core.js` (layers, schemas, parse, `toBrochureData`), used in-app and by `claude-worker/validate.mjs`. The validator is a small JSON-schema check plus, for decks, the layout limits and truth checks. `post.mjs` sends layout warnings on (AxiFlow fits the text) but schema problems as `{ error }` → retry.
- **UI:**
  - **Sidebar:** an orange Claude starburst button in the rail above Settings (faded = off, tinted = on) and a "Claude mode Off/On" row in the panel (`setClaude` / `toggleClaude` in app.js, `.claude-*` styles). A click with setup missing opens a dialog listing what is missing.
  - **Server:** `PUT /settings { claude: { mode: true } }` is refused (400) while setup is missing.
  - **Tool lists:** "Writing with Claude (try n)" plus a run link, and a "Claude" tag on docs it wrote.
  - **Tool settings:** a Claude mode card (repo, wait minutes, tries, what is missing).
  - **`/api/meta`:** `claude_mode`, `claude_missing`.
- **Env:**
  - `CLAUDE_WORKER_SECRET`: generated into local `.env` (also needed on Vercel and as the repo secret `AXIFLOW_CALLBACK_SECRET`).
  - `GITHUB_DISPATCH_TOKEN`: fine-grained, Contents read and write; empty in `.env` until the owner makes it.
  - `GITHUB_API_URL`: optional override, used for tests.
- **Tested** on a throwaway DB (`DATA_DIR`) with a stand-in GitHub that runs the real worker scripts on prepared answers:
  - script, classic brochure, Editorial deck (Claude's own palette; an invented "99%" stat removed) and proposal all came back ready with source `claude`;
  - 401 / 404 / 409 as above;
  - no answer → 3 tries → error.
  - The real GitHub run and the real Claude Code call are **not tested yet** (no token).
- **Owner to do:**
  1. Make the repo private (check that Vercel still deploys; Hobby cannot deploy org-owned private repos).
  2. Add repo secrets `CLAUDE_CODE_OAUTH_TOKEN` and `AXIFLOW_CALLBACK_SECRET` (= `CLAUDE_WORKER_SECRET` from `.env`).
  3. Create `GITHUB_DISPATCH_TOKEN` and add it plus `CLAUDE_WORKER_SECRET` to Vercel and `.env`.
  4. Click the Claude button.
- **Codeace Editorial** (same session): second design from `Downloads/files (1)`, in `src/design/editorial.js`, with shared pieces in `deck-kit.js` and the data contract in `brochure-data.js` (LIMITS, themes, ASSETS catalogue, `validateData`, `contentToData`).
  - The classic deck (`deck.js`) now also reads BrochureData. The template row `builtin-editorial` was added without changing the default.
  - In-app deck pipeline: `generateDeckData` (staged concepts → brochure → critique → repair, 240 s budget, falls back to `contentToData`). Settings `brochure_ai` (facts, `market_stats` with sources; the 88/72/60% figures moved here, pipeline, creativity, critic_model).
  - **Engine additions:** fonts Lora (LR/LM/LS) and Inter (IR/IM/IS, CSS family "InterDeck"); shape `line` with `dash: 'dot'`; `Builder.circleText` (sticker text = one rotated text element per letter); icon `spark`; `runJson` takes `messages`, `temperature`, `model`, `timeoutMs`.
  - **PDF fix for all templates:** pdfkit counts a line-break character as a glyph (0.5–0.85 em), so lines ending in a hard break wrapped one word early. render-pdf now measures and draws paragraph by paragraph.
  - Checked editor vs PDF on all 12 editorial slides plus the classic regression.
- **Gotcha:** the shell eats `$` and backticks in `node -e` patches. Use the Edit tool for code with template strings or regexes.
- **Machine:** port 3200 is the owner's Presenta Studio app. An old AxiFlow process can keep 3100 after a session ends; check with netstat.

## Status (2026-11-05): tool pages list first, "New" for manual
- Owner: "in each tool only add new can create manually, else list existing and other data". `#/script`, `#/brochure`, `#/proposal` = list (`docList(kind)` in `public/app.js`, used by scripts.js via `H.docList`): counts (made, leads, this week, being written), filters All / In the CRM / Automatic / By hand (/ Failed), search, table with lead (+ contact if not the same as the business, city), vertical·language / template·services / template·package, proposal total, made (automatic/by hand), CRM (newest ready per lead = "In the CRM", brochures/proposals with the CRM approval state: waiting / approved / sent back; others "Older version"), updated, PDF + Open; row click opens. The form lives at `#/<kind>/new` (back link + Cancel); every "New …" link (panel +, New menu, palette, home cards, lead pages, Templates "Use") points there.
- Server: `tools.listDocs` returns those fields (lead, template name, current, crm_state, detail, total, made). New docs store `input.auto` (true from `createDocForLead`, false by hand); older docs show "-".
- Seen 2026-11-05 afternoon: the brochure default template was back on the classic "Codeace Default Brochure" (not changed by code; probably someone clicked Make default) and a brochure was made with it at 15:13. Left as is; told the owner.

## Status (2026-11-05): Codeace Growth Deck = default brochure template
- Owner: "install this for brochure engine default template" (`Downloads/files/brochure-template`, a Next.js/React 12-slide 1920×1080 design, CodeAce × Bodhis LUXE). Not installed as React: rebuilt as a built-in **smart** layout for our design engine so the editor, PDF and AI fill all work: `src/design/deck.js` `deckDesign(content, settings, { company })`, fed by the same brochure copy (`src/ai/brochure.js`). Template row `design_templates` source `builtin-deck` "Codeace Growth Deck", seeded once and made the brochure default (`seedTemplates`); `tools.js` `brochureLayout(tpl, …)` picks it by source; the classic "Codeace Default Brochure" stays selectable.
- Slides: cover (arch + hero, rotated "For <client>" sticker, chips per service), about (credential card, tags, coin panel), digital shift (3 stats, statement), how we help (services index), one per service (alternating paper/blue, outlined ghost number, photo + cut-out per service id, 4 benefit cards), why us (4 stat cards), CTA (accent), thank you (closing-bg). Fixed agency copy in `DECK` in deck.js; theme `#2d4bd8 / #0b1033 / #f3f4f9 / #d7ff3f`. Headings with a highlight are wrapped in deck.js and split into coloured pieces (editor and PDF break at the same words). Service copy shrinks to fit above the benefit cards.
- Engine additions: fonts Unbounded (UM/US) + Hanken Grotesk (HR/HM/HS) in `assets/fonts` (OFL files there), `FONT_FILES` in `src/pdf/brand.js`, per-font metrics in render-pdf (hhea: Unbounded 1.24, Hanken 1.303), @font-face in styles.css, editor font select; text `outline` (stroke) and `rot` (degrees); image anchors `ha`/`va`; icons `check-bold`, `arrow-bar`.
- **Wrap fix for every template:** pdfkit counts the space after a line's last word, so lines that filled the box wrapped one word early in the PDF; render-pdf now gives pdfkit one space more width (`wrapOpts`, shifts centred/right text back) and ends each paragraph with a space (`ptext`). Checked side by side (editor vs PDF via pdf.js) on all 12 slides; classic brochure and proposal still render.
- Images: the template's sample images in `assets/brochure/deck` (WebP → PNG, all resized to their drawn size) so a 12-slide PDF is ~2.7 MB (Vercel caps function responses at 4.5 MB; the first unresized build was 5.7 MB).
- Note: the cover hero is the template's salon stylist for every client; replace it per brochure in the editor (or add generic cover photos later).

## Status (2026-11-05): AxiFlow is a tools engine (3 tools + their options)
- Owner: "make it as a tools engine, 3 powerfull tools and its related options. hide all others".
- **Menu** (`public/index.html`): All tools (`#/tools`, new home; `#/`, `#/today`, `#/manager` open it too) · Tools: Pitch scripts, Brochures, Proposals · Options: Templates, Tool settings. Leads, Pipeline, the bell, "Run automation", Automation log and Reports are gone from the menus and search (routes still work; the old Today is at `#/sales-today`). Search finds tool documents, tool pages and New actions only.
- **Home** (`renderToolsHome` in `public/app.js`, styles `.te-*` at the end of styles.css): one card per tool with New, the 3 latest docs, and its options: switches that save at once (`automation.auto_tools.script|brochure|proposal`, `automation.proposal_needs_ok`) and links to its template (default template name) and wording / prices (`#/settings/<business|brochure|proposal>` scrolls to that card). Proposals waiting for the OK are listed on the Proposal card with Open / Send (count in the menu).
- **Tool settings** (`renderSettings(section)`): When the tools run, On every document (agency), Brochure wording (cover, about lines, help intro, portfolio), Proposal prices and terms (currency, tax, support days, payment terms, notes, terms lines, packages + module split JSON), AI writer, Team CRM. All other inputs stay in the page inside `<div hidden>` so Save still sends them (dry-run check: saving changes no value). New input types `lines` (one per line → array), `area`, `wtext`.
- Tool doc lists (`tools.listDocs`) only show docs of live CRM leads; the CRM lead count ignores removed leads (live: 1).

## Status (2026-11-05): a lead = a CRM company with a deal
- Owner (screenshot of the Leads page with 4 rows): "there is only one lead in crm". The CRM had 4 companies (Back to Roots + 3 "test" made that morning, no deals), 2 contacts, 1 deal, 1 call assignment; the owner chose (AskUserQuestion) **a lead = a company with a deal**.
- `atomic.lead_rule` (`deal` default | `company`): `pollOnce` keeps only units with a non-archived deal (a contact without a company counts when a deal names it); `crmLeads()` (Leads page) uses the same rule; the "No deal yet" filter is gone. Companies without a deal are treated like leads removed from the CRM (hidden at once, purged after 7 days) and come back when a deal is opened.
- Live: read = 1 lead, 3 removed (test leads #13, #14, #15); Pipeline, Today, tool lists and Leads page show only Back to Roots (#10).
- Gotcha: in GNU sed a backslash-backtick in a pattern is the start-of-buffer anchor; a `sed 's/\\`/`/g'` put a backtick before every line of this file once (restored from git). Edit CLAUDE.md with the Edit tool or plain Node string replaces.

## Status (2026-11-05): AxiFlow = the tools on CRM data
- Owner: "only store/show data from crm, our target is to provide the tools". Chosen (AskUserQuestion): keep Pipeline; delete non-CRM data after a backup; tools only from a CRM lead.
- **Menu:** Today, Leads (CRM), Pipeline, Pitch scripts, Brochures, Proposals, Templates, Settings. Targets, Customers, Messages removed from rail, panel, account menu, New menu and search (routes still work). Today no longer shows the revenue-plan card.
- **Only CRM leads:** `/f` and `/api/intake` answer 410; `/api/demo/seed` 410 and the Settings demo button is gone; `tools.createDoc` refuses a document without a live CRM lead ("Pick a lead from the CRM first"); tool forms start with a required "CRM lead" picker; `/api/tools/options` lists CRM leads only.
- **Data deleted** (backup `data/backup-2026-11-05T07-14-07-663Z.json`): 11 documents without a lead, and the 2 leads already deleted in the CRM (Deepu NR #11, old Back To Roots #12) with their 5 docs, tasks, activities, events, outbox rows (`scripts/purge-non-crm.js --yes`, shared `src/purge.js` `purgeLeads()`). Each CRM read now also purges leads removed more than `atomic.purge_removed_days` (7) days ago.
- **Left:** lead 10 still has 2 documents (#18 script, #19 brochure) titled "Codeace", made on 2026-11-04 when CRM company 1 was still Codeace; deleting them was blocked by the permission system; the owner decides.
- Live check: menu without Targets/Customers/Messages; /f and intake 410; script without a CRM lead 400; demo 410; tool lead list = 4 CRM leads.
- Next for this change: the owner deletes docs #18/#19 (or allows it); the hidden screens (Targets, Customers, Messages) and their code can be moved to `archive/` later if they stay unused; README still describes the old full-CRM flow and should be rewritten around "tools on CRM data".
- Memory: `axiflow-tools-on-crm-data` (purpose and scope) next to `crm-read-only` (what may be written to the CRM).

## Status (2026-11-05): leads deleted in the CRM disappear from AxiFlow
- Owner: "when lead deleted frm crm, it still showing in axiflow". Removed leads (`leads.crm_removed_at` set by `pollCrm`, or set aside after an id reuse) are now filtered out (`crm_removed_at IS NULL`) of every list: `/api/leads` (Pipeline, Customers, search palette), CSV export, Reports (`/api/dashboard` counts, sources, pipes, meetings), Today (`/api/manager`: calls, drafts, approvals, replies, upcoming, researching, hot), projects, invoices, proposals to check, tool lead dropdowns, the AI briefing (`manager.js`), the daily digest and the daily run. Data is kept (soft delete); the lead page still opens by id. Live check: Pipeline = 4 CRM leads (#10, #13, #14, #15), deleted #11 / #12 gone, #11 page still opens.

## Status (2026-11-05): new CRM lead = call script only; status change = full pitch + PDFs
- Owner: "when a new lead is created be prepared to inject pitch script, when status changes, do our automation and push pdf to crm db for that cases".
- **New CRM lead** (no deal, or a deal/call stage with no action): `atomic.new_lead_action = 'script'` → `createLead(..., { autoRun: false })`, stage **`prepared`** (new stage, "Call script ready"; not in the daily run's stage list, so it waits), background `prepareScript()` = `createDocForLead('script')` + `useScriptForLead` → pitch point + script note to the CRM. No pitch maker, no brochure yet. A saved old default `new_lead_action: interested` is upgraded at startup.
- **Status changes → automation:** (a) `contacts.lead_stage` (telecaller call stage) via `atomic.lead_stages` (`interested` → interested, `not_interested` → not_interested; new/queued/in_progress/recycled nothing), tracked in `leads.crm_lead_stage` and part of the sync hash; (b) a call (call_logs or last_outcome) `interested`/`meeting_booked` on a `prepared` lead → `crmCall()` → `applyInterestChange(yes)` (prepared is in its lists) = full pitch maker + script + brochure → brochure PDF to the bucket + brochures row (pending); (c) deal stages as before (`atomic.stages`, proposal stage → proposal PDF to the CRM). At import the deal stage wins, then the call stage, then the new-lead action. `prepared` is in PRE_REPLY.
- **CRM id reuse** (found live 2026-11-05: the CRM tables were emptied with their id counters reset, so new company 2 "test" reused deleted Deepu NR's id): `leads.crm_created_at` = the CRM record's `created_at` (contacts: `first_seen`). In `syncLead`, the same external id with another creation time, or an id coming back after its lead was removed, renames the old lead to `atomic:co:<id>:old:<lead id>`, marks it removed and closes it as lost; the CRM record then becomes a new lead. If `createLead` finds a duplicate (same phone/email) that is unlinked, removed or the old copy, `reattach()` links it to the record (a lead linked to another live CRM record is never taken). Tested: different business on a reused id → new lead + old one closed; same contact → re-linked.
- **Fixes from live (2026-11-05, someone created CRM test companies 2, 3, 4 all named "test" with Deepu's email):** (1) `createLead(..., { dedupe: false })`: a CRM record whose email/phone matches a lead linked to another CRM record gets its own lead (`reattach()` only links leads with no CRM link at all; deleted or set-aside leads stay apart); (2) a deal stage with no action (e.g. `new`) falls back to the call stage, then to `new_lead_action` = call script only (before, it ran the full pitch). Lead 11 (Deepu NR, deleted) was set aside as `atomic:co:2:old:11` with its name restored. Result live: companies 2, 3, 4 → leads 15, 13, 14 with scripts and pitch points in the CRM (14 also got the full pitch before fix 2); Back To Roots (company 1, lead 10) got a fresh script: pitch point + contact note 4 (the CRM reset had cleared its pitch point).
- Tested on the stand-in CRM: 2 dealless leads → prepared + script only (pitch point + 2 script notes, 0 brochure rows); daily run leaves them; call stage → interested → brochure_ready, brochure row pending, 2 uploads; interested call log → full pitch, note kept; call stage → not_interested → closed.

## Status (2026-11-05): approval in the CRM; every telecaller call from call_logs
- The owner pasted the CRM schema (2026-11-05). New facts: `brochures.status` CHECK pending | approved | not_approved (default pending); `contacts.last_outcome` interested | callback | no_answer | not_interested; `contacts.lead_stage` new | queued | in_progress | interested | recycled | not_interested; `companies.priority` high | medium | low, `business_description`; new tables `call_assignments` (daily call list: assignment_date, sales_id, contact_id, company_id, deal_id, status open | done) and `call_logs` (assignment_id, sales_id, contact_id, outcome, notes, next_attempt_at). The `proposal` table was not in the paste.
- Owner chose (AskUserQuestion): **approve in the CRM** and **read every call**.
- **Approval:** brochure and proposal rows are written as `pending` (`atomic.brochure_status` / `proposal_status`; a saved old default `approved` is upgraded at startup). An existing row keeps its status when the file is replaced; a `not_approved` row goes back to pending with the new version. `applyApprovals()` (each poll, `atomic.crm_approval`): newest row per lead; brochure → `approved` = `engine.approveBrochure(lead, 'the CRM')` when the lead is in brochure_ready; proposal → `approved` = `sendProposalDoc` for the latest unsent proposal doc; `not_approved` = a new doc in the background (`createDocForLead`), which the outbox writes back as pending. Last status per lead in `leads.crm_brochure_state` / `crm_proposal_state` (also set on our own writes, so they are not acted on); a row seen for the first time is only recorded. Brochure requests = pending rows **without a link** (our own pending rows are not requests); the link is filled in, status stays pending.
- **Calls:** `applyCallLogs()` reads `call_logs` after `state.atomic.call_log_cursor` (id; 0 after the first successful read). First read ever: earlier calls only become history activities (no actions). Later: `engine.logCrmCall(lead, outcome, { notes, callbackAt: next_attempt_at })`. A call waits only while its contact's lead is still to be imported; deleted contacts / removed leads do not block. While call_logs can be read, the contact `last_outcome` path in `syncLead` is off (`useCallLogs`), so no call is counted twice. Trigger SQL now also covers `call_logs` and `call_assignments` (7 tables).
- Live (2026-11-05): the CRM was reset meanwhile (1 company left, Back To Roots; brochures row ids restart at 1). Row 1, written as approved under the old rule, was set back to pending (nobody had approved it). Live settings: brochure_status/proposal_status pending, crm_approval and call_logs on; CRM call_logs empty so far.
- Tested on the stand-in CRM: rows pending; CRM approved → pitch approved; not_approved → second brochure, row pending again, no echo; proposal pending → CRM approved → proposal sent (stage proposal_sent); a call log before AxiFlow → history only; a new callback log with notes → logged call + notes; next read 0 new.

## Status (2026-11-05): CRM change triggers (SQL for the CRM, not yet run)
- Owner: "can u create webhooks in crm db, when anything updated send a reqst to axiflow". AxiFlow only has the CRM REST key (PostgREST cannot create triggers) and no CRM DB password, so it cannot install them itself. **`crm/axiflow-webhooks.sql`** (placeholder `<WEBHOOK_SECRET>`; a filled copy is made locally, never committed): `pg_net` + `public.axiflow_notify()` (security definer, revoked from public/anon/authenticated) + statement-level `AFTER INSERT OR UPDATE OR DELETE` triggers on companies, contacts, deals, brochures, proposal → `net.http_post` to `https://axiflow-v1.vercel.app/webhooks/atomic` with header `x-webhook-secret`. Async (pg_net): CRM saves are never slowed or blocked. Includes check and undo queries. Tested on PGlite with a stand-in `net.http_post`: 5 tables, 500-row insert = 1 call, all operations fire.
- AxiFlow side: `/webhooks/atomic` (secret checked; live: wrong 401, right 200) now polls and then flushes the outbox; `pollCrm` re-runs once if a change arrives while a read is running (`pollAgain`). Our own CRM writes (brochures, proposal, pitch_point) also fire the trigger: harmless, the next read finds nothing changed.
- **Owner runs the SQL** in the CRM's Supabase SQL Editor (or adds a CRM DB connection string to .env so AxiFlow can run it).

## Status (2026-11-05): tools first on Today
- Owner: "focus our tools in the dashboard homepage". Today (`renderManager` in `public/app.js`) now opens with **Your tools** (`homeTools()`, right under the greeting, above the plan card): one card each for Pitch Script Maker, Brochure Generator, Proposal Generator (count made / this week / still writing, the 3 latest docs, "New …" and "See all"), plus a Templates button. Data from `GET /api/tools/docs?kind=` (no new API). Styles `.ht-*` at the end of `styles.css` (3 columns, 1 column under 1100 px; light-mode overrides). Checked in headless Edge with live data, dark 1440 px and light 900 px, no console errors.

## Status (2026-11-04): proposal PDFs to the CRM bucket + proposal table
- Owner: "do same for proposal, there is a bucket, add to that bucket and update table with the link". CRM (read 2026-11-04): table `proposal` (id, created_at, updated_at, company_id, contact_id, deal_id, title, **`porposal_url`** (spelled so), status) and public bucket `proposal`.
- `upsertProposal()` in `src/atomic.js` (event `lead.proposal_ready`): the lead's proposal doc (the given doc, else the latest ready) → `uploadPdf()` to `atomic.proposal_bucket` at `<lead uuid>/<slug>-website-proposal.pdf` (same uuid folder as the brochure, `leads.crm_brochure_folder`) → one row per lead in `atomic.proposals_table` (found by company_id/contact_id), link in `atomic.proposal_url_column` (`porposal_url`), status `atomic.proposal_status` (`approved`; if the CRM check constraint rejects it, the row is written without status = CRM default). Upload failure → row links to AxiFlow `/pdf/doc/<token>.pdf`. `uploadBrochurePdf` now uses the same `uploadPdf`.
- `tools.js` `announce()` covers proposal docs: ready → event at once; edits to design or line items → one waiting event 2 minutes later. `write_tables` default + startup upgrade now include `proposal` and `storage.proposal`.
- Note: a proposal waiting for the owner's OK on Today is already uploaded with status approved (status meaning in the CRM unknown; ask the co-worker).
- Tested on the stand-in CRM: proposal made for a lead → 300 KB PDF in `proposal/<uuid>/...`, CRM row (company, contact, title, approved, porposal_url = bucket link), same uuid as its brochure, 2 line-item edits → 1 waiting upload, nothing outside the allowed list. No live CRM lead has a proposal yet.

## Status (2026-11-04, latest): brochure PDFs uploaded to the CRM storage bucket
- Owner: "crm have a bucket - brochure; upload the generated brochure pdf also to the bucket and store that link in the crm db". CRM storage (read 2026-11-04): buckets `brochure` and `attachments`, both public, no size limit, empty.
- `uploadBrochurePdf()` in `src/atomic.js`: renders the lead's current brochure (`buildBrochureFor`, the designed one when ready), uploads it to `atomic.brochure_bucket` (`brochure`) at `<uuid>/<slug>-website-plan.pdf` (owner: "use unique id as folder names"; the uuid is kept in `leads.crm_brochure_folder`) with `x-upsert`, and `brochures.brochure_url` becomes the plain public link `<CRM>/storage/v1/object/public/brochure/<path>` (owner: "update url correctly"; an earlier `?v=` suffix was dropped; cache-control 60 s). If the upload fails the row keeps the AxiFlow link and the error is logged. Used for the brochures row and for answering pending CRM requests. Allowed by `storage.brochure` in `atomic.write_tables` (startup upgrades the two older saved default lists).
- Live (2026-11-04): someone emptied the CRM brochures table; AxiFlow re-created rows 13 (Codeace) and 14 (Back To Roots) with uuid-folder links that open. Deepu NR (company 2) was deleted in the CRM: `pollCrm` now marks such leads `crm_removed_at`, closes open ones as lost ("removed from the CRM"), skips their waiting CRM writes and never writes for them again. **Left over:** AxiFlow's old files in folders `company-1`, `company-2`, `company-7` of the `brochure` bucket (deleting them from here was blocked by the permission system; the owner deletes them in Supabase Storage or allows it).
- Brochure edits in the editor now re-upload too: `announce()` adds a `lead.brochure_ready` event 2 minutes later (`crmEvent(..., { delayMinutes })`), one waiting per lead, so autosaves do not each upload.
- Tested on the stand-in CRM: 3 leads → PDFs in the bucket (the first upload is the plain layout made at pitch time, replaced by the 1.1 MB designed brochure at the same path), rows link to the bucket, 3 autosaves → 0 immediate uploads and 1 waiting event, nothing outside the allowed list.

## Status (2026-11-04, latest): brochures and call scripts injected into the CRM automatically
- Owner: "generated brochure, pitch scripts should auto inject to crm db". The CRM has no script column (schema read 2026-11-04: companies has pitch_point, business_description, priority; notes live in contact_notes / deal_notes), so the **call script goes into one CRM note per lead**: on the main contact (`contact_notes`), else on the deal (`deal_notes`); no contact and no deal = nothing written until one is added (`syncLead` then sends `lead.script_ready` and refreshes the brochure row). Note text: pitch point, word-for-word script, pitching points, questions, objections, booking + the script PDF link (`/pdf/doc/<token>.pdf`, also as an attachment). The note id is kept on the lead (`crm_script_note_id`, `crm_script_note_on`) and PATCHed in place; recreated if deleted in the CRM.
- `tools.js` `announce()`: when any brochure or script doc for a lead becomes ready (pipeline or made by hand in the tools), and when a script is edited (autosave), it adds `lead.brochure_ready` / `lead.script_ready` to the outbox, at most one waiting per lead and event; the CRM write reads the latest doc when it runs. Brochures now go to the CRM for **every** CRM lead (the interested-only filter was removed). `pollSoon` also flushes the outbox, so writes go out while the app is used.
- `atomic.write_tables` default is now `['brochures', 'companies.pitch_point', 'contact_notes', 'deal_notes']`. Like brochures, script notes are only written when BASE_URL is https (the live site).
- Fixes after the first live lead (Back To Roots Ayurveda, 2026-11-04): (1) a local server (http BASE_URL) now skips CRM outbox rows entirely (`flushOutbox`), so it no longer uses up their retries before the live site sends them; (2) `repair()` in `src/ai/script.js` drops AI pitch points that describe the call instead of the offer ("call script", "phone call", "script for", "telecaller", "goal:", "targeting"), falling back to the standard pitch point.
- Gotcha found live: `saveSettings()` stores the whole merged settings, so the agency-rename migration froze `atomic.write_tables` at the then-default `[brochures, companies.pitch_point]` and script notes were refused. Startup now upgrades exactly that saved list to the current default (an edited list is kept). New defaults that live inside a saved block need such a migration.
- **Live (2026-11-04), first real lead "Back To Roots Ayurveda Retreat & Hospital"** (CRM company 7, contact 2 named like the business, deal stage "new" then "interested"): pitch point, brochures row 10 (approved, contact 2) and call-script contact note 3 (PDF attached) all written; rewriting the script updated note 3 in place. Also fixed: `contactFirstName()` in `src/util.js` (a contact named like the business → "someone from <business>"), and `repair()` rejects AI pitch points that only repeat the name and place.
- Tested on the stand-in CRM: 3 interested leads → 3 contact notes with the PDF attached + brochure rows; 3 autosaves of an edited script → still 1 note, with the edit; a hand-made brochure for a nurture lead → brochures row; company without contact → no note, then contact added → note on it; nothing written outside the allowed list.

## Status (2026-11-04, latest): agency renamed Axilume → Codeace
- Owner (quoting a generated call script "Hi Midhun, this is Arjun from Axilume"): "change everything from axilume to codeace". The app stays **AxiFlow**; the agency on every client-facing thing is now **Codeace**.
- Code: `settings.agency` defaults name Codeace, email `hello@codeace.com`, website `https://codeace.com` (both **guessed from the team's codeace.com mail domain: owner to confirm**); brochure About copy now "Codeace is a next-gen digital transformation company…" / "A multi-million dollar global technology firm trusted since 2018…" (dropped "Backed by CodeAce"). Boot migration in `settings.js` renames saved Axilume name/email/website and the old About copy; `seedTemplates()` renames built-in templates to "Codeace Default Brochure/Proposal". UI fallbacks, audit user-agent, README, .env.example updated.
- Image: `assets/brochure/thanks-bg.jpg` had the axilume wordmark baked in (top right, beside the codeace logo); painted out by vertical interpolation (original in git history). Other assets checked: no wordmark.
- Data (Supabase, backup `data/backup-2026-11-04T07-17-40-838Z.json`): text replaced in 9 docs content_json, 12 docs design_json, and Codeace's lead pitch_json/brochure_html/design_html. Old `crm_outbox` payloads left as history. Invoice prefix `AWS` (Axilume Web Studio) not changed: no invoices yet; owner may pick a new prefix.

## Status (2026-11-04, latest): CRM leads are the main data; pitch point + brochure written back
- Owner: "this crm leads are our main data, connect throughout the system"; "for the interested leads, our system generate brochure and send to crm brochure table"; "when somebody creates a lead in crm, it automatically comes here in pitch maker and builds pitch, then fills crm pitch points db col".
- **Sync per CRM lead** (`syncLead` in `src/atomic.js`, replaces the per-deal sync): every CRM company (with its main contact) is an AxiFlow lead `external_id 'atomic:co:<id>'`; a contact without a company is `'atomic:ct:<id>'`. The current deal = newest open deal, else newest. No deal → `atomic.new_lead_action` (default `interested` → pitch maker, call script, brochure). Deal stage → `atomic.stages` as before. Won/lost/archived deals at first import → lead kept as history (stage won/lost, `autoRun: false`, no automation). At most `atomic.import_per_poll` (20) new leads per poll. So the Pipeline, Today, and the Brochure/Proposal/Script tools' "Start from a lead" lists all use CRM leads.
- **Fresh data:** besides cron and `POST /api/atomic/sync`, every authenticated API request calls `atomic.pollSoon(background)` (in-memory throttle `poll_seconds`), so the live site reads the CRM while someone uses it.
- **Writes allowed while read-only** = `settings.atomic.write_tables` (default `['brochures', 'companies.pitch_point']`; entries are a table or `table.column`; `rest()` checks PATCH body columns; POST needs the whole table). `canPush(event)`: `lead.brochure_ready`/`lead.pitch_ready` → one `brochures` row per interested lead (found by company_id/contact_id; POST then PATCH; status `approved` = `atomic.brochure_status`: the CRM's `brochures_status_check` rejects ready/generated/completed/done/sent, accepts approved, default pending = a request; link `BASE_URL/pdf/brochure/<token>.pdf`); `lead.script_updated` → `companies.pitch_point`. Pending brochure requests in the CRM are answered too. Brochure links are only written when BASE_URL is https (a local server throws, the row stays pending, the live site sends it). Every other event is stored as `skipped`.
- **Live (2026-11-04):** real CRM read on https://axiflow-v1.vercel.app: Codeace (no deal) became an AxiFlow lead, got pitch, script and brochure in about 3 min, then `companies.pitch_point` = "A website that brings enquiries for Codeace" and brochures row 9 (status approved, link opens the PDF publicly); Deepu NR (won deal) imported as history, nothing written. Run the local server with `node --max-old-space-size=384 --max-semi-space-size=2 --env-file-if-exists=.env src/server.js` (its BASE_URL is localhost, so it never writes brochure links; the live site does).
- Leads page lead view: "Made by AxiFlow" card (call script, brochure, proposal with Open / Write one / PDF / Make it).
- Tested on the local stand-in CRM (fresh DB): 5 CRM leads → 4 interested (pitch + script + brochure), 1 won as history; new CRM company → AxiFlow lead → pitch point "Online booking for Kozhikode Dental Care" in `companies.pitch_point` + brochures row; second poll all unchanged; pending brochure request answered; brochure tool lists the CRM leads; no write outside brochures / companies.pitch_point. Gotcha: a DB that already saved `atomic.write_tables` keeps its saved list (production had no saved atomic block).

## Status (2026-11-04): Leads page (live CRM view); demo data removed
- Owner asked: "remove our current data, fetch live data from crm db, add a module in axiflow menu Leads".
- **Data removed** from Supabase (production) and from the local `data/pg` fallback: the 9 demo leads and everything tied to them (messages, tasks, meetings, proposal, activities, events, CRM outbox, runs, briefings, AI call log, docs with a lead_id). Kept: settings, message templates, design templates, the ₹12L plan, docs made in the tools without a lead. Full JSON backups first: `data/backup-2026-11-04T06-25-15-683Z.json` (Supabase) and `data/backup-2026-11-04T06-33-13-691Z.json` (local). Scripts: `scripts/backup-db.js`, `scripts/reset-lead-data.js --yes`.
- **Leads** (rail + panel, `#/crm`, `#/crm/:key`, `public/crm-leads.js`, API `GET /api/atomic/leads` and `/api/atomic/leads/:key` in `src/crm-leads.js`): reads the CRM live on every visit (GET only) and refreshes every 30 s while open. A lead = CRM company + contacts (contacts without a company listed alone, key `ct-<id>`; companies `co-<id>`). List: filters All / Open deal / No deal yet / Hot / Won or lost, search, main contact, phone, contact status, last call result, deal stage, AxiFlow stage if linked. Lead page: company, contacts (call stage, last/next call, attempts), deals, tasks, brochures, contact + deal notes; "Open in AxiFlow" when a linked lead exists. The Pipeline still holds only leads AxiFlow works on (open deals, via `pollCrm`).
- Real CRM data (2026-11-04): 2 companies (Codeace, Deepu NR), 1 contact (Midhun KV, hot), 1 deal (won, so not imported into the pipeline), 1 contact note; the only `sales` user has name "Pending Pending" (shown by email).
- **Machine gotcha:** Windows commit charge is almost full (≈26 of 27 GB), so plain `node src/server.js` dies at start with "Fatal process out of memory: Zone". Start with `node --max-old-space-size=384 --max-semi-space-size=2 --env-file-if-exists=.env src/server.js` (or free memory). Without `--env-file`, server.js uses the local `data/pg`, not Supabase.

## Status (2026-11-04): Team CRM connector (Atomic CRM on Supabase), read-only
- The team CRM is **Atomic CRM** (customised by the co-worker) on its own Supabase project `vedzrmwpojeyykjkkqyy` (NOT AxiFlow's `urjgjuleerifdvuxcmoa`). Keys in local `.env` as `CRM_SUPABASE_URL`, `CRM_SUPABASE_SECRET_KEY` (+ unused `CRM_SUPABASE_PUBLISHABLE_KEY`). **On Vercel project `axiflow` since 2026-11-04** (Production; added with the owner's permission, redeployed, live Leads API verified).
- **Owner (2026-11-04): "don't touch that CRM, only read-only mode for now".** `settings.atomic.read_only` (default true) makes `rest()` in `src/atomic.js` refuse every non-GET request; outbox rows for the CRM are stored as `skipped` (not replayed when write mode is switched on later). Never write to the CRM unless the owner switches this off.
- CRM schema (read via PostgREST OpenAPI, 2026-11-04; tables were empty): `deals` (stage text, contact_ids bigint[], amount, archived_at, sales_id), `companies` (+ custom `pitch_point`, `whatsapp_number`, `email`, `lead_date`), `contacts` (email_jsonb/phone_jsonb, `whatsapp_number`, `phone_e164`, `is_primary`, `do_not_contact`, call engine fields `lead_stage`, `last_outcome`, `last_attempt_at`, `next_attempt_at`, `retry_count`, `assigned_to`), `tasks` (contact_id required), `deal_notes` (attachments jsonb[]), custom `brochures` (company_id, contact_id, deal_id, title, brochure_url, status default 'pending'), RPCs `open_cold_deal`, `call_engine_settings`, `import_leads`. `configuration.config` is `{}` (default deal stages). Stage/outcome values in use are unknown until there is data: check Settings → Team CRM ("Deals now" column) and adjust `atomic.stages`.
- `src/atomic.js`: `pollCrm()` (every `atomic.poll_seconds`, from `cronTick`; `POST /webhooks/atomic?key=WEBHOOK_SECRET` triggers it; `POST /api/atomic/sync` from Settings) reads all deals + companies + primary contacts; each open deal = lead `external_id 'atomic:<deal id>'` (closed/archived deals are not imported); a sync hash skips unchanged deals; stage moves run `atomic.stages` actions (interested/proposal/won/lost/nurture/not_interested/ignore), keyed by `leads.crm_stage_key` so our own writes don't echo; contact `last_outcome` → `logCrmCall` keyed by `crm_call_key`. Write mode (`pushEvent`, outbox `target='atomic'`): script → deal note + `companies.pitch_point`; brochure → `brochures` row + note; call request → CRM task; reply/meeting/won/lost → notes; proposal sent → deal amount + stage (`atomic.write_stages`). New event `lead.brochure_ready` from `runLeadTools`.
- Tested against a local PostgREST stand-in (3 deals): read-only = 0 writes, leads created with contact details, unchanged second poll, CRM edits (phone, call result, stage) applied, write mode = 4 writes (deal stage+amount, proposal note, brochures row, brochure note), no echo, webhook secret checked. Real CRM read once (read-only): connected, 0 deals. Settings card checked in headless Edge (`scratchpad/cdp-shot.mjs`; in Git Bash set `MSYS_NO_PATHCONV=1` or `#/settings` args get mangled).
- Consent: the CRM has no opt-in fields; `atomic.deal_means_consent` (default false) decides if an open deal allows the WhatsApp/email intro. Without it, intros go to "needs manual" and the telecaller sends the brochure link.

## Status (2026-11-03): the tools run by themselves in the pipeline
- Owner asked "how can the tools work automatically"; chose all three (script, brochure, proposal) and "proposals wait for my OK".
- `engine.step('researching')`: after `runPitchMaker`, `runLeadTools(leadId)` makes a **pitch script** (`tools.createDocForLead('script')`, then `useScriptForLead` → lead `pitch_json.telecaller_script` + CRM `lead.script_updated`) and a **designed brochure** from the default template. Errors are logged under workflow `tools` and never stall the lead. `brochure_approved` makes the brochure first if a lead has none (leads that were waiting before the switch).
- **Brochure PDF for the client** (`/pdf/brochure/<lead token>.pdf`, the intro attachment, the approvals tab): `buildBrochureFor` (now async) serves the lead's latest designed brochure, falling back to the built-in layout. Approvals shows "Edit brochure" (opens the editor; the intro sends the latest version). "Rebuild brochure" also remakes the designed one.
- **Proposals:** `startProposal(leadId, reason)` (meeting done in `meeting_booked`, or the lead-page "Make the proposal" button) makes a designed proposal for the recommended package; with `proposal_needs_ok` it adds a task + shows on Today under **Proposals to check** (`tools.proposalsToCheck()`, in `/api/manager` as `proposals_check`) with Open / Send; lead page main button becomes "Send the proposal". `sendProposalDoc` turns the doc's line items into a normal `proposals` row (`doc_id` column added; prices from the tool's items, tax added in code; no AI pricing) and sends it; `/pdf/proposal/<token>.pdf` and the reminder attach the designed PDF (`buildProposalFor` checks `doc_id`). Accept by YES / page / CRM, invoices etc. unchanged.
- Tool docs made for a lead reuse its stored pitch-maker research (`researchFor(doc)`), so no second web search. `createDoc(kind, raw, { wait })` / `generate(id, { wait })` can finish before returning (pipeline). Lead detail API returns `tool_docs`; the lead page shows "Made for this lead: Call script / Brochure / Proposal".
- Settings (Advanced > Automation): `automation.auto_tools.{script,brochure,proposal}` (default on) and `automation.proposal_needs_ok` (default on). Off = previous built-in behaviour.
- Tested end to end on the test DB (no AI key, template paths): intake → script + brochure docs → client brochure link = designed PDF → approve → intro with attachment → reply → proposal doc waits on Today → Send → proposal row with doc_id, designed PDF on the client link, task closed → accept → won + advance invoice. UI checked in Edge. Gotcha found: in `String.replace(str, replacementString)` a `$$` becomes `$` (broke `$$(...)`); always pass a function as the replacement in patch scripts.

## Status (2026-11-03): own dropdowns; bigger template previews
- **Dropdowns:** every `<select>` is replaced by AxiFlow's own button + menu (`public/select.js`, `autoEnhanceSelects()` at the end of app.js; a MutationObserver upgrades selects added later in views, dialogs and the editor). The real select stays hidden as the source of truth (forms, `.value`, `change` events unchanged); `value`/`selectedIndex` setters are wrapped per element so code that sets them updates the button. Keyboard: arrows, Home/End, Enter/Space, Esc (closes only the menu, not a dialog), Tab, type-ahead. Menu opens upward when there is no room, lives inside an open `<dialog>` (top layer), closes on outside click/scroll/resize. Opt out with `<select data-native>`. Styles: `.xsel*` in styles.css (dark + light). Avoid the class `empty` inside menus (global `.empty` empty-state style).
- **Template cards:** preview edge to edge (no inner padding), grid columns min 400px; preview height capped at 360px so A4 proposals show as a centred portrait page.
- Tested in headless Edge: 3/3 selects enhanced on the scripts page, keyboard choice, type-ahead pick of a lead that pre-fills the form (programmatic value set), editor property selects, select inside the import dialog, no console errors.

## Status (2026-11-02): editor slide navigation
- Mouse wheel / trackpad on the canvas moves to the next or previous slide (`goPage`, 60 px threshold, one slide per 450 ms); when zoomed in, the stage scrolls first and changes slide only at the top/bottom edge; Ctrl/Cmd+wheel left to the browser. Page Down / Page Up (and ↓ / ↑ with nothing selected) do the same; the active thumbnail scrolls into view. Layout fix so the stage itself scrolls when zoomed (`.ed-center, .ed-stage { min-height: 0 }`, `place-items: safe center`). Tested in headless Edge (wheel down/up, tiny nudge ignored, keys, zoomed scroll at 184%).

## Status (2026-11-02): editor fix
- Double-click on a text box did not start editing: the stage's `setPointerCapture` (for dragging) made the browser report the dblclick on the stage. `public/editor.js` now finds the text box under the cursor (`elementsFromPoint`), falls back to the selected text box, and releases pointer capture on pointerup. Tested in headless Edge (dblclick → editing, typing works; nothing saved during the test). Flat-card change was reverted at the owner's request (cards keep their shadows).

## Status (2026-11-02): uploads → Supabase Storage
- Owner asked to move uploads from Vercel Blob to Supabase Storage. `src/storage.js` now prefers Supabase Storage when `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) are set: REST API, private bucket `SUPABASE_BUCKET` (default `axiflow-uploads`, created on first use, 15 MB file limit), headers `apikey` + `Authorization: Bearer` with the secret key, upsert. Reads fall back to Vercel Blob for files saved before the switch; Blob is used only when Supabase is not configured; local `data/uploads` otherwise. `npm run copy:uploads` (`scripts/copy-uploads-to-supabase.js`) copies everything from Blob (`uploads/` prefix) and `data/uploads` into the bucket.
- **Live since 2026-11-02:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (secret key, only in `.env` and Vercel env vars), `SUPABASE_BUCKET=axiflow-uploads` set locally and on Vercel project `axiflow`; private bucket created (public URL returns 400); the one existing Blob file was copied with `npm run copy:uploads`; verified on the live site (upload lands in the bucket, read back via the app, PDF). The Vercel Blob stores (`axiflow-media` on axiflow, `axiflow-uploads` on axiflow-v1) are no longer needed; the owner may delete them (then also remove `BLOB_READ_WRITE_TOKEN`).

## Status (2026-11-02): OpenRouter as a second AI provider
- `src/ai/claude.js` now routes `runText`/`runJson` to **Anthropic** (SDK, as before) or **OpenRouter** (`orRun`: POST `/chat/completions`, strict `response_format: json_schema` for structured output, `plugins: [{id:'web'}]` instead of Claude's web_search/web_fetch tools with sources from `url_citation` annotations, `reasoning.effort`, `usage.include` so the real cost lands in `ai_calls.cost_usd`). Provider = `settings.ai.provider` (auto | anthropic | openrouter; auto = Anthropic if `ANTHROPIC_API_KEY` is set, else OpenRouter). Model = `settings.ai.openrouter_model` or the Claude model mapped (`claude-opus-5-5` → `anthropic/claude-opus-5.5`, which OpenRouter lists with structured outputs). `OPENROUTER_BASE_URL` overrides the endpoint (tests). Settings page: provider select, OpenRouter model, key status for both.
- Tested against a local OpenRouter stand-in, then with the owner's real key (2026-11-02): `OPENROUTER_API_KEY` is in local `.env` and Vercel project `axiflow` (never in tracked files). A small structured call to anthropic/claude-opus-5.5 worked (4.6 s, $0.002); the full live pitch script + web research then got 402 "credits used up" (account is free tier, no credits) and AxiFlow fell back to the standard script as designed. **Owner to add credits at openrouter.ai**, then re-run a script with research on the live site.
- **Owner chose a free model for now (2026-11-02):** settings (in Supabase, shared by live and local) `ai.provider=openrouter`, `ai.openrouter_model=nvidia/nemotron-3.5-super-vl:free`. Web search is billed even on free models, so `runText` with web tools on a `:free` model throws immediately and callers use their no-AI research fallback. Structured requests send `provider.require_parameters: true`. The free model often ignores the schema: `repair()` in `src/ai/script.js` keeps usable AI parts and fills the rest from `templateScript` (pitch point must mention the business). Live-tested: editor AI assistant works (applied an edit); a script comes back with the AI's word-for-word script and standard sections. To go back to Claude: add credits, then Settings > AI > OpenRouter model = empty (or `anthropic/claude-opus-5.5`). Admin password changed by the owner (kept only in local `.env` and Vercel env vars; never write passwords into tracked files).

## Status (2026-11-02): Postgres + Vercel; Pitch Script Maker
- **Hosting target: Vercel + Supabase Postgres + Vercel Blob + Cron** (owner chose it; Supabase project `urjgjuleerifdvuxcmoa` is for this app, NOT the CRM). The owner pasted the DB password in chat: they were told to reset it; never put secrets in code or git, only `.env` / Vercel env vars. Waiting on the owner for the Supabase **Transaction pooler** URL (port 6543; the direct `db.<ref>.supabase.co:5432` host is IPv6-only and Vercel cannot reach it).
- **Data layer** (`src/db.js`): all functions async (`get/all/run/insert/update/transaction`), `:name` params compiled to `$n`, objects stored as JSON text, booleans as 0/1, ids are `INTEGER GENERATED BY DEFAULT AS IDENTITY` (REAL → DOUBLE PRECISION), int8/numeric parsed to numbers. Modules add tables with `registerSchema()` / `addColumns()` (applied in order once per process; skipped when the stored `schema_hash` matches). Transactions use AsyncLocalStorage so inner queries share the client. SQLite-isms fixed (datetime, boolean SUM, LIKE → ILIKE, COLLATE NOCASE, INSERT OR IGNORE, rowid).
- The sync → async conversion was done with an AST codemod (acorn; awaits every call to an async function, marks the enclosing function async, follows imports) plus hand fixes where it flagged array callbacks (plans weekly actuals, intake, seed, milestones loop) and a real bug it would have caused (crm-sync snapshot). `getSettings()` stays synchronous: `loadSettings()` refreshes an in-memory copy at the start of every request (middleware in `src/app.js`), cron tick and scripts.
- **Entry points:** `src/app.js` (Express app, `boot()` = schema + seed defaults/templates), `src/server.js` (local: listen + 30 s scheduler + resume jobs), `api/index.js` (Vercel). `vercel.json`: framework null, `outputDirectory: public`, all routes rewritten to `/api`, `maxDuration: 300`, `includeFiles: assets/**`, daily cron `35 3 * * *` (09:05 IST) on `/api/cron/tick`.
- **Scheduler:** `cronTick()` in `src/scheduler.js` (daily run when due, else sweep; CRM outbox flush; resumes doc jobs idle > 6 min). `/api/cron/tick` needs `CRON_SECRET` (Bearer header from Vercel Cron, or `?key=` for an external 15-minute pinger such as cron-job.org; Vercel Hobby cron is daily only).
- **Background work:** `src/background.js` `background(fn)` (waitUntil on Vercel) replaces every `setImmediate` (pipeline advance, pitch maker, doc jobs, CRM flush).
- **Uploads:** `src/storage.js` (`saveUpload`/`readUpload`, Blob when `BLOB_READ_WRITE_TOKEN`), designs still use `upload:<key>`; the PDF renderer preloads images (`preloadImages`) then draws synchronously. Vercel caps request bodies at 4.5 MB: the PDF template import uploads each page image first (`/api/design/images`, 4.4 MB limit), then posts a small template body; editor PNG uploads only when < 2.5 MB.
- **Migration:** `npm run migrate:sqlite [path] [--force]` (`scripts/migrate-from-sqlite.js`) copies every table with ids, resets identity sequences, copies `data/uploads` to the store. Done for the owner's local data into `data/pg` (9 leads, active ₹12L plan, 3 docs, settings verified). To fill Supabase: set `DATABASE_URL` (and `BLOB_READ_WRITE_TOKEN`) in `.env`, run the script once.
- **Pitch Script Maker** (owner request; plan PDF p.6): sidebar Create → Pitch scripts (`#/script`, `#/script/:id`, `public/scripts.js`). Form (business, contact, phone, vertical from the owner's 7 verticals, place, website, language English/Malayalam/Hindi in English letters, notes, web research) → website audit + optional research → `src/ai/script.js` (`writeScript`, structured: pitch point for the CRM, introduction, opportunities, 3 pitching points, questions, objections, booking ask/if yes/if not now, word-for-word script; rule-based `templateScript` per vertical without AI) → stored as `docs` kind `script` (`content_json`). Script page: editable sections with autosave, Copy script, PDF (`src/pdf/script.js`, A4 Axilume brand), "Use for this lead's calls" (writes the lead's `pitch_json.telecaller_script` and sends `lead.script_updated` to the CRM), write again, delete. Lead page More → "Write a call script" pre-fills it.
- **Tested** (all locally on embedded Postgres): API smoke test of 48 calls, the full conversion flow (approve → reply → book → proposal → accept → pay → onboarding transaction with 6 milestones), uploads → imported template → PDF with images, migration on a copy of the real DB, UI regression screenshots (no console errors), Pitch Script Maker in Edge (prefill, autosave, copy, PDF, use for lead, phone layout). **Not yet run against Supabase or deployed to Vercel**; the AI script path has not been run (no API key).

## Status (2026-11-02): Targets (revenue plans)
- Owner's plan PDF `Downloads/Web Development.pdf` (pages 9-13 are images: ₹12L target = 600 new calls → 60 meetings → 36 proposals → 6 wins at ₹2L avg; weekly tables for 24 days (4×150 calls; meetings 12/15/16/17; proposals 6/9/10/11; wins 0/1/2/3) and 48 days; daily schedule 25 new calls × 3.5 min + 25 min breaks + 7.5 buffer + 20 follow-ups in 30 min = 2h 30m; "compare previous week and check achieved or not").
- **Targets** (sidebar, `#/plans`, `#/plan/:id`, `#/plan-edit/new|:id`): `src/plans.js` (tables `plans`, `plan_entries`) + `public/plans.js`. Create a plan (presets "₹12 Lakh in 24 / 48 working days" reproduce the PDF numbers exactly; or own numbers: target ÷ avg value → wins, funnel ratios → proposals, meetings, calls, split over calendar weeks from the start date by working days, meetings/proposals ramp, wins from week 2), set the date range and working days, edit any weekly cell, Save as draft or Save and activate. One active plan at a time (activating pauses the other). Draft / active / paused / archived; duplicate; delete.
- Actuals = automatic (calls: `events` workflow 'calls' step 'outcome'; meetings by start_at, not cancelled; proposals table + proposal-tool docs not tied to a pipeline proposal; wins and revenue: accepted proposals by responded_at, revenue = subtotal) **plus** numbers logged by hand ("Log numbers", for work done outside AxiFlow). Date bounds use `settings.schedule.timezone`.
- Today shows the active plan card (revenue vs target with a "where you should be today" marker, the 4 funnel numbers with this week's progress, today's calling job with catch-up rate, Log numbers) or a "Set a revenue target" prompt. Plan page: weekly table actual/target with ✓, Achieved/Missed per week, change vs previous week (finished weeks only), last-week review card, daily schedule, funnel, logged numbers.
- Tested in headless Edge against a copy of the real DB (create from preset with a past start date, log numbers, Today card, plan page, list, phone width); no console errors. Found and fixed: `min=1 step=1000` made ₹12,00,000 invalid in the browser. The real DB only gained the two empty tables.

## Status (2026-11-02, latest): Canva-style editor, AI assistant, templates; rebranded AxiFlow
- **Names (owner):** the app is **AxiFlow** (brand kit from `Downloads/AxiFlow_Brand_Kit`, copied to `public/brand/`: A-mark logo, Electric Violet #6A5CFF, Signal Cyan, Inter). The agency is **Axilume** (settings `agency.name`; client documents and client pages use the Axilume blue #2d4bd8 and Poppins). Saved settings were migrated from "Axilume Web Studio".
- **Design engine** (`src/design/`): documents are pages of positioned elements (text, image, shape, icon, pricing), see `model.js`. One data model feeds the browser editor (`public/editor.js`), the PDF (`render-pdf.js`, pdfkit; text metrics follow CSS: Poppins typo metrics, so line box = lh×size and glyphs are centred) and the AI assistant (`applyOps` with whitelisted props). Built-in layouts in `layouts.js` (`brochureDesign`, `proposalDesign`) reproduce the owner's reference PDFs.
- **Editor:** page thumbnails (add, duplicate, delete, reorder), drag and move with snapping, resize handles, double-click to type, properties (weight/size/colour/align/line height/spacing/lists, fill/border/radius, image replace and fit, layers), add text/image/shape/icon, page background, prices modal, undo/redo, keyboard shortcuts, autosave.
- **AI assistant** (`src/ai/design-ai.js` chatEdit): a structured-output list of ops (set_text, set_props, add/delete, page ops, set_items); bad ops are skipped; chat history is kept per document.
- **Templates** (`src/design/templates.js`, table `design_templates`): built-in "smart" defaults (AI writes structured copy → layout), plus "fixed" templates imported from a PDF (in the browser with pdf.js: text-free background per page plus text boxes from text runs; fonts mapped to Poppins at 94% size) or saved from a document (client name → {{company}}). AI `fillTemplate` rewrites the text boxes for each client. One default per kind.
- runJson now streams (the SDK refused non-streaming at 24k max_tokens; found by testing against the mock). Old documents without a design are laid out automatically at startup.
- Tested in headless Edge against the API mock: create, drag, edit properties, type, undo/redo, add page, AI chat (2 applied, 1 bad op skipped), PDF, save as template, import of the reference brochure PDF, and making a brochure from the imported template (AI fill). Known: the PDF import is approximate (fonts swapped; occasional stray glyph where the source drew text as shapes).

## Status (2026-11-02): AI Brochure Generator + AI Proposal Generator tools built
- **AI Brochure Generator** (`#/brochure`): form (or prefill from a lead) → optional Claude web research → `src/ai/brochure.js` tailors the agency copy in `settings.brochure` → `src/pdf/brochure.js` renders a 12-page 16:9 deck (1440×810 pt) copying the owner's reference `Downloads/Digital Growth Solutions.pdf`: blue `#2d4bd8`, Poppins, white headings with gradient bar, green bullet icon, illustrations cropped from the reference into `assets/brochure/*.jpg`, CTA and Thank-you backgrounds rendered text-free. Optional cover photo upload per brochure (`data/uploads`). About 1.7 MB per PDF.
- **AI Proposal Generator** (`#/proposal`): form → `src/ai/proposal-doc.js` writes summary, scope, structure, detailed features and deliverables (no prices) → `src/pdf/proposal-doc.js` renders an A4 document copying `Downloads/jayabharathams's - proposal.pdf` (gradient cover with card, 32pt titles with rule, flowing feature lists, module-wise Investment table, terms, contact page). Prices = the package split by `settings.proposal.modules`, editable as line items in the UI; terms and notes in `settings.proposal`.
- Both tools: background jobs (`src/tools.js`, `docs` table, resumed on restart), an editor with live PDF preview, Download, a share link `/pdf/doc/<token>.pdf`, Regenerate and Delete. Template fallback without AI. Tested in headless Edge (create, edit, save, cover upload, download, share link, line items), and the AI path against the API mock. Not yet run with a real Claude key.
- Agency contact details defaulted from the reference brochure (+91 8296 93 8296, hello@axilume.com, Sahya Building, Gov Cyberpark, Kozhikode); placeholders in the saved settings were migrated.
- Fonts: Poppins (OFL) in `assets/fonts`. The reference used a different grotesque, so the look is close, not identical.

## Status (2026-11-02, earlier): v3, renamed Axilume Web Studio; CRM direction under review
- 2026-11-02: app renamed **Axilume Web Studio** (UI, favicon "AW", defaults, README; saved settings migrated where still on the old placeholders; new invoice prefix "AWS"). Technical `X-WebStream-*` headers and the folder name were left unchanged.
- 2026-11-02, flow analysis given to the owner. Gaps: interested leads without consent dead-end; `needs_manual` and `replied` have no timeout; pitch approval has no deadline; duplicate Twenty companies merge and lose their call outcomes; nurture can request 5 calls per lead. The owner found the setup "very complicated".
- **Pending direction (not built):** the owner plans to use **Atomic CRM** (Marmelab: react-admin + Supabase, MIT) instead of Twenty. Proposed slim design: Atomic CRM's deal board is the pipeline; this app becomes a worker reacting to 3 deal-stage moves (Interested → pitch + script + brochure PDF attached as a deal note; Send brochure → send + day-2/day-5 tasks; Send proposal → proposal PDF + deal amount), via a Supabase database webhook on `deals` plus service-key writes. Everything else (own CRM screens, marketing pipes, planner, booking, invoices, delivery, Twenty/n8n) would move to `archive/`. Atomic CRM facts: tables `companies`, `contacts` (company_id), `deals` (stage text, contact_ids bigint[], amount), `tasks` (contact_id required, no deal_id), `deal_notes` (attachments), storage bucket `attachments`; telemetry is on by default (`disableTelemetry`).
- v3: **Pitch Script Maker** (pitch now includes `telecaller_script`, sent to Twenty in `lead.call_requested`). **Brochure Maker** (`src/pdf/pdf.js`, pdfkit, 4 pages incl. a homepage concept drawn from the design brief; attached to the intro). **AI Proposal Generator** (`src/ai/proposal.js`: AI writes the text, code sets the prices; proposal PDF attached). Acceptance happens by a "YES" reply (`accept_proposal` intent, only in the proposal_sent stage), by Twenty `proposalDecision`, or by the admin button. **Twenty receiver** `POST /webhooks/twenty` (`src/twenty.js`, field map in `settings.twenty`, idempotent against Twenty echoes via `crm_call_key`/`crm_proposal_key`). **n8n workflows** `n8n/1-*.json` (forward) and `n8n/2-*.json` (PATCH Twenty).
- v3 tests: PDFs rendered and visually checked; the full Twenty-event flow was simulated (create → pitch → intro with PDF → NO_ANSWER echo ignored → INTERESTED → proposal PDF → "Yes go ahead" → won; Twenty ACCEPTED path); the AI proposal path was tested against the API mock; the n8n Code node logic was tested with stubs; the template migration was tested on a copy of the real DB (an earlier version crashed on startup with the real DB: fixed). **Not tested against a real Twenty or n8n instance.** Twenty's REST paths and custom-field API names are unconfirmed (its docs defer to the in-app playground).
- v1 (morning): CRM, full lead→delivery pipeline, client pages, mock channels. Tested end to end.
- v2 (afternoon): leads from the CRM API are routed by `interested`: **Conversion** (pitch maker: Claude web research → pitch → homepage design → brochure → approval → AI-planned call/message follow-ups) and two marketing pipes, **Nurture** (unknown) and **Re-engage** (no). The AI "manager" writes messages, classifies replies and drafts answers, plans the next action, and writes a daily briefing. Signed CRM outbox webhooks (`CRM_WEBHOOK_URL`); CRM PATCH by `external_id` re-routes on interest change.
- v2 tests: rule-based mode end to end; AI path end to end against a **local mock** of the Messages API (request shapes, pause_turn, structured outputs, fallbacks, sanitising, cost log, AI-down fallback); CRM sync against a local receiver; UI in headless Edge, no console errors.
- **Never run against the real Claude API**: no key on this machine. First real run may surface API-side issues (e.g. tool/format combos). Watch Runs & log → AI calls.
- UI simplified (2026-10-31, owner asked "make the ui simple"): 5 menu items (Today, Leads, Customers, Messages, Settings), the rest under "More tools"; plain-language statuses (`SIMPLE` map in `public/app.js`), one main action per lead + "More" menu, basic vs advanced settings. Keep new UI work in this plain style.
- Conversion focus (2026-10-31, owner: "leads adding, editing, calling happen from the CRM; the CRM is managed by the telecaller; here focus on conversion"). Removed add/edit/import/delete-lead and call-logging UI. Call requests go to the CRM; telecaller results come back through the new CRM call endpoint (tested with a local receiver: request out, result in, lead moves to Replied). Today screen: Approve pitches · Replies to send · Close these deals · Calls with the telecaller (read-only) · Coming up. "Leads" renamed to "Pipeline". A call "interested" only triggers an automatic booking message if the lead has opted in or messaged us first.
- Visual design (2026-10-31, owner: "use claude design system for our app"): admin and client pages restyled after the Claude app. Anthropic palette (`#141413` / `#faf9f5` / `#e8e6dc`, coral accent `#d97757`, with `#c6613f` for button fills), Lora serif for headings, system sans for UI text, a flat sidebar with line-icon SVGs and a pill for the active item, rounded soft controls, and dark/light following the OS. Tokens live in `:root` in `public/styles.css` and in `src/web/layout.js`. WebStream's own logo and name are kept (no Claude/Anthropic marks). Checked in headless Edge in dark and light mode, no console errors. PDFs were not restyled.
- Running locally for the owner on **port 3100** (port 3000 is taken by another Node app).

## Next tasks
**Website & SEO brochure (2026-11-13, first):** (1) done: CRM d5289f7 is live ("Website + SEO" in the Interested popup); (2) owner enters the three package prices in Tool settings → "Website & SEO brochure prices" (0 shows "On request"); (3) first real "Website + SEO" lead: check the Claude answer (tailored texts fit, recommended package, fact check) and the classic editor copy; (4) tell the co-worker about the CRM commit.
**Brochures (2026-11-10, first):** the Signature designs and the website package popup are live. Next: (1) mark one real lead Interested with a package in the CRM and open the Claude brochure it produces (first real run of the new look, the gaps slide and the editor on a Signature document); (2) owner picks which looks to keep and whether leads without a package should also move to a Signature look; (3) add Pexels / Unsplash keys so real photos appear (the decks are text-only until then); (4) the rest of the quality plan: Claude's visual check after layout, the 8-lead golden set, the proof bank, rejection reasons from the CRM; (5) tell the co-worker about CRM commits adcb0629 and 26db527a; (6) test with a manager / BDE login (popup works, deal update may be refused by RLS, the package still reaches AxiCore).
**Team CRM (2026-11-04, first):** CRM leads drive AxiFlow; writes allowed only to `brochures`, `companies.pitch_point`, one call-script note per lead (`contact_notes`/`deal_notes`) brochure PDFs in the `brochure` bucket (uuid folder per lead), proposal rows in `proposal` and their PDFs in the `proposal` bucket; everything else read-only (memory `crm-read-only`). Next: (000) owner: delete lead 10's stale "Codeace" docs #18/#19 (or allow it); (00) owner asked to remove the shadow and border of `.mzf-byline`: the class is not in this repo or anything under D:projects; ask where it is (claude.ai doc? other site?); (0) owner runs `crm/axiflow-webhooks.sql` (filled copy with the secret made locally) in the CRM Supabase SQL Editor, then checks `net._http_response` for 200s (7 tables incl. call_logs, call_assignments); (0b) first real CRM approve or reject of a brochure/proposal and first call_logs row: check the AxiFlow reaction on the live site; (1) owner confirms `hello@codeace.com` / `https://codeace.com` (guessed) and a new invoice prefix instead of `AWS`; (2) map the CRM deal stages actually in use (seen so far: `new`, `interested`, `won`; `new` has no entry yet) in Settings → Team CRM; (3) ask the co-worker what the other `brochures.status` values mean (only `approved` and `pending` are known); (4) every interested CRM lead lands in Today → Approve pitches: decide whether to auto-approve; (5) the free OpenRouter model writes weak pitch points (filters catch the bad ones), so adding credits for Claude would improve scripts; (6) Vercel Hobby cron is daily, so CRM reads happen while someone uses the app: set up a 15-minute pinger on `/api/cron/tick?key=CRON_SECRET` so new CRM leads are picked up even when nobody is in AxiFlow.
**Deploy (2026-11-02):** pushed; https://axiflow-v1.vercel.app now builds and answers `/health` but shows the setup message (no `DATABASE_URL`; login also needs `ADMIN_PASSWORD` + `SESSION_SECRET` on Vercel, defaults are refused when `VERCEL` is set). Vercel CLI on this machine is logged in as `deepunr-9593`; the folder is linked (`.vercel/`, project `axiflow-v1`). **Supabase:** pooler host is `aws-0-eu-west-1.pooler.supabase.com:6543` (user `postgres.urjgjuleerifdvuxcmoa`); local `.env` (git-ignored) holds `DATABASE_URL` plus generated `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_PASSWORD`, `INTAKE_API_KEY`, `WEBHOOK_SECRET`; the owner's data was copied into Supabase with the migration script (9 leads, plan, 3 docs, settings). Note `npm start` now uses Supabase (it loads `.env`). **Production = Vercel project `axiflow`** (https://axiflow-v1.vercel.app, account `deepunr-9593s-projects`, connected to GitHub so pushes to main deploy it; this folder is linked to it). Env vars + Blob store `axiflow-media` (public, dub1) are set there. A second project `axiflow-v1` (https://axiflow-v1-alpha.vercel.app, Blob store `axiflow-uploads`) was created by mistake during setup and also works; owner may delete it. Earlier note: env vars + Blob store `axiflow-uploads` (public, dub1) set on axiflow-v1; functions pinned to `dub1` next to Supabase eu-west-1; login, Today data, PDF, Blob upload and cron tick all checked). That project is NOT connected to GitHub (pushes don't deploy it; use `vercel redeploy` / `vercel --prod` or connect Git). Writing the env vars to Vercel from the CLI was blocked by the permission system: the owner adds them in the Vercel dashboard (or allows it), creates a Blob store, then redeploys. Earlier plan: owner sends the Supabase Transaction pooler URL (password reset first) → put it in `.env` as `DATABASE_URL`, run `npm run migrate:sqlite` to copy the data to Supabase, start locally against it once. In Vercel: create a Blob store (adds `BLOB_READ_WRITE_TOKEN`), set env vars `DATABASE_URL`, `CRON_SECRET`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `INTAKE_API_KEY`, `WEBHOOK_SECRET` (`ANTHROPIC_API_KEY` later), then push to GitHub (Vercel deploys from `main`), check `/health`, login, Today, a PDF, and `/api/cron/tick?key=…`. Set up a 15-minute external pinger for the sweep.
**Targets (2026-11-02):** owner creates and activates the real ₹12 Lakh plan (Targets → New plan → 24-day preset, pick the start date). Until the CRM sends call results back, the telecaller logs daily numbers with "Log numbers". Possible next steps: plan progress in the daily digest email, per-BDE targets once there is more than one caller, a weekly summary sent every Monday.
**UI (2026-11-02):** owner to review the app in their own design (rail + panel shell). Not yet ported from the design file: the search button in the panel, the Board/List toggle and category filter chips on Pipeline, the brochure list with thumbnails, and the Settings layout (packages table, message templates, connection cards, toggles); those screens use the new styles but keep their existing layout.
**Editor / templates (2026-11-02):** owner to try the editor, the AI assistant (needs ANTHROPIC_API_KEY) and a PDF import of their own Canva designs; fix the stray glyph on page 3 of the imported reference brochure; decide whether imported templates should keep Poppins or whether the original font files should be added to `assets/fonts`. Possible next steps: snapping guides between elements, multi-select, rich text (mixed bold within one box).
**Tools:** owner to review a real brochure and proposal (ideally with ANTHROPIC_API_KEY set), check the default copy in `settings.brochure` / `settings.proposal` (stats, "Backed by CodeAce", payment terms, module split), and supply generic cover photos. Next step after that: wire both tools into the CRM flow (an Atomic CRM deal stage triggers them).
**Then, owner decisions on the Atomic CRM plan:** (1) does the app send the brochure/proposal itself, or attach them for the telecaller to send (recommended to start)? (2) OK to archive the rest? Tasks 2, 2b and 5 below are Twenty/n8n-specific and get replaced if Atomic CRM is confirmed.
0. Owner adds ANTHROPIC_API_KEY; run 2-3 real interested leads, check AI calls log (errors, cost per lead), review pitch/design quality.
1. Owner review of the defaults: packages and prices (INR, 18% GST, 50% advance), agency name/portfolio placeholders, message templates, daily 9 AM IST run, send window and caps.
2. With the co-worker: create the Twenty custom fields and webhook, then import and configure the two n8n workflows (`n8n/README.md`). Verify in Twenty's API playground: the `/rest/companies/{id}` path, the field API names and the Select values; adjust `settings.twenty` and the workflow 2 CONFIG block. The telecaller sets `whatsappOptIn`/`emailOptIn` when the lead consents.
2b. Meta: the WhatsApp templates `ws_intro`, `ws_proposal` and `ws_proposal_reminder` need a DOCUMENT header (the PDF).
3. Go-live setup: HTTPS `BASE_URL`, real secrets, Gmail App Password or a transactional email provider (SPF/DKIM), Meta WhatsApp templates `ws_*` (3 body vars), webhooks.
4. Replace the demo checkout with Razorpay/Stripe, and add gateway signature verification to `/webhooks/payment`.
5. Inbound email: wire Gmail (n8n/Apps Script) to `POST /webhooks/email`.
6. Production hardening: DB backups; Postgres and a job queue if multi-instance; multi-user logins (currently a single admin password).
7. Get owner feedback on the conversion-only UI (Today / Pipeline / Customers / Messages / Settings) and trim any screen that still feels busy.

## Conventions & gotchas
- UI style: **the owner's design, latest version `Downloads/new-design/AxiFlow Admin.dc.html` (2026-11-02; supersedes `Downloads/AxiFlow Admin UI Design`; render it in Edge to compare).** Last block in `public/styles.css` ("Design v2") wins: page and flat sidebar #0A0A0B; the content sits on a #111113 sheet with a 16px dot grid, rounded top-left corner and hairline top/left edges (`.stage-card`); cards #161618 with `0 1px 0 rgba(255,255,255,.03) inset, 0 6px 18px rgba(0,0,0,.3)`; grouped rows #151517; active rail/panel item = #26262A pill; every button is a pill (primary white with an inner bevel, secondary #1A1A1D with a .11 border, Geist 13px); inputs #101012 with a light inset shadow; board columns inset #121214 with #1A1A1D cards. **Icons are always real vector icons** (owner, 2026-11-02: text arrows looked low quality): use Material Symbols `<span class="mi">name</span>` (`.mi.in` inline in text, `.btn.icon-only` for icon buttons), never text glyphs like ← → ↑ ↓ ✕ ✓ ↻ ↶ ▾ ↗ or emoji in the admin; client pages (`src/web/public.js`) have no icon font, so they use small inline SVGs. A scan script lived in the session scratchpad; re-check with a search for those characters before shipping UI changes. **Top bar** (`.tbar` in index.html, owner asked for an IDE-style title bar "with all possible options"): left "AxiFlow › page" (`#crumbTitle`, set in `route()`), centre search (`openPalette()`, Ctrl/Cmd K: leads via `/api/leads?q=`, pages, actions; arrows + Enter), right: hide/show menu (`#panelBtn`), run automation (`#runBtnTop`), light/dark (`#themeBtn`), bell with what needs you (`fillBell()`, count = approvals+drafts+hot), settings, account menu (Settings, Targets, Automation log, Reports, theme, search, log out) and a white **New** menu (brochure, proposal, revenue plan, import template). Pop-ups close on outside click/Esc. **Light mode**: `html[data-theme="light"]` block at the end of styles.css (black accent on white, same layout); set before paint by an inline script in `<head>` from `localStorage axf-theme`; default dark. The sidebar is flush with the top, left and bottom edges (owner, 2026-11-02): no outer padding, the icon rail is square with only a right hairline. Icons: home, track_changes (Targets), view_kanban, group, chat, menu_book, request_quote, grid_view, settings. The earlier neumorphic block above it (paired shadows on #151517) is the first version of the design and is mostly overridden. White is the only accent (primary buttons white/black, logo tile #E7E7EA "A"); pills #26262A, counts #2E2E31; Geist headings (page title 30px, section 17px), Inter text, **Material Symbols Rounded weight 300** icons (`<span class="mi">name</span>`; the old `.ms` class is the milestone row, not icons). Shell (`public/index.html`): icon rail (64px) + collapsible panel (Sales: Today with sub-items Approve pitches / Replies to send / Close deals that jump to Today sections via `data-scroll`, Targets, Pipeline, Customers, Messages; Create: Brochures +, Proposals +, Templates; account card) + one raised content card (`.stage-card`). The panel hides automatically in the editor (`.shell.editing`) and its state is remembered (`localStorage axf-panel-off`). Runs of `.item` rows are wrapped into one raised `.group` list by `groupItems()` in app.js after each render; Today rows show initials (`.ini`). The theme is one block at the end of `public/styles.css` (older theme layers were removed; the pre-change file is not kept in the repo). More tools and Run automation live on Settings. No emoji in buttons or headings, never Anthropic/Claude logos or names. Client-facing documents and pages carry the **Codeace** agency brand (renamed from Axilume 2026-11-04), not AxiFlow.
- Editor / PDF parity: change text rendering in BOTH `public/editor.js` and `src/design/render-pdf.js`; check a render of each after changes.
- Proposal prices always come from code (`buildProposalItems` in the pipeline, `defaultItems` + editable line items in the tool), never from the AI; the AI writes the words only.
- Brochure and proposal PDF layouts copy the owner's two reference PDFs; keep them matching (check page renders against the references after layout changes). Pages paginate manually (`margins.bottom = -1000`), so text must be fitted (auto-shrink) rather than allowed to overflow.
- PDFs use the built-in pdfkit fonts (Latin-1 only): all text goes through `t()` in `src/pdf/pdf.js`, and ₹ becomes "Rs.". Footer text must be drawn with the bottom margin set to 0, or pdfkit adds blank pages.
- Startup migrations run against the owner's real `data/crm.db`; test any migration on a copy of it, not only on a fresh database.
- When patching files through shell heredocs, backslashes in regexes get mangled. Use a script file or the Edit tool.
- Routing is by `interested` only (yes → conversion/pitch maker; unknown → nurture; no → reengage). Score is for priority only.
- **No rule-based or default content, ever (owner, 2026-11-13):** SWOTs, brochures and proposals are written only by the AI from web research (always on). If the AI cannot write one, the document fails with a plain reason and a Try again button in the CRM; nothing is filled in with standard text and nothing goes to the CRM. The old pitch maker (`ai/pitchmaker.js`), built-in brochure (`pipeline/brochure.js`, `pdf/pdf.js`), built-in proposal (`ai/proposal.js`), rule-based SWOT (`templateScript`) and the HTML templates' general copy (`fallbackData`) were deleted. Still rule-based (not documents, and nothing is sent while channels are mock): the message manager's fallbacks in `src/ai/manager.js` (reply classification, next action, outreach wording).
- The "no Claude/Anthropic marks" UI rule has one owner-requested exception: the orange Claude mode button in the sidebar.
- AI output that triggers actions is schema-constrained and validated in code (`planNextAction` checks permissions). Lead replies/web content go inside <untrusted> tags.
- AI designs are sanitized and served from `/d/:token` with a sandbox CSP, never inline in the admin origin.
- WhatsApp: AI-written text is only sent inside the 24h session or via the touch templates (`ws_nurture`/`ws_reengage`/`ws_custom`, params: first name + text); cold conversion messages use the approved templates.
- Lead state lives only in `leads.stage`. Every automatic step is a `case` in `step()` in `engine.js`, and every change goes through `setStage()`, which logs both an activity and an event.
- All outbound messages go through `sendToLead()` in `messenger.js`. Cold outreach (`cold: true`) requires opt-in plus the send window plus the daily cap; transactional messages don't.
- Without credentials, or with `automation.dry_run` on, messages are stored with status `mock`. That's expected, not a failure.
- The website audit fetches user-supplied URLs, so keep the SSRF guard in `enrich.js`.
- The machine's `.bashrc` has a BOM, so every Bash call prints a harmless `$'\377\376export'` error.
