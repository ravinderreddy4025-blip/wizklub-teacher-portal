'use strict';
/**
 * Technathon API — main entry when you run `node server.js` or `npm run dev`.
 *
 * Flow: load .env → create Express app → register middleware → connect Mongo (or memory for tests)
 * → init submission router with models/mocks → mount /api/* routes → listen on PORT.
 *
 * Doc: ../../docs/file-notes/server/server.js.md  |  Folder map: ./BACKEND.md
 */
require('dotenv').config(); // Populate process.env from .env before any other reads

const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const compression = require('compression');

// ── Middleware ─────────────────────────────────────────────
const { errorHandler }          = require('./middleware/errorHandler');

// ── Routes ────────────────────────────────────────────────
const adminRoutes       = require('./routes/admin');
const submissionsRouter = require('./routes/submissions');
const uploadRoutes      = require('./routes/upload');
const adminRosterService = require('./services/adminRosterService');

// ── App Init ──────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;
const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';
const isProd = !isDev && !isTest;

// Behind reverse proxies (nginx, ALB): enables correct client IP for rate limits / logs.
if (String(process.env.TRUST_PROXY || '').trim() === '1'
  || /^true$/i.test(String(process.env.TRUST_PROXY || '').trim())) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

// ── Validate Required Env Vars ─────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH'];
REQUIRED_ENV.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ Missing required env variable: ${key}`);
    process.exit(1);
  }
});

if (!isTest && !process.env.STUDENT_FORM_SECRET) {
  console.error('❌ Missing required env variable: STUDENT_FORM_SECRET (used to sign per-student form links)');
  process.exit(1);
}

/**
 * Fail fast in production on unsafe or incomplete configuration.
 * Local dev stays permissive so engineers can use localhost origins.
 */
function assertProductionEnv() {
  if (!isProd) return;

  const mongo = String(process.env.MONGO_URI || '').trim();
  if (!mongo || !/^mongodb(\+srv)?:\/\//i.test(mongo)) {
    console.error('❌ Production requires MONGO_URI as a mongodb:// or mongodb+srv:// connection string.');
    process.exit(1);
  }

  const allowed = String(process.env.ALLOWED_ORIGIN || '').trim();
  if (!allowed || allowed === '*') {
    console.error('❌ Production requires ALLOWED_ORIGIN to your real frontend origin(s). '
      + 'Comma-separate multiple values. Wildcard * is not allowed with credentials:true.');
    process.exit(1);
  }

  if (!String(process.env.PUBLIC_WEB_ORIGIN || '').trim()) {
    console.error('❌ Production requires PUBLIC_WEB_ORIGIN (public base URL of the student-facing app, used in generated links).');
    process.exit(1);
  }

  const jwt = String(process.env.JWT_SECRET || '');
  if (jwt.length < 32) {
    console.error('❌ Production requires JWT_SECRET to be at least 32 characters (use a cryptographically random value).');
    process.exit(1);
  }
  if (jwt.startsWith('test_')) {
    console.error('❌ Production JWT_SECRET must not use a test-style value.');
    process.exit(1);
  }
}

assertProductionEnv();

// ── S3 Storage Configured in upload route ──────────────────

// ── Core Middleware ────────────────────────────────────────
app.use(helmet({
  // Allow SPA on another port/origin to read JSON from this API (dev + split hosting)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());      // gzip responses
app.use(morgan(isDev ? 'dev' : 'combined')); // Request logging

function parseAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// CORS — in dev, reflect request Origin (cannot use '*' with credentials:true; fixes upload preflight)
const corsOptions = {
  origin: isDev
    ? (reqOrigin, cb) => cb(null, reqOrigin || true)
    : (origin, cb) => {
      const allowedList = parseAllowedOrigins();
      if (!origin) return cb(null, true);
      if (allowedList.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request ID for tracing
app.use((req, _res, next) => {
  req.requestId = `rid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

// ── MongoDB Setup ──────────────────────────────────────────
let mockSubmissions = [];
let mockRoster = [];
let useMongo = false;

const submissionSchema = new mongoose.Schema(
  {
    studentId:        { type: String, trim: true },
    username:         { type: String, trim: true },
    admissionNumber:  { type: String, trim: true },
    name:             { type: String, trim: true },
    grade:            { type: String },
    schoolName:       { type: String, trim: true },
    email:            { type: String, trim: true, lowercase: true },
    projectTitle:     { type: String, trim: true },
    idea:             { type: String },
    problemStatement: { type: String },
    solution:         { type: String },
    techUsed:         { type: String },
    impact:           { type: String },
    videoUrl:         { type: String },
    documentUrl:      { type: String },
    /** Set once when student clicks "Finalize & Submit" the first time; starts 2h edit window */
    firstSubmittedAt: { type: Date },
  },
  {
    timestamps: true, // adds createdAt + updatedAt automatically
    versionKey: false,
  }
);

// ── Indexes for fast queries ───────────────────────────────
submissionSchema.index({ createdAt: -1 });
submissionSchema.index({ grade: 1, createdAt: -1 });
submissionSchema.index({ schoolName: 1 });
submissionSchema.index({ studentId: 1 }, { unique: true, sparse: true });

const Submission = mongoose.model('Submission', submissionSchema);

/** Excel roster + persisted signed form link per student (studentId = Username in sheet). */
const rosterStudentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, trim: true },
    username: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    grade: { type: String, required: true, trim: true },
    admissionNumber: { type: String, trim: true },
    shareUrl: { type: String, trim: true },
    linkExpMs: { type: Number },
    linkGeneratedAt: { type: Date },
  },
  { timestamps: true },
);
rosterStudentSchema.index({ studentId: 1 }, { unique: true });

const RosterStudent = mongoose.model('RosterStudent', rosterStudentSchema);

function syncAdminRosterConfig() {
  adminRosterService.configure({
    useMongo,
    Submission: useMongo ? Submission : null,
    RosterStudent: useMongo ? RosterStudent : null,
    mockSubmissions,
    mockRoster,
  });
}

/** Resolves when Mongo bootstrap finished (connected + inited, or dev in-memory fallback applied). */
let mongoBootstrapPromise = Promise.resolve();

if (isTest) {
  // Keep tests isolated and deterministic without opening DB sockets.
  submissionsRouter.init(null, mockSubmissions, false, null, mockRoster);
  syncAdminRosterConfig();
} else {
  mongoBootstrapPromise = mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB');
      useMongo = true;
      submissionsRouter.init(Submission, mockSubmissions, useMongo, RosterStudent, mockRoster);
      syncAdminRosterConfig();
    })
    .catch((err) => {
      if (!isDev) {
        console.error('❌ MongoDB connection failed in production. Refusing to start.', err.message);
        process.exit(1);
      }
      console.warn('⚠️  MongoDB unavailable — using in-memory store.', err.message);
      useMongo = false;
      submissionsRouter.init(null, mockSubmissions, false, null, mockRoster);
      syncAdminRosterConfig();
    });
}

// ── Root (browser sanity check — SPA lives on Vite, not here) ─────────
app.get('/', (_req, res) => {
  res.json({
    success: true,
    name: 'Technathon API',
    hint: 'Student/admin UI runs on the Vite dev server (e.g. http://localhost:5173). This port is JSON API only.',
    health: '/health',
    uploadVideo: 'POST /api/upload/video (multipart field: file)',
    uploadDocument: 'POST /api/upload/document (multipart field: file)',
  });
});

// ── Health Check (no auth, no rate limit) ─────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: useMongo ? 'mongodb' : 'memory',
    env: process.env.NODE_ENV || 'development',
  });
});

// ── API Routes ─────────────────────────────────────────────
app.use('/api/admin',       adminRoutes);
app.use('/api/submissions', submissionsRouter);
app.use('/api/upload',      uploadRoutes);

// ── 404 Handler ───────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Centralised Error Handler ─────────────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────
let server;

function configureServerTimeouts() {
  if (!server) return;
  const uploadMs = Number(process.env.SERVER_UPLOAD_TIMEOUT_MS) || 900000;
  server.requestTimeout = uploadMs;
  server.headersTimeout = uploadMs + 60000;
}

function bindHttpServer() {
  server = app.listen(PORT, () => {
    console.log(`🚀 Server running → http://localhost:${PORT}`);
    console.log(`📋 Health check  → http://localhost:${PORT}/health`);
    console.log(`🌍 Environment   → ${process.env.NODE_ENV || 'development'}`);
  });
  configureServerTimeouts();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Stop the other process or set PORT in .env to a free port.`);
      console.error(`   Windows: netstat -ano | findstr :${PORT}   then  taskkill /PID <pid> /F`);
    } else {
      console.error('❌ Server listen error:', err.message);
    }
    process.exit(1);
  });
}

if (require.main === module && !isTest) {
  if (isDev) {
    bindHttpServer();
  } else {
    mongoBootstrapPromise.then(() => bindHttpServer());
  }
}

// ── Graceful Shutdown ─────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`\n⚡ ${signal} received — shutting down gracefully...`);
  if (server) {
    server.close(async () => {
      try {
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed.');
      } catch (_) {}
      console.log('👋 Server stopped.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Export for testing ────────────────────────────────────
module.exports = { app, Submission, RosterStudent };
