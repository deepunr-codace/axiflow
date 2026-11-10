# web-stream-automation (app: **AxiFlow**; agency: **Codeace**, formerly Axilume)

**Repo:** https://github.com/deepunr-codace/axiflow (branch `main`, first push 2026-11-02). `.gitignore` keeps out `node_modules/`, `data/` (the real lead database and uploads) and `.env*` (except `.env.example`); never commit those.

## Purpose & stack
A working model of a fully automated sales and delivery pipeline for a web-development service: a mini CRM plus an automation engine. It covers lead intake → website audit → score → personalised brochure → human approval → WhatsApp/email outreach and follow-ups → reply handling → booking → proposal → advance invoice → onboarding brief → project milestones → final invoice → review request.

It replaces the n8n flow shown in `reference/Web Development.png`. The README has a table of the flaws it fixes.

**Target architecture (owner, 2026-10-31):** Twenty CRM → n8n automation → Pitch Script Maker → Brochure Maker → AI Proposal Generator. The owner chose: **our app runs the automation** (n8n only moves data between Twenty and our app), and the brochure and proposal reach the client as **PDFs only**. Importable workflows and the Twenty field setup are in `n8n/` (see `n8n/README.md`).

The team's main CRM is **Twenty**, set up by a co-worker and run by the **telecaller**: adding and editing leads and all phone calls happen there. **This system's scope is conversion only**: pitch maker, outreach, follow-ups, replies, meetings, proposals, payments and delivery. Calls are requested from the CRM (`lead.call_requested` event with a script) and results come back via `POST /api/crm/leads/:external_id/call`. Do not add lead add/edit/call-logging UI here. The integration contract is in the README section "Integration with the team CRM".

Stack: Node ≥22.13, Express 5, **Postgres** (Supabase in production via `DATABASE_URL` and `pg`; embedded PGlite in `data/pg` when `DATABASE_URL` is empty), Vercel Blob for uploads (`data/uploads` locally), nodemailer, `@anthropic-ai/sdk` (Claude, `claude-opus-5-5`), and a vanilla-JS admin SPA in `public/`. There is no build step. Code map: see README. The old SQLite file `data/crm.db` is kept only as a backup/migration source.

## Status (2026-11-10, latest): AxiCore 2.0 inside the live team CRM (no replacement)
- **Owner:** "they dont want replacemnt … add our builded system to live without affecting existing datas", then "move our axiflow to crm app like in our combined system in vercel". Live CRM = https://atomic-crm-flame.vercel.app (repo `karuncodeace/atomic-crm`, co-worker's Vercel account, hash routing, no vercel.json before); engine = live AxiFlow.
- **Design:** the CRM proxies `/api`, `/axicore-app`, `/pdf`, `/d`, `/fonts`, `/fonts.css`, `/brand` to https://axiflow-v1.vercel.app (Vercel external rewrites). No CRM database, schema, role or migration change; AxiFlow keeps its own DB. Roles: `admin` opens the tools (no `axicore` role in the live CRM).
- **AxiFlow side (live, 4fdbf39):** `auth.js` `currentUser` / `crmUser` (CRM Supabase `/auth/v1/user` + `sales` role; apikey = `CRM_SUPABASE_PUBLISHABLE_KEY`, else the secret key), `AXICORE_ROLES` default `admin`, `OPEN_ROUTES` for other CRM users; password cookie unchanged. `/api/me` returns user + axicore; `GET /api/axicore/company/:id/docs`; `/axicore-app/` = index.html with `class="embedded"` (app.js sends the CRM token from `sb-*-auth-token`, "Back to the CRM" tile `.axc-crm`). vercel.json includeFiles `{assets,public}/**`. Checked live with the owner's CRM admin login: me = admin/axicore, tools API 200, no-login 401.
- **CRM side (NOT pushed):** commit 667c76fe on branch `feature/axicore-tools` in the scratchpad clone `live-crm`, patch `0001-Add-AxiCore-2.0-…patch` in the scratchpad. Ported from AWC: `src/components/atomic-crm/axicore/*` (default role admin, "SWOT" label), sidebar tile (`AxiCoreFooter`), `canAccess` resource axicore, company `CompanyDocuments`, `/axicore/*` route, flat `.axc-*` styles, `vercel.json` rewrites, PWA `navigateFallbackDenylist`. Typecheck, prettier and `vite build` pass. Pushing to the co-worker's repo was blocked by the permission check: the owner decides (push branch + PR for the co-worker, or allow the push).
- **Next:** push the branch / PR → Vercel preview → test the tile, tools page and Documents panel with a real login → merge to main (goes live on the CRM).

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
- Every AI step must have a rule-based fallback (see `withFallback` in `src/ai/manager.js`, fallbacks in `pitchmaker.js`). Never let an AI failure stall a lead. **Exception (owner, 2026-11-05): Claude mode** has no in-app fallback; it retries Claude, then shows an error to retry by hand.
- The "no Claude/Anthropic marks" UI rule has one owner-requested exception: the orange Claude mode button in the sidebar.
- AI output that triggers actions is schema-constrained and validated in code (`planNextAction` checks permissions). Lead replies/web content go inside <untrusted> tags.
- AI designs are sanitized and served from `/d/:token` with a sandbox CSP, never inline in the admin origin.
- WhatsApp: AI-written text is only sent inside the 24h session or via the touch templates (`ws_nurture`/`ws_reengage`/`ws_custom`, params: first name + text); cold conversion messages use the approved templates.
- Lead state lives only in `leads.stage`. Every automatic step is a `case` in `step()` in `engine.js`, and every change goes through `setStage()`, which logs both an activity and an event.
- All outbound messages go through `sendToLead()` in `messenger.js`. Cold outreach (`cold: true`) requires opt-in plus the send window plus the daily cap; transactional messages don't.
- Without credentials, or with `automation.dry_run` on, messages are stored with status `mock`. That's expected, not a failure.
- The website audit fetches user-supplied URLs, so keep the SSRF guard in `enrich.js`.
- The machine's `.bashrc` has a BOM, so every Bash call prints a harmless `$'\377\376export'` error.
