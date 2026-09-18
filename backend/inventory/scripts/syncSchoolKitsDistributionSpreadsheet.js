/**
 * Sync acknowledged SC school kit inventory from
 * backend/inventory/data/school_kits_distribution.xlsx
 *
 * Wide-format sheet: one row per school, kit types as columns.
 * Creates Completed / acknowledged dispatches + SchoolInventory.
 *
 * Schools in this file are excluded from the not-acknowledged pending sync.
 *
 * Usage:
 *   node scripts/syncSchoolKitsDistributionSpreadsheet.js
 *   node scripts/syncSchoolKitsDistributionSpreadsheet.js --commit
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
const { normalizeSchoolNameKey } = require('../src/utils/schoolIdentity');
const {
  log,
  section,
  parseJoiningYear,
  findSchoolByName,
  resolveDivisionName,
  resolveBranchTargetName,
  buildKitLookup,
  resolveKitDoc,
  ensureWarehouseStock,
  assignSchoolCode,
  upsertSchoolKitDispatch,
  pruneOrphanSchoolKits,
} = require('./syncFinalDataSpreadsheet');

loadRootEnv();

const School = require('../src/models/School');
const Kit = require('../src/models/Kit');
const Division = require('../src/models/Division');
const User = require('../src/models/User');

const COMMIT = process.argv.includes('--commit');
const XLSX_PATH = path.join(__dirname, '../data/school_kits_distribution.xlsx');

const EXPECTED_SCHOOLS = 41;
const EXPECTED_KITS = 12013;

const META_COLUMNS = new Set(['School Code', 'School Name', 'Division']);

const KIT_COLUMN_ALIASES = {
  'pw & io connectors ypdp (bb-14, rb-10,bbb-2 =26)': 'PW & IO Connectors YPDP',
  'mic and amplifier with speaker': 'MICROPHONE',
};

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').toLowerCase().trim();
}

function resolveKitColumnName(columnName) {
  const key = clean(columnName);
  return KIT_COLUMN_ALIASES[key] || String(columnName || '').trim();
}

function loadSchoolKitsDistributionRows() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`Spreadsheet not found: ${XLSX_PATH}`);
  }

  const wb = XLSX.readFile(XLSX_PATH);
  const sheetName = wb.SheetNames.find((name) => /school kits distribution/i.test(name)) || wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  const rows = rawRows.map((row) => {
    const schoolId = String(row['School Code'] || '').trim();
    const name = String(row['School Name'] || '').trim();
    const region = String(row.Division || '').trim();
    const kits = Object.entries(row)
      .filter(([column]) => !META_COLUMNS.has(column))
      .map(([column, value]) => ({
        name: resolveKitColumnName(column),
        quantity: Math.max(0, Number(value) || 0),
      }))
      .filter((entry) => entry.quantity > 0);

    return { schoolId, name, region, kits };
  }).filter((row) => row.schoolId && row.name && row.schoolId.startsWith('SC-'));

  const schoolCount = rows.length;
  const totalKits = rows.reduce(
    (sum, row) => sum + row.kits.reduce((rowSum, kit) => rowSum + kit.quantity, 0),
    0,
  );

  return { rows, stats: { schoolCount, totalKits } };
}

function assertExpectedTotals(stats) {
  const errors = [];
  if (stats.schoolCount !== EXPECTED_SCHOOLS) {
    errors.push(`schools: expected ${EXPECTED_SCHOOLS}, got ${stats.schoolCount}`);
  }
  if (stats.totalKits !== EXPECTED_KITS) {
    errors.push(`kits: expected ${EXPECTED_KITS}, got ${stats.totalKits}`);
  }
  if (errors.length) {
    throw new Error(`school_kits_distribution totals mismatch — ${errors.join('; ')}`);
  }
}

function getAcknowledgedDistributionSkipKeys() {
  const { rows } = loadSchoolKitsDistributionRows();
  return {
    codes: new Set(rows.map((row) => row.schoolId)),
    names: new Set(rows.map((row) => normalizeSchoolNameKey(row.name))),
  };
}

function shouldSkipPendingSchool(schoolGroup, skipKeys = getAcknowledgedDistributionSkipKeys()) {
  if (skipKeys.codes.has(schoolGroup.schoolCode)) return true;
  return skipKeys.names.has(normalizeSchoolNameKey(schoolGroup.schoolName));
}

function filterPendingSchools(schools) {
  const skipKeys = getAcknowledgedDistributionSkipKeys();
  return schools.filter((school) => !shouldSkipPendingSchool(school, skipKeys));
}

async function main() {
  section('School kits distribution sync (acknowledged SC)');
  log(`File: ${XLSX_PATH}`);
  log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN (use --commit to write)'}`);

  const { rows, stats } = loadSchoolKitsDistributionRows();
  assertExpectedTotals(stats);
  log(`Loaded ${rows.length} SC school row(s), ${stats.totalKits} acknowledged kit(s).`);

  const mongoUri = resolveInventoryMongoUri();
  if (!mongoUri) throw new Error('No MONGODB_URI / MONGO_URI found.');
  await mongoose.connect(mongoUri);

  if (COMMIT) {
    await syncKitCatalog({ prune: true });
  }

  const kits = await Kit.find({});
  const kitByName = buildKitLookup(kits);
  const kitById = new Map(kits.map((kit) => [String(kit.kitId).toUpperCase(), kit]));

  const requiredByKitId = new Map();
  const unresolvedKitNames = new Set();
  rows.forEach((row) => {
    row.kits.forEach((entry) => {
      const kitDoc = resolveKitDoc(entry.name, kitByName);
      if (!kitDoc) {
        unresolvedKitNames.add(entry.name);
        return;
      }
      const kitId = String(kitDoc.kitId).toUpperCase();
      requiredByKitId.set(kitId, (requiredByKitId.get(kitId) || 0) + entry.quantity);
    });
  });

  if (unresolvedKitNames.size) {
    throw new Error(`Unresolved kit names: ${[...unresolvedKitNames].join(', ')}`);
  }

  await ensureWarehouseStock(requiredByKitId, kitById);

  const divisions = await Division.find({});
  const divisionMap = new Map(divisions.map((division) => [division.name.toLowerCase().trim(), division]));
  let allSchools = await School.find({});
  const amLookup = await loadAmUserLookup();

  let adminUser = await User.findOne({ role: 'Admin' });
  if (!adminUser) adminUser = await User.findOne({});
  if (!adminUser) throw new Error('No user found for dispatch createdBy.');

  let schoolsCreated = 0;
  let codesUpdated = 0;
  let dispatchesCreated = 0;
  let dispatchesUpdated = 0;
  let dispatchesSkipped = 0;

  for (const row of rows) {
    let school = findSchoolByName(allSchools, row.name, row.schoolId);
    const joiningYear = parseJoiningYear(row.schoolId);

    if (!school && COMMIT) {
      const divName = resolveDivisionName(row, divisionMap);
      const division = divisionMap.get(divName.toLowerCase()) || divisions[0];
      const amUser = resolveAmUserFromHint(
        { state: row.region, region: divName },
        amLookup,
      );
      const schoolName = row.name.startsWith('Sri Chaitanya')
        ? row.name
        : `Sri Chaitanya-${resolveBranchTargetName(row.name)}`;

      school = await School.create({
        name: schoolName,
        code: row.schoolId,
        joiningYear,
        divisionId: division._id,
        contactEmail: amUser?.email || '',
        rmId: amUser?._id || null,
        address: `${row.name}, ${row.region}`,
        wizklubRegionName: division.wizklubRegionName || division.name,
      });
      allSchools.push(school);
      schoolsCreated += 1;
      log(`  Created school: ${school.name} (${school.code})`);
    } else if (!school) {
      log(`  [dry-run] Would create ${row.schoolId} — ${row.name}`);
      continue;
    }

    const schoolCode = row.schoolId || school.code;
    if (await assignSchoolCode(school, row.schoolId, joiningYear)) {
      codesUpdated += 1;
    }

    const divName = resolveDivisionName(row, divisionMap);
    const amUser = resolveAmUserFromHint(
      { state: row.region, region: divName },
      amLookup,
    );
    if (amUser && String(school.rmId || '') !== String(amUser._id) && COMMIT) {
      await School.updateOne({ _id: school._id }, { $set: { rmId: amUser._id } });
      school.rmId = amUser._id;
    }

    log(`  ${school.name} (${schoolCode}) — ${row.kits.length} kit line(s)`);
    const keptKitIds = new Set();

    for (const entry of row.kits) {
      const kitDoc = resolveKitDoc(entry.name, kitByName);
      if (!kitDoc) continue;
      keptKitIds.add(String(kitDoc._id));

      const result = await upsertSchoolKitDispatch({
        school,
        schoolCode,
        joiningYear: joiningYear || school.joiningYear,
        kitDoc,
        quantity: entry.quantity,
        adminUser,
      });

      if (result.action === 'created' || result.action === 'would_create') dispatchesCreated += 1;
      else if (result.action === 'updated') dispatchesUpdated += 1;
      else dispatchesSkipped += 1;
    }

    if (COMMIT) {
      await pruneOrphanSchoolKits(school, keptKitIds);
    }
  }

  if (COMMIT) {
    const amResult = await syncOperationalAmsToDivisions();
    log(`  Division AM backfill: ${amResult.schoolsUpdated.length} division(s) updated`);
  }

  section('Summary');
  log(`  SC schools in sheet:   ${rows.length}`);
  log(`  Acknowledged kits:     ${stats.totalKits}`);
  log(`  Schools created:       ${schoolsCreated}`);
  log(`  Schools codes updated: ${codesUpdated}`);
  log(`  Dispatches created:    ${dispatchesCreated}`);
  log(`  Dispatches updated:    ${dispatchesUpdated}`);
  log(`  Dispatches unchanged:  ${dispatchesSkipped}`);
  log(`  Dispatch status:       Completed (acknowledged)`);
  log(`  Mode:                  ${COMMIT ? 'COMMITTED' : 'DRY-RUN'}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  loadSchoolKitsDistributionRows,
  getAcknowledgedDistributionSkipKeys,
  shouldSkipPendingSchool,
  filterPendingSchools,
  EXPECTED_SCHOOLS,
  EXPECTED_KITS,
};
