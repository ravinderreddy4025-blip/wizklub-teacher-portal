/**
 * Repair inventory schools after SR-code migration:
 * - Restore wizklubSchoolId (portal login id like beng0010) from snapshot
 * - Remove duplicate Dispatch rows per school+kit (keep latest)
 *
 * Usage:
 *   node scripts/repairSchoolInventoryData.js
 *   node scripts/repairSchoolInventoryData.js --commit
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const {
  isSpreadsheetSrCode,
  isWizklubPortalLoginId,
  normalizeSchoolNameKey,
} = require('../src/utils/schoolIdentity');

loadRootEnv();

const School = require('../src/models/School');
const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');

const COMMIT = process.argv.includes('--commit');
const SNAPSHOT_PATH = path.join(__dirname, '../data/school-portal-code-snapshot.json');

function log(msg) {
  console.log(msg);
}

function loadSnapshotMaps() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    log(`Snapshot not found: ${SNAPSHOT_PATH}`);
    return { byId: new Map(), byName: new Map() };
  }
  const rows = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const byId = new Map();
  const byName = new Map();
  rows.forEach((row) => {
    if (!row.code || isSpreadsheetSrCode(row.code)) return;
    byId.set(String(row.id), String(row.code).trim());
    const nameKey = normalizeSchoolNameKey(row.name);
    if (nameKey) byName.set(nameKey, String(row.code).trim());
  });
  return { byId, byName };
}

async function backfillPortalLoginIds(snapshot) {
  const schools = await School.find({});
  let updated = 0;
  let skipped = 0;

  for (const school of schools) {
    if (isWizklubPortalLoginId(school.wizklubSchoolId) && !isSpreadsheetSrCode(school.wizklubSchoolId)) {
      skipped += 1;
      continue;
    }

    let portalId = null;
    if (snapshot.byId.has(String(school._id))) {
      portalId = snapshot.byId.get(String(school._id));
    } else {
      const nameKey = normalizeSchoolNameKey(school.name);
      if (nameKey && snapshot.byName.has(nameKey)) {
        portalId = snapshot.byName.get(nameKey);
      }
    }

    if (!portalId || !isWizklubPortalLoginId(portalId)) continue;
    if (school.wizklubSchoolId === portalId) continue;

    log(`  Portal ID: ${school.name} → wizklubSchoolId=${portalId} (code=${school.code})`);
    if (COMMIT) {
      await School.updateOne({ _id: school._id }, { $set: { wizklubSchoolId: portalId } });
    }
    updated += 1;
  }

  return { updated, skipped };
}

async function dedupeDispatches() {
  const groups = await Dispatch.aggregate([
    {
      $group: {
        _id: { school: '$school', kit: '$kit' },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  let removed = 0;
  for (const group of groups) {
    const docs = await Dispatch.find({ _id: { $in: group.ids } }).sort({ updatedAt: -1, createdAt: -1 });
    const [keep, ...dupes] = docs;
    if (!keep || !dupes.length) continue;

    removed += dupes.length;
    if (COMMIT) {
      await Dispatch.deleteMany({ _id: { $in: dupes.map((d) => d._id) } });
      const invQty = keep.quantity || 0;
      await SchoolInventory.findOneAndUpdate(
        { school: keep.school, kit: keep.kit },
        { $set: { quantity: invQty } },
        { upsert: true },
      );
    }
  }

  return { duplicateGroups: groups.length, removed };
}

async function main() {
  log(`Repair school inventory data — ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
  const mongoUri = resolveInventoryMongoUri();
  if (!mongoUri) throw new Error('No MONGODB_URI / MONGO_URI found.');
  await mongoose.connect(mongoUri);

  const snapshot = loadSnapshotMaps();
  log(`Snapshot entries: byId=${snapshot.byId.size}, byName=${snapshot.byName.size}`);

  log('\n--- Backfill WizKlub portal login ids ---');
  const portal = await backfillPortalLoginIds(snapshot);
  log(`  Updated: ${portal.updated}, already OK: ${portal.skipped}`);

  log('\n--- Dedupe dispatch records (one per school+kit) ---');
  const dedupe = await dedupeDispatches();
  log(`  Duplicate kit groups: ${dedupe.duplicateGroups}, rows removed: ${dedupe.removed}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
