const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/** Monorepo root `.env` — single source of truth for all secrets and config. */
const ROOT_ENV_PATH = path.resolve(__dirname, '../../../../.env');

function isRunningInDocker() {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/**
 * Inside a container, 127.0.0.1/localhost is the container itself.
 * Rewrite to host.docker.internal so a MongoDB instance on the host is reachable.
 * Atlas (mongodb+srv://) URIs are left unchanged.
 */
function resolveMongoUri(uri) {
  if (!uri || !isRunningInDocker()) return uri;
  if (uri.startsWith('mongodb+srv://')) return uri;

  return uri
    .replace(/\/\/127\.0\.0\.1/g, '//host.docker.internal')
    .replace(/\/\/localhost/g, '//host.docker.internal');
}

function loadRootEnv() {
  // In Docker, compose injects env vars; file may not exist in the image.
  dotenv.config({ path: ROOT_ENV_PATH, override: false });
}

function appendDbNameToMongoUri(baseUri, dbName) {
  const trimmed = String(baseUri || '').trim();
  const name = String(dbName || '').trim();
  if (!trimmed || !name) return trimmed || undefined;

  const qIndex = trimmed.indexOf('?');
  if (qIndex >= 0) {
    const hostPart = trimmed.slice(0, qIndex).replace(/\/+$/, '');
    const query = trimmed.slice(qIndex + 1);
    return `${hostPart}/${name}?${query}`;
  }
  return `${trimmed.replace(/\/+$/, '')}/${name}`;
}

/**
 * Standalone Mongo (directConnection / localhost) does not support retryable writes.
 * Append retryWrites=false unless the URI already sets it (Atlas replica sets keep default).
 */
function ensureMongoClientOptions(uri) {
  const trimmed = String(uri || '').trim();
  if (!trimmed) return trimmed;

  const isStandalone =
    trimmed.includes('directConnection=true')
    || /mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(trimmed);

  if (!isStandalone || /[?&]retryWrites=/i.test(trimmed)) {
    return trimmed;
  }

  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}retryWrites=false`;
}

/**
 * Inventory DB URI: optional INVENTORY_MONGODB_URI override, else MONGODB_URI,
 * else MONGO_URI + INVENTORY_MONGO_DB_NAME (same pattern as PMO / Testimonials).
 */
function resolveInventoryMongoUri() {
  const explicit = String(process.env.INVENTORY_MONGODB_URI || '').trim();
  if (explicit) return ensureMongoClientOptions(resolveMongoUri(explicit));

  const injected = String(process.env.MONGODB_URI || '').trim();
  if (injected) return ensureMongoClientOptions(resolveMongoUri(injected));

  const base = String(process.env.MONGO_URI || '').trim();
  const dbName = String(process.env.INVENTORY_MONGO_DB_NAME || 'wizklub-inventory').trim();
  if (base) {
    return ensureMongoClientOptions(resolveMongoUri(appendDbNameToMongoUri(base, dbName)));
  }

  return undefined;
}

module.exports = {
  loadRootEnv,
  ROOT_ENV_PATH,
  resolveMongoUri,
  appendDbNameToMongoUri,
  ensureMongoClientOptions,
  resolveInventoryMongoUri,
  isRunningInDocker,
};
