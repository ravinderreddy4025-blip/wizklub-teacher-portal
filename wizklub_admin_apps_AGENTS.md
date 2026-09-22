# AGENTS.md — WizKlub Admin Apps (read this first)

Handover for an AI agent or a new developer picking up branch **`feature/il-ui-revamp`**.
It explains what the apps are, how to run and test them, everything that changed in this work,
how each new feature works (API, data, rules), and the traps already found.

Related documents:
- `README.md`: short human overview.
- `guides/DEPLOYMENT.md`: build and ship.
- `guides/HEALTH_REPORTS_RUNBOOK.md`: refreshing report data.
- `design-system/AGENTS.md`: **UI rules; read it before touching any screen.**
- `CHANGES_FOR_AGENT.md`: the change log with the full file list.

---

## 0. TL;DR for agents

1. **UI work.** Follow `design-system/AGENTS.md` and use the tokens in `frontend/wizklub-testimonials/src/styles/tokens.css`.
   - Navy ink `#02344F`; text on orange is always navy.
   - One tangerine Primary button per view; everything tappable is a pill of at least 44px.
   - Cards use a shadow, not a border.
   - Poppins 400/500/600.
2. **Never put real student or teacher data** into commits, screenshots, Figma, logs or tests.
   - Use the demo mode (`VITE_USE_MOCK=true`) or the `wizklub_health_dev` fixture.
   - `backend/health-snapshot/raw|out` hold real names. They are git- and docker-ignored; keep it that way.
3. **Run locally:** `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`, then open http://localhost:8090.
4. **Test before handing back.**
   - PMO: `cd backend/parent-orientation && npm test` (63 tests, all must pass).
   - Teachers Portal: `npx vite build` + `npx eslint` on the files you changed.
   - Check the screen in a browser at 1440 and 390 wide.
5. **Nothing is committed or deployed yet.** Base commit `a6bb395`. The remote is AWS CodeCommit `wizklub_web_apps`.
   UAT branches follow the pattern `admin-apps-UAT-*`. Do not push or deploy without explicit human approval.

---

## 1. The apps

| App | Users | Frontend | Backend | Local URL (via gateway :8090) |
|---|---|---|---|---|
| **Gateway** | everyone | `frontend/gateway` (static) | — | `/` |
| **Teachers Portal** (a.k.a. testimonials) | school teachers | `frontend/wizklub-testimonials` (React 19 + Vite, plain CSS) | `backend/wizklub-testimonials` (Express, :3001) | `/wizklub-testimonials/` |
| **Parent Orientation Tracker (PMO)** | PMO, Speaker, Sales Admin, Super Admin | `frontend/parent-orientation/public` (vanilla JS `app.js` + `index.html` CSS) | `backend/parent-orientation` (Express, :8080 → host 18080) | `/pmo/` |
| **Kit Inventory** + **School Portal** | Admin, Account Manager, Dispatch, School | `frontend/inventory` (React + Vite + Tailwind); school portal in `school-portal/frontend` (aliased `@school-portal`) | `backend/inventory` (Express, :5002) | `/inventory/` |
| **Health snapshot job** | — (offline) | — | `backend/health-snapshot` (Python) | writes Mongo `wizklub_health` |

Deployment shape (`docker-compose.yml`, project name **`wizklub-2c`**):
- One `backend` container runs all three Node backends (`backend/start-backends.sh`).
- One nginx `frontend` container serves all UIs and proxies `/api`. Routing lives in `nginx-combined.conf`.
- MongoDB is external in production (`MONGO_URI`). Locally, `docker-compose.local.yml` adds `mongo:7` on host port 27018 and bind-mounts the PMO `public/` folder live.

Mongo databases:
- `parent_orientation` (PMO, including `health_followups`)
- `wizklub_testimonials`
- `wizklub-inventory`
- `wizklub_health` (snapshot, read-only for the apps)
- `wizklub_health_dev` (fake fixture)

---

## 2. Run, log in, test

```bash
cp .env.example .env            # fill secrets; SUPERADMIN_PASS, COOKIE_SECRET, JWT_SECRET, MONGO_URI …
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
open http://localhost:8090
```

- **Teachers Portal UI without a backend:**
  `cd frontend/wizklub-testimonials && VITE_USE_MOCK=true npx vite --host 127.0.0.1 --port 5195`.
  Log in as `demo.teacher` / `demo`. All data is sample data, including health, Live Class and assessments.
- **Local logins** (local Mongo only; real WizKlub accounts are checked against prod `api.wizklub.com`):

  | Portal | Login |
  |---|---|
  | PMO, Super Admin | `admin` / value of `SUPERADMIN_PASS` |
  | PMO, PMO role | `pmo.local` / `Local@123` |
  | PMO, Speaker | `speaker.local` / `Local@123` |
  | PMO, Sales Admin | `salesadmin.local` / `Local@123` |
  | Inventory, Dispatch | `dispatch.local@wizklub.local` / `Local@123` |
  | Inventory, Account Manager | `am.local@wizklub.local` / `Local@123` (has no division, so the screens are empty) |
  | Inventory, School Portal | `school.local@wizklub.local` (local test user, school "Sri Chaitanya-Shamli") |
  | Teachers Portal, Inventory Admin | real WizKlub accounts |

- **Tests and checks:**
  - PMO: `npm test` in `backend/parent-orientation`. There are 63 checks, including `test/healthNotifier.test.js`.
  - Teachers Portal and Inventory: `npx vite build`, then `npx eslint <files>`. Inventory has 22 lint errors that were there before this work; don't add more.
  - Health job: `python3 backend/health-snapshot/validate.py` after a build.

---

## 3. What changed in this work (by area)

Totals: 199 files (130 modified, 69 added), +24,897 / −5,657 lines. Every file is listed in `CHANGES_FOR_AGENT.md`.

### 3.1 IL UI revamp (all apps)
- **Look:** a Headspace-style flat orange chrome (`--wk-band #F47D31`, with a lighter dome `--wk-dome #F28C43`) and navy text.
  Desktop has a transparent 256px sidebar with a floating white panel. Mobile has a white page, a 56px top bar and a bottom nav.
- **Teachers Portal:**
  - Styles: `styles/tokens.css`, `styles/app.css`, `pages/pages.css`
  - Shell: `components/layout/*`
  - Login, and every page
- **PMO:** `public/index.html` (CSS) and `public/app.js`. This covers the shell, the portal chooser and every role's screens.
- **Inventory:** all pages and `components/ui/*`, plus `tailwind.config.js`. The **School Portal** got the same treatment.
- **Gateway:** the landing page.

### 3.2 Design system (new): `design-system/`
- Figma library "WizKlub Design System" (`ALYUYxBSYECsXW1jI0TPOC`), mirrored in the repo:
  - `AGENTS.md` (rules)
  - `components.md` (specs)
  - `tokens/tokens.json` (W3C DTCG), `tokens/tokens.css`, `tokens/tailwind.preset.js`
  - `figma.json` (node IDs and property keys)
  - `llms.txt`
- Token files are generated by `design-system/scripts/build_tokens.py`.
- A Claude Code skill copy lives at `~/.claude/skills/wizklub-ui/` on the author's machine.

### 3.3 Health reports (new): student → batch → school RAG
- **Job:** `backend/health-snapshot/` (Python)
  - `fetch.py` runs SELECT-only SQL against the growth-poc replica through Metabase, writing `raw/*.json`.
  - `build_snapshot.py` applies the bands and rollups, writing `out/<run>/`.
  - `validate.py` checks the result, and `load.sh` loads it into Mongo `wizklub_health`.
  - The full metric spec is in `backend/health-snapshot/README.md`. §6 below summarises the rules.
- **PMO School health** (PMO and Super Admin roles):
  - Backend: `services/healthService.js`, `routes/healthRoutes.js`
  - UI: the `[School health]` block in `public/app.js`
  - Routes: `#/pmo/health` and `#/superadmin/health`; `school-health` also works as an alias
  - Screens: summary tiles and filters → school report → students by band → batch roster → student report, plus follow-ups
- **Teachers Portal health:**
  - Backend: `services/health.js`, `routes/health.js`, mounted at `/api/teacher`
  - UI: `pages/BatchHealth.jsx`, `pages/StudentHealth.jsx`, `components/health/*` (including the dashboard card "Students needing attention"), `lib/health.js`

### 3.4 Follow-up emails (new in this delivery)
School health follow-ups (Delegation, Action item, Remark) now send real email over SMTP. Details are in §5.

### 3.5 Assessment Conduct redesign (new in this delivery)
- **Files:** `pages/AssessmentConduct.jsx`, `components/assessment-conduct/*`, and the new stylesheet `pages/assessment-conduct.css`.
  The old `.conduct-*` rules were removed from `pages/pages.css`.
- **Logic:** unchanged. `hooks/useAssessmentConduct.js`, scanning and submit were not touched.
- **New UI:**
  - Page header with a Status tag
  - Progress strip: question N of M, a bar, and captured / waiting / SR-missing counts
  - Question card with A–D tiles (2 columns from 768px)
  - Student list with search and **filter chips** (All / Waiting / Captured / SR missing)
  - Rows with a soft avatar, an SR tag and a green answer badge
  - Sticky action bar with **one Primary** button: *Scan SR codes*, which becomes *Submit assessment* on the last question
  - Mobile: raised round Prev/Next buttons and icon discs
  - Desktop (1024px and up): question and students side by side, with the question sticky
- The scanner modal keeps its markup, with styles moved and colours switched to tokens.

### 3.6 Live Class / "Start class" (front end only)
- **Files:** `pages/LiveClass.jsx`, `pages/live-class.css`, `api/mockLiveClass.js`.
- **Backend: not built.** The intended contract is in the header of `mockLiveClass.js`: `POST|GET /api/teacher/batches/:batchId/class`, `PATCH …/class/students/:id`, `POST …/reset-pin`, `POST …/class/end`.
- The screen works only in mock mode.

### 3.7 Other
- `.dockerignore` excludes `health-snapshot/raw|out` and `__pycache__`.
- `CHANGES_FOR_AGENT.md` is the change log.
- `docker-compose.local.yml` is the local override.
- `.env.example` now documents the new email and health settings.

---

## 4. Health API contracts

### PMO: `backend/parent-orientation/src/routes/healthRoutes.js`
Auth: session cookie with role `pmo` or `superadmin` (`requirePmoOrSuperAdmin`). Every read returns `{ run: null }` (HTTP 200) when no snapshot is loaded.

| Method + path | Returns |
|---|---|
| `GET /api/health/summary` | `{ run, schools:{G,A,R,N}, total_schools, students, regions[] }` |
| `GET /api/health/schools?region=&q=&min_students=&band=&sort=students\|red\|name` | `{ run, schools[] }` |
| `GET /api/health/schools/:schoolId` | `{ run, school, batches[], attention[], attention_total }` |
| `GET /api/health/schools/:schoolId/students?pillar=&band=` | students behind a clicked count |
| `GET /api/health/batches/:batchId` | `{ run, batch, students[] }` |
| `GET /api/health/students/:batchId/:username` | `{ run, batch, student, detail }` |
| `GET /api/health/schools/:schoolId/followups` | `{ followups[], triggers[], renag_days, email_enabled }` |
| `POST /api/health/schools/:schoolId/followups` | create: body `{ type, trigger, note, assignee?{username,name,email}, due_at? }` → 201 `{ followup }` |
| `PATCH /api/health/followups/:id` | `{ status: open\|done }`, `{ note }` and/or `{ email }` |
| `POST /api/health/followups/:id/notify` | **new:** re-send the email → `{ followup, result:{status,error} }` |

### Teachers Portal: `backend/wizklub-testimonials/src/routes/health.js`
Teacher session required (401 otherwise). Data is scoped to the teacher's batches.
- `GET /api/teacher/batches/:batchId/health`
- `GET /api/teacher/batches/:batchId/students/:username/health`
- `GET /api/teacher/health/attention`

---

## 5. Follow-up emails: how they work

| Follow-up | Email |
|---|---|
| **Delegation** | emails the teacher when it is created |
| **Action item** (with an owner) | emails when created, then a **reminder every 3 days** (`RENAG_DAYS`) while open; the subject says "Overdue" after `due_at`; marking it done stops reminders |
| **Remark** | never emailed |

- **Code:**
  - `src/config/mail.js` (settings)
  - `src/services/mailer.js` (nodemailer SMTP, lazy pooled transport; tests inject `__setMailerTransport`)
  - `src/services/healthNotifier.js`: compose (branded HTML + text, all user input escaped), deliver (records the outcome), reminder sweep and scheduler
  - `healthService.createFollowup` calls deliver; it never throws into the request
  - `server.js` starts the scheduler after Mongo connects
- **Recipient:**
  - The recipient is `assignee.email`, validated. The PMO form has a **Teacher email** field.
  - The health snapshot does **not** include teacher emails yet, so the field is typed by hand, or pre-filled if a future snapshot adds `teachers[].email`.
- **Outcome stored on the follow-up:**
  - `notify.status`: `sent` · `failed` · `no_email` · `not_configured` · `queued`
  - Plus `attempts`, `last_attempt_at`, `last_error`, `sent_at`, `message_id`, `history[]` (last 20)
  - `last_nudged_at` moves forward on each sent reminder
- **PMO UI** (`app.js`, functions `hrFuEmailLabel`, `hrFuMailActions`, `hrReplaceFollowup`):
  - A plain-language status on each follow-up
  - **Send email** for failed or unsent items, and **Add email & send** when the address is missing
- **Off by default.** Sending needs `HEALTH_EMAIL_ENABLED=1` **and** `SMTP_HOST` **and** `HEALTH_EMAIL_FROM`; otherwise the status is `not_configured` and nothing is sent.
  All the settings are in `.env.example` and `guides/DEPLOYMENT.md` §4.
- **How it was verified locally (21 Sep 2026):** a fake SMTP server on the host, with the backend at `SMTP_HOST=host.docker.internal:2525`.
  - Delegation sent. Missing email → fixed → resent.
  - Action item sent, then an automatic reminder fired after backdating 4 days.
  - An invalid email was rejected.
  - The UI path "Add email & send" delivered the mail.

---

## 6. Health rules (summary; full spec in `backend/health-snapshot/README.md`)

- **Pillars:**
  - **Delivery** (batch): sessions held ÷ scheduled. Green ≥ 90, Amber ≥ 70.
  - **Participation** (student): workouts submitted ÷ due. Green ≥ 60, Amber ≥ 40. `not_started` = 0 submitted with 2 or more due.
  - **Outcomes** (student): 0.5 × assessment % + 0.5 × code-run %. Green ≥ 60, Amber ≥ 40.
- **Overall band:** R if delivery is R or 2+ pillars are R · G if all are G · N if all are N · A otherwise.
- **Batch and school bands** use `(3G + A) / 3(G+A+R)` over **student counts, never averages**.
- **Latest real run:** `hs-20260919T185849`, data as of 18 Sep 2026. 203 schools · 43,826 students · workout completion 47% (the business figure is about 48%).
- **Dev fixture:** `wizklub_health_dev`, with fake names. To regenerate it:
  `MONGODB_URI=… HEALTH_MONGO_DB_NAME=wizklub_health_dev node backend/parent-orientation/scripts/seedHealthFixture.js`.
  The script refuses any database name that doesn't end in `_dev`.

---

## 7. Traps (already hit, don't repeat)

- **CRLF.** The original zip came from Windows. A sudden ~490-file diff means line endings, not real changes.
- **PMO caching.** After editing `app.js`, bump `app.js?v=` in `public/index.html`. The current value is `v=20260922a`.
- **PMO login is per tab.** It lives in `sessionStorage`, so automated browsers must log in per page. After login the app redirects to Analytics; set `location.hash` after the redirect.
- **Teachers Portal React.** Never define components in `main.jsx`: it causes a double `createRoot` and a blank page on HMR.
- **Teacher logins in Docker** hit **prod** `api.wizklub.com`. Don't test destructive actions with real accounts.
- **Docker Desktop** dies when the Mac's disk fills up (`Docker.raw` grew to about 66 GB). Run `docker builder prune -af` now and then.
- **Inventory local sessions:**
  - The Admin user needs `loginType:"wizklub"` in `sessionStorage.userInfo` (`"local"` loops).
  - AM screens need `amSelectedDivisionId` for a division the AM owns.
  - Sessions are per tab.
- **Mongo:** don't `$set` a sub-field of a field that can be `null` (e.g. `notify.x` on a Remark). Check `notify` first.
- **Figma** HTML-escapes `< > " '` in descriptions, so keep them plain. See `design-system/figma.json › gotchas`.

---

## 8. Known gaps / next steps

1. Live Class backend: the contract is in `api/mockLiveClass.js`.
2. Add `teachers[].email` to the health snapshot (from `wizklub_users_fdw.email`), so follow-up emails pre-fill.
3. The health job has no schedule. It runs by hand per `guides/HEALTH_REPORTS_RUNBOOK.md`.
4. Principal feedback counts differ from the meeting. Many B2B schools show as "Unknown Region".
5. Pre-existing issues:
   - Inventory lint (22 errors)
   - Join-page error screens are server-rendered in the old look
   - PMO role and school receipt/audit flows were only code-reviewed
6. On a real phone, check the SR-code scanner camera. The in-app browser blocks the camera, so only the layout was checked.

## 9. Definition of done for any change here

- [ ] Uses only design-system tokens and components. Checked at 1440 and 390 wide; focus ring visible.
- [ ] `npm test` (PMO) passes, and `vite build` plus eslint are clean for the touched Teachers Portal/Inventory files.
- [ ] No real personal data in code, fixtures, logs or screenshots.
- [ ] `.env.example` and the docs are updated for any new setting. `app.js?v=` is bumped if PMO changed.
- [ ] No push or deploy without human approval.
