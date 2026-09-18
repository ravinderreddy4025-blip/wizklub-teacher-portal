/**
 * Ensure at least one Admin user exists (required for spreadsheet dispatch sync).
 * Safe to run on every container start — no-op when users already exist.
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');

loadRootEnv();

const User = require('../src/models/User');

const BOOTSTRAP_EMAIL = 'system-admin@wizklub.local';
const BOOTSTRAP_NAME = 'System Admin';

async function main() {
  const uri = resolveInventoryMongoUri();
  if (!uri) {
    throw new Error('Set MONGO_URI + INVENTORY_MONGO_DB_NAME (or INVENTORY_MONGODB_URI) in repo-root .env');
  }

  await mongoose.connect(uri);

  const existing = await User.findOne({ role: 'Admin' }) || await User.findOne({});
  if (existing) {
    console.log(`Bootstrap admin: using existing user "${existing.name}" (${existing.email})`);
    await mongoose.disconnect();
    return;
  }

  const password = await bcrypt.hash(`bootstrap-${Date.now()}`, await bcrypt.genSalt(10));
  const user = await User.create({
    name: BOOTSTRAP_NAME,
    email: BOOTSTRAP_EMAIL,
    password,
    role: 'Admin',
  });
  console.log(`Bootstrap admin: created "${user.name}" (${user.email})`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
