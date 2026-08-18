# Inventory Backend

Express + MongoDB API for WizKlub Inventory (MVC architecture).

## Folder structure

```
inventory-backend/
├── server.js              # Entry point — starts HTTP server
├── package.json
├── uploads/               # Uploaded files (images, Excel)
├── scripts/
│   └── seed.js            # Database seed script
└── src/
    ├── app.js             # Express app setup (middleware, routes)
    ├── config/
    │   ├── env.js         # Environment variable loading
    │   └── database.js    # MongoDB connection
    ├── routes/            # Route definitions (maps URLs → controllers)
    │   ├── index.js       # Central API router
    │   ├── authRoutes.js
    │   ├── adminRoutes.js
    │   ├── schoolRoutes.js
    │   ├── dispatchRoutes.js
    │   └── rmRoutes.js
    ├── controllers/       # Request handlers (business logic orchestration)
    ├── models/            # Mongoose schemas (data layer)
    ├── services/          # Reusable business logic (email, audit, cache)
    ├── middleware/        # Auth, roles, uploads, error handling
    ├── utils/             # Helpers (componentId, passwords, etc.)
    └── jobs/              # Background workers & queues
```

## MVC flow

```
HTTP Request
    → routes/        (which endpoint?)
    → middleware/    (auth, validation)
    → controllers/   (handle request, call services/models)
    → models/        (database)
    → services/      (email, notifications, audit logic)
    → JSON Response
```

## Setup

```bash
cd backend
npm install
# Configure env at project root: cp ../.env.example ../.env
npm run dev            # development with nodemon
npm start              # production
npm run seed           # seed sample data
```

API runs at **http://localhost:5000/api**

## WizKlub school import

Admin endpoints (WizKlub session token required via `X-WizKlub-Access-Token`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/wizklub/schools` | Full catalog with region enrichment and readiness flags |
| GET | `/admin/wizklub/regions` | Region → division mappings |
| POST | `/admin/wizklub/regions/sync` | Create divisions for unmapped WizKlub regions |
| POST | `/admin/wizklub/schools/register-with-region` | Bulk register schools that have region + mapped division + AM + email |

**Prerequisites before bulk registration**

1. **Sync regions** — run region sync (admin UI or `node inventory-backend/scripts/syncWizklubRegions.js --apply`) so each WizKlub region maps to an inventory division.
2. **Account Managers** — each target division must have an AM assigned (existing rule for school creation).
3. **Contact email** — each school needs an email from WizKlub or set `WIZKLUB_SCHOOL_FALLBACK_EMAIL` in the root `.env` for schools without one.
4. **Schools without region (~2,360)** — use the admin **Not mapped** queue: pick a division manually and register one-by-one.

**Spreadsheet gap workflow (192 operational schools)**

Schools in your spreadsheet but missing or incomplete in WizKlub API:

```bash
node inventory-backend/scripts/verifySpreadsheetSchools.js
```

Outputs at project root:

| File | Purpose |
|------|---------|
| `spreadsheet-wizklub-verification.json` | Full match report |
| `wizklub-fix-list.csv` | Rows to send WizKlub (`missing_from_api`, `missing_region`) |
| `wizklub-gap-email-draft.txt` | Email template with counts |

After WizKlub fixes master data:

```bash
node inventory-backend/scripts/reverifyWizklubAfterFix.js
node inventory-backend/scripts/checkReadyForBulkRegister.js   # exit 0 when all 192 mapped
```

Then in admin: **Schools → Mapped → Register all** (AM and portal email can be added later).

CLI helpers:

```bash
node inventory-backend/scripts/exportWizklubSchoolsByRegion.js   # JSON exports + unique regions
node inventory-backend/scripts/verifySpreadsheetSchools.js       # spreadsheet vs catalog + fix CSV
node inventory-backend/scripts/reverifyWizklubAfterFix.js         # re-export + re-verify after WizKlub update
node inventory-backend/scripts/checkReadyForBulkRegister.js      # gate before Register all
node inventory-backend/scripts/syncWizklubRegions.js             # dry-run division sync
node inventory-backend/scripts/syncWizklubRegions.js --apply     # create missing divisions
```

## From project root

```bash
npm start              # starts backend
npm run dev:backend    # backend with nodemon
npm run dev:frontend   # frontend Vite dev server
npm run seed           # seed database
```
