/**
 * Sync acknowledged 2026 SC + NSC school kit inventory from long-format spreadsheet:
 *   backend/inventory/data/SC_WIZKLUB_Combined_Single_Sheet.xlsx
 *
 * Creates Completed / acknowledged dispatches + SchoolInventory (same as FINAL_DATA sync).
 *
 * Usage:
 *   node scripts/syncCombinedAcknowledgedSpreadsheet.js
 *   node scripts/syncCombinedAcknowledgedSpreadsheet.js --commit
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { syncKitCatalog } = require('../src/services/kitCatalogSyncService');
const {
  loadAmUserLookup,
  resolveAmUserFromHint,
  syncOperationalAmsToDivisions,
} = require('../src/services/operationalAmService');
const {
  log,
  section,
  parseJoiningYear,
  buildKitLookup,
  resolveKitDoc,
  ensureWarehouseStock,
  upsertSchoolKitDispatch,
  pruneOrphanSchoolKits,
} = require('./syncFinalDataSpreadsheet');

loadRootEnv();

const School = require('../src/models/School');
const Kit = require('../src/models/Kit');
const Division = require('../src/models/Division');
const User = require('../src/models/User');
const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');

const COMMIT = process.argv.includes('--commit');
const XLSX_PATH = path.join(__dirname, '../data/SC_WIZKLUB_Combined_Single_Sheet.xlsx');

const EXPECTED_SCHOOLS = 36;
const EXPECTED_KITS = 9517;

const REGION_TO_DIVISION = {
  'andhra pradesh': 'Andhra Pradesh',
  bengaluru: 'Bengaluru',
  chennai: 'Tamil Nadu',
  maharashtra: 'Maharashtra',
  telangana: 'Telangana',
  'west bengal': 'West Bengal',
  'rest of karnataka': 'Karnataka',
  'rest of tamil nadu': 'Tamil Nadu',
  'delhi ncr': 'Delhi NCR',
  rajasthan: 'Rajasthan',
  punjab: 'Punjab',
  'uttar pradesh': 'Uttar Pradesh',
  manipur: 'IL School',
  uttarpradesh: 'Uttar Pradesh',
  jaipur: 'Rajasthan',
  pondicherry: 'Tamil Nadu',
  pondechery: 'Tamil Nadu',
  mandya: 'Karnataka',
};

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').toLowerCase().trim();
}

function normalizeSchoolCode(rawId, joiningYear = 2026) {
  const raw = String(rawId || '').trim();
  if (!raw) return raw;
  if (/\/\d{2}$/.test(raw)) return raw.toUpperCase();
  const yy = String(joiningYear % 100).padStart(2, '0');
  const m = raw.match(/^(NSC|SC)-(\d+)$/i);
  if (m) return `${m[1].toUpperCase()}-${m[2]}/${yy}`;
  return raw.toUpperCase();
}

function resolveDivisionName(region) {
  const key = clean(region);
  return REGION_TO_DIVISION[key] || (key.includes('il') ? 'IL School' : 'Maharashtra');
}

function formatSchoolName(name, schoolCode) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return trimmed;
  if (schoolCode.startsWith('NSC-') || trimmed.startsWith('Sri Chaitanya')) return trimmed;
  return `Sri Chaitanya-${trimmed}`;
}

function loadCombinedRows() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`Spreadsheet not found: ${XLSX_PATH}`);
  }
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const schools = new Map();
  rawRows.forEach((row) => {
    const name = String(row['School Name'] || '').trim();
    const region = String(row.Region || '').trim();
    const joiningYear = Number(row['Joining Year'] || 2026);
    const schoolCode = normalizeSchoolCode(row['School ID'], joiningYear);
    const kitName = String(row['Kit Name'] || '').trim();
    const kitId = String(row['Kit ID'] || '').trim();
    const quantity = Math.max(0, Number(row.Quantity) || 0);
    if (!schoolCode || !name || !quantity) return;

    if (!schools.has(schoolCode)) {
      schools.set(schoolCode, {
        schoolCode,
        name,
        region,
        joiningYear,
        kits: [],
      });
    }
    const school = schools.get(schoolCode);
    const kitKey = String(kitId || kitName || '').trim().toUpperCase();
    const existing = school.kits.find(
      (kit) => String(kit.kitId || kit.kitName || '').trim().toUpperCase() === kitKey,
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      school.kits.push({ kitName, kitId, quantity });
    }
  });

  const schoolList = [...schools.values()];
  const totalKits = schoolList.reduce(
    (sum, school) => sum + school.kits.reduce((s, kit) => s + kit.quantity, 0),
    0,
  );

  return {
    schools: schoolList,
    stats: {
      schoolCount: schoolList.length,
      totalKits,
      scSchools: schoolList.filter((s) => s.schoolCode.startsWith('SC-')).length,
      nscSchools: schoolList.filter((s) => s.schoolCode.startsWith('NSC-')).length,
    },
  };
}

function assertExpectedTotals(stats) {
  if (stats.schoolCount !== EXPECTED_SCHOOLS || stats.totalKits !== EXPECTED_KITS) {
    throw new Error(
      `Combined spreadsheet totals mismatch — expected ${EXPECTED_SCHOOLS} schools / ${EXPECTED_KITS} kits, got ${stats.schoolCount} / ${stats.totalKits}`,
    );
  }
}

function findSchool(allSchools, schoolCode) {
  const matches = allSchools.filter((s) => clean(s.code) === clean(schoolCode));
  if (matches.length === 1) return matches[0];
  return matches[0] || null;
}

async function ensureDivision(divName, divisionMap) {
  const key = clean(divName);
  let division = divisionMap.get(key);
  if (division) return division;
  if (!COMMIT) return null;
  division = await Division.create({
    name: divName,
    wizklubRegionName: divName,
    description: 'Auto-created during combined spreadsheet sync',
  });
  divisionMap.set(key, division);
  return division;
}

async function main() {
  section('Combined 2026 school kit sync (acknowledged)');
  log(`File: ${XLSX_PATH}`);
  log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN (use --commit to write)'}`);

  const { schools, stats } = loadCombinedRows();
  assertExpectedTotals(stats);
  log(`Loaded ${schools.length} school(s), ${stats.totalKits} kit(s) (SC ${stats.scSchools}, NSC ${stats.nscSchools}).`);

  const mongoUri = resolveInventoryMongoUri();
  if (!mongoUri) throw new Error('No MONGODB_URI / MONGO_URI found.');
  await mongoose.connect(mongoUri);

  if (COMMIT) {
    await syncKitCatalog({ prune: true });
  }

  const kits = await Kit.find({});
  const kitByName = buildKitLookup(kits);
  const kitById = new Map(kits.map((k) => [String(k.kitId).toUpperCase(), k]));

  const requiredByKitId = new Map();
  schools.forEach((row) => {
    row.kits.forEach((entry) => {
      let kitDoc = kitById.get(String(entry.kitId).toUpperCase());
      if (!kitDoc && entry.kitName) {
        kitDoc = resolveKitDoc(entry.kitName, kitByName);
      }
      if (!kitDoc) return;
      const kitKey = String(kitDoc.kitId).toUpperCase();
      requiredByKitId.set(kitKey, (requiredByKitId.get(kitKey) || 0) + entry.quantity);
    });
  });
  if (COMMIT) {
    section('Ensure warehouse stock');
    const warehouseUpdates = await ensureWarehouseStock(requiredByKitId, kitById);
    log(`  Warehouse top-ups applied: ${warehouseUpdates}`);
  }

  const divisions = await Division.find({});
  const divisionMap = new Map(divisions.map((d) => [d.name.toLowerCase().trim(), d]));
  const amLookup = await loadAmUserLookup();

  let adminUser = await User.findOne({ role: 'Admin' });
  if (!adminUser) adminUser = await User.findOne({});
  if (!adminUser) throw new Error('No user found for dispatch createdBy.');

  let allSchools = await School.find({});
  let schoolsCreated = 0;
  let dispatchesCreated = 0;
  let dispatchesUpdated = 0;
  const unresolvedKits = new Set();

  for (const row of schools) {
    let school = findSchool(allSchools, row.schoolCode);

    if (!school && COMMIT) {
      const divName = resolveDivisionName(row.region);
      const divDoc = await ensureDivision(divName, divisionMap);
      if (!divDoc) {
        log(`  ❌ No division (dry-run): ${row.name} → ${divName}`);
        continue;
      }
      const amUser = resolveAmUserFromHint(
        { state: row.region, region: divName },
        amLookup,
      );
      school = await School.create({
        name: formatSchoolName(row.name, row.schoolCode),
        code: row.schoolCode,
        joiningYear: row.joiningYear || parseJoiningYear(row.schoolCode),
        divisionId: divDoc._id,
        contactEmail: amUser?.email || '',
        rmId: amUser?._id || null,
        address: row.region ? `${row.name}, ${row.region}` : row.name,
        wizklubRegionName: divDoc.wizklubRegionName || divDoc.name,
      });
      allSchools = await School.find({});
      schoolsCreated += 1;
      log(`  ✅ Created school: ${school.name} (${school.code})`);
    } else if (!school) {
      log(`  ❌ No match (dry-run): ${row.name} (${row.schoolCode})`);
      continue;
    }

    const aggregatedKits = new Map();
    for (const entry of row.kits) {
      let kitDoc = kitById.get(String(entry.kitId).toUpperCase());
      if (!kitDoc && entry.kitName) {
        kitDoc = resolveKitDoc(entry.kitName, kitByName);
      }
      if (!kitDoc) {
        unresolvedKits.add(entry.kitName || entry.kitId);
        log(`    ⚠️  Unknown kit: ${entry.kitName || entry.kitId}`);
        continue;
      }
      const kitKey = String(kitDoc._id);
      aggregatedKits.set(kitKey, {
        kitDoc,
        quantity: (aggregatedKits.get(kitKey)?.quantity || 0) + entry.quantity,
      });
    }

    log(`  ${school.name} (${school.code}): ${aggregatedKits.size} kit type(s)`);
    const keptKitIds = new Set();

    for (const { kitDoc, quantity } of aggregatedKits.values()) {
      keptKitIds.add(String(kitDoc._id));

      const result = await upsertSchoolKitDispatch({
        school,
        schoolCode: row.schoolCode,
        joiningYear: row.joiningYear || parseJoiningYear(row.schoolCode),
        kitDoc,
        quantity,
        adminUser,
      });
      if (result.action === 'created' || result.action === 'would_create') dispatchesCreated += 1;
      else if (result.action === 'updated' || result.action === 'would_update') dispatchesUpdated += 1;
    }

    if (COMMIT) {
      const pruned = await pruneOrphanSchoolKits(school, keptKitIds);
      if (pruned.removedDispatches || pruned.removedInventory) {
        log(`    🧹 Pruned ${pruned.removedDispatches} dispatch(es), ${pruned.removedInventory} inventory row(s)`);
      }
    }
  }

  if (COMMIT) {
    const amResult = await syncOperationalAmsToDivisions();
    log(`  Division AM backfill: ${amResult.schoolsUpdated.length} division(s) updated`);
  }

  section('Summary');
  log(`  Schools in sheet:     ${schools.length}`);
  log(`  Schools created:      ${schoolsCreated}`);
  log(`  Dispatches created:   ${dispatchesCreated}`);
  log(`  Dispatches updated:   ${dispatchesUpdated}`);
  log(`  Unresolved kits:      ${unresolvedKits.size}`);
  log(`  Acknowledged kits:    ${stats.totalKits}`);
  log(`  Dispatch status:      Completed (acknowledged)`);

  if (COMMIT) {
    const codes = schools.map((row) => row.schoolCode);
    const syncedSchools = await School.find({ code: { $in: codes } });
    const schoolIds = syncedSchools.map((school) => school._id);
    const [invAgg, dispAgg] = await Promise.all([
      SchoolInventory.aggregate([
        { $match: { school: { $in: schoolIds } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]),
      Dispatch.aggregate([
        { $match: { school: { $in: schoolIds } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]),
    ]);
    const invTotal = invAgg[0]?.total || 0;
    const dispTotal = dispAgg[0]?.total || 0;
    log(`  DB combined inventory: ${invTotal}`);
    log(`  DB combined dispatch:  ${dispTotal}`);
    if (invTotal !== stats.totalKits || dispTotal !== stats.totalKits) {
      throw new Error(
        `Combined sync DB totals mismatch (expected=${stats.totalKits}, inv=${invTotal}, dispatch=${dispTotal})`,
      );
    }
  }

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  loadCombinedRows,
  assertExpectedTotals,
  EXPECTED_SCHOOLS,
  EXPECTED_KITS,
  XLSX_PATH,
};
