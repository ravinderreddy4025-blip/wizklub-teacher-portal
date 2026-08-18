# School Portal Module

Self-contained **school / instructor portal** extracted from Wizklub Inventory. Use it inside the monolith today, or copy this folder into another project tomorrow.

## Structure

```
school-portal/
├── README.md
├── frontend/                    # React UI (pages, components, routes)
│   └── src/
│       ├── pages/               # SchoolDashboard, SchoolLogin, InstructorSchoolPicker
│       ├── components/school/   # Dispatch hub, audit, receipt modals
│       └── routes/              # SchoolPortalRoutes (auth + app routes)
└── backend/                     # Express routers + controllers
    ├── index.js                 # Module entry — exports routers
    ├── core.js                  # Bridge to shared inventory backend (models/services)
    └── src/
        ├── controllers/         # schoolController, schoolAuthController
        ├── routes/              # /school/* API, /auth/login/school, instructor auth
        └── utils/               # instructorAuth (JWT session)
```

## Embedded in monolith (current setup)

**Frontend** — Vite aliases in `inventory-frontend/vite.config.js`:

- `@inventory` → `inventory-frontend/src`
- `@school-portal` → `school-portal/frontend/src`

`App.jsx` mounts:

```jsx
import { SchoolPortalAuthRoutes, SchoolPortalAppRoutes } from '@school-portal/routes/SchoolPortalRoutes';
```

**Backend** — `inventory-backend/src/routes/index.js` mounts `/api/school`. Implementation lives in `school-portal/backend/`; legacy `backend/` re-exports are deprecated.

Auth routes merge via `school-portal/backend/src/routes/schoolAuthRoutes.js` into `/api/auth`.

## Move to another project

### 1. Copy folders

| Copy | Purpose |
|------|---------|
| `school-portal/` | Portal UI + API module |
| `inventory-backend/src/models/` | User, School, Dispatch, AuditReport, … |
| `inventory-backend/src/services/` | audit, receipt, dispatch hub, inventory, wizklub API |
| `inventory-backend/src/middleware/` | auth, roles, uploads |
| `inventory-backend/src/utils/` | schoolCode, schoolName, auditMonth, … |

See `backend/core.js` for the full list of bridged modules — replace `core.js` with your own implementations when decoupling.

### 2. Backend integration

```js
const schoolPortal = require('./school-portal/backend');

app.use('/api/school', schoolPortal.schoolRoutes);
app.use('/api/auth', schoolPortal.schoolAuthRoutes); // or merge into existing auth router
```

Environment: `JWT_SECRET`, `MONGODB_URI`, optional `WIZKLUB_ADMIN_USERNAME` / `WIZKLUB_ADMIN_PASSWORD`.

### 3. Frontend integration

Copy `school-portal/frontend/src` and configure aliases:

```js
// vite.config.js
'@school-portal': path.resolve(__dirname, './school-portal/frontend/src'),
'@inventory': path.resolve(__dirname, './src'), // your shared UI/utils
```

Mount routes from `SchoolPortalRoutes.jsx` and provide `AuthContext` with `loginSchool`, `loginInstructor`, `completeInstructorSchoolSelection`.

### 4. API surface

**Auth**

- `POST /api/auth/login/school` — School ID + password
- `POST /api/auth/login/instructor` — WizKlub instructor login
- `GET /api/auth/instructor/schools` — List schools (header: `X-Instructor-Token`)
- `POST /api/auth/instructor/select-school` — Open school dashboard

**School (Bearer JWT, role `School`)**

- Dispatches: `/api/school/dispatch-hub`, `/api/school/dispatches`
- Warehouse: `/api/school/warehouse`
- Audits: `/api/school/audit/*`
- Receipts: `/api/school/dispatch/:id/confirm`, `/api/school/receipt/*`
- Replacements: `/api/school/replacements/history`

## Docker

Build context is the **repo root** so `inventory-backend/`, `inventory-frontend/`, and `school-portal/` are included (`docker-compose.yml`).

## Notes

- `DispatchCompareLines` lives in school-portal but is imported by admin shared components (`DispatchRedispatchCells`, `DispatchTrackingModal`) via `@school-portal`.
- Schools registered without email get a portal user auto-created when an instructor selects them (`ensureSchoolPortalUser`).
