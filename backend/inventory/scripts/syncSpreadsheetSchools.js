/**
 * Compare operational spreadsheet schools vs inventory DB; optionally sync joiningYear + historical IB dispatches.
 *
 *   node backend/inventory/scripts/syncSpreadsheetSchools.js --report
 *   node backend/inventory/scripts/syncSpreadsheetSchools.js --apply
 */
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { parseRows } = require('./verifySpreadsheetSchools');
const { formatComponentId } = require('../src/utils/componentId');
const { generateUniqueDispatchId } = require('../src/utils/dispatchId');
const dispatchCycle = require('../src/utils/dispatchCycle');

loadRootEnv();

const School = require('../src/models/School');
const Division = require('../src/models/Division');
const User = require('../src/models/User');
const Kit = require('../src/models/Kit');
const Dispatch = require('../src/models/Dispatch');

const COMPONENT_ID_RE = /^(.+)-([A-Z0-9]+)-01-(\d{2})$/i;
const SCHOOL_ID_RE = /^(.+)\/(\d{2})$/;

function parseSchoolLoginId(raw) {
  const id = String(raw || '').trim();
  if (!id) return { code: '', joiningYear: null };
  const m = id.match(SCHOOL_ID_RE);
  if (!m) return { code: id, joiningYear: null };
  return { code: id, joiningYear: 2000 + Number(m[2]) };
}

function parseComponentId(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(COMPONENT_ID_RE);
  if (!m) return null;
  return {
    schoolLoginId: m[1],
    kitId: m[2].toUpperCase(),
    quantity: Number(m[3]),
  };
}

function normalizeCode(code) {
  return String(code || '').trim().toLowerCase();
}

async function loadSpreadsheetRows() {
  const fs = require('fs');
  const path = require('path');
  const verifyPath = path.join(__dirname, 'verifySpreadsheetSchools.js');
  const src = fs.readFileSync(verifyPath, 'utf8');
  const match = src.match(/const DATA = `([\s\S]*?)`;/);
  if (!match) throw new Error('Could not read spreadsheet DATA from verifySpreadsheetSchools.js');
  return parseRows(match[1]);
}

async function buildLookups() {
  const [schools, divisions, kits] = await Promise.all([
    School.find().lean(),
    Division.find().lean(),
    Kit.find().lean(),
  ]);

  const schoolByCode = new Map();
  for (const s of schools) {
    schoolByCode.set(normalizeCode(s.code), s);
  }

  const kitByKitId = new Map();
  for (const k of kits) {
    kitByKitId.set(String(k.kitId).toUpperCase(), k);
  }

  const divisionByName = new Map();
  for (const d of divisions) {
    divisionByName.set(String(d.name).trim().toLowerCase(), d);
  }

  return { schoolByCode, kitByKitId, divisionByName, schools };
}

function mapStateToDivisionName(state) {
  const s = String(state || '').trim();
  const map = {
    'andhra pradesh': 'Andhra Pradesh',
    bengaluru: 'Bengaluru',
    chennai: 'Chennai',
    maharashtra: 'Maharashtra',
    'rest of india': 'Rest of India',
    'rest of karnataka': 'Rest of Karnataka',
    'rest of tamil nadu': 'Rest of Tamil Nadu',
    telangana: 'Telangana',
    'west bengal': 'West Bengal',
  };
  return map[s.toLowerCase()] || s;
}

async function report(rows, lookups) {
  const registered = [];
  const unregistered = [];
  const missingSchoolId = [];
  const missingComponent = [];
  const joiningYearMismatch = [];
  const kitMissing = [];
  const dispatchExists = [];
  const dispatchMissing = [];

  for (const row of rows) {
    const schoolLoginId = String(row.schoolId || '').trim();
    if (!schoolLoginId) {
      missingSchoolId.push(row);
      continue;
    }

    const dbSchool = lookups.schoolByCode.get(normalizeCode(schoolLoginId));
    const parsed = parseSchoolLoginId(schoolLoginId);
    const component = parseComponentId(row.componentId);

    if (!dbSchool) {
      unregistered.push({ ...row, reason: 'not_in_inventory' });
      continue;
    }

    registered.push(row);

    if (parsed.joiningYear != null && dbSchool.joiningYear !== parsed.joiningYear) {
      joiningYearMismatch.push({
        branch: row.branch,
        code: schoolLoginId,
        dbJoiningYear: dbSchool.joiningYear,
        expectedJoiningYear: parsed.joiningYear,
      });
    }

    if (!component) {
      if (row.componentId) missingComponent.push(row);
      continue;
    }

    const kit = lookups.kitByKitId.get(component.kitId);
    if (!kit) {
      kitMissing.push({ branch: row.branch, kitId: component.kitId, componentId: row.componentId });
      continue;
    }

    const expectedComponentId = formatComponentId({
      schoolCode: dbSchool.code,
      joiningYear: parsed.joiningYear ?? dbSchool.joiningYear,
      kitId: component.kitId,
      quantity: component.quantity,
    });

    const existing = await Dispatch.findOne({
      school: dbSchool._id,
      componentId: expectedComponentId,
    }).lean();

    if (existing) {
      dispatchExists.push({ branch: row.branch, componentId: expectedComponentId });
    } else {
      dispatchMissing.push({
        branch: row.branch,
        state: row.state,
        schoolCode: schoolLoginId,
        componentId: expectedComponentId,
        kitId: component.kitId,
        quantity: component.quantity,
        schoolDbId: dbSchool._id,
        kitDbId: kit._id,
      });
    }
  }

  return {
    totalRows: rows.length,
    registeredCount: registered.length,
    unregisteredCount: unregistered.length,
    missingSchoolIdCount: missingSchoolId.length,
    joiningYearMismatchCount: joiningYearMismatch.length,
    kitMissingCount: kitMissing.length,
    dispatchExistsCount: dispatchExists.length,
    dispatchMissingCount: dispatchMissing.length,
    unregistered,
    missingSchoolId,
    joiningYearMismatch,
    kitMissing,
    dispatchMissing: dispatchMissing.slice(0, 20),
  };
}

async function apply(rows, lookups) {
  let schoolsUpdated = 0;
  let dispatchesCreated = 0;
  const errors = [];

  const admin = await User.findOne({ role: 'Admin' }).select('_id').lean();

  for (const row of rows) {
    const schoolLoginId = String(row.schoolId || '').trim();
    if (!schoolLoginId) continue;

    const dbSchool = lookups.schoolByCode.get(normalizeCode(schoolLoginId));
    if (!dbSchool) continue;

    const parsed = parseSchoolLoginId(schoolLoginId);
    const component = parseComponentId(row.componentId);
    if (!component) continue;

    const kit = lookups.kitByKitId.get(component.kitId);
    if (!kit) {
      errors.push({ branch: row.branch, message: `Kit ${component.kitId} not in warehouse` });
      continue;
    }

    try {
      const schoolDoc = await School.findById(dbSchool._id);
      if (parsed.joiningYear != null && schoolDoc.joiningYear !== parsed.joiningYear) {
        schoolDoc.joiningYear = parsed.joiningYear;
        await schoolDoc.save();
        schoolsUpdated += 1;
      }

      const componentId = formatComponentId({
        schoolCode: schoolDoc.code,
        joiningYear: schoolDoc.joiningYear ?? parsed.joiningYear,
        kitId: component.kitId,
        quantity: component.quantity,
      });

      const existing = await Dispatch.findOne({ school: schoolDoc._id, componentId });
      if (existing) continue;

      const dispatchId = await generateUniqueDispatchId();
      const now = new Date();
      const record = await Dispatch.create({
        kit: kit._id,
        quantity: component.quantity,
        school: schoolDoc._id,
        reportingManager: schoolDoc.rmId || undefined,
        componentId,
        kitId: componentId,
        consignmentNo: `HIST-${dispatchId}`,
        category: 'New Dispatch',
        status: 'Acknowledged',
        dispatchedAt: now,
        acknowledgedAt: now,
        dispatchId,
        createdBy: admin?._id,
        dispatchDetails: 'Imported from operational spreadsheet (historical IB dispatch)',
      });

      dispatchCycle.ensureInitialCycle(record, {
        quantity: component.quantity,
        kitId: componentId,
        consignmentNo: record.consignmentNo,
        category: record.category,
        dispatchedAt: now,
        dispatchedBy: admin?._id,
      });
      record.cycles[0].status = 'ACKNOWLEDGED';
      record.cycles[0].quantityAcknowledged = component.quantity;
      record.cycles[0].acknowledgedAt = now;
      await record.save();

      dispatchesCreated += 1;
    } catch (err) {
      errors.push({ branch: row.branch, message: err.message });
    }
  }

  return { schoolsUpdated, dispatchesCreated, errors };
}

async function main() {
  const applyMode = process.argv.includes('--apply');
  const uri = resolveInventoryMongoUri();
  if (!uri) {
    console.error('Mongo URI not configured');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const rows = await loadSpreadsheetRows();
  const lookups = await buildLookups();

  const summary = await report(rows, lookups);
  console.log(JSON.stringify({
    totalSpreadsheetRows: summary.totalRows,
    registeredInInventory: summary.registeredCount,
    unregisteredInInventory: summary.unregisteredCount,
    rowsWithoutSchoolId: summary.missingSchoolIdCount,
    joiningYearNeedsUpdate: summary.joiningYearMismatchCount,
    kitNotInWarehouse: summary.kitMissingCount,
    historicalDispatchesAlreadyRecorded: summary.dispatchExistsCount,
    historicalDispatchesMissing: summary.dispatchMissingCount,
  }, null, 2));

  if (summary.unregistered.length) {
    console.log('\n--- UNREGISTERED (not in inventory DB) ---');
    summary.unregistered.forEach((r) => {
      console.log(`${r.state} | ${r.branch} | ${r.schoolId || 'NO ID'} | AM: ${r.amEmail}`);
    });
  }

  if (summary.missingSchoolId.length) {
    console.log('\n--- NO SCHOOL ID IN SPREADSHEET ---');
    summary.missingSchoolId.forEach((r) => {
      console.log(`${r.state} | ${r.branch} | AM: ${r.amEmail}`);
    });
  }

  if (summary.joiningYearMismatch.length) {
    console.log('\n--- JOINING YEAR MISMATCH (sample) ---');
    summary.joiningYearMismatch.slice(0, 10).forEach((r) => {
      console.log(`${r.code} | DB: ${r.dbJoiningYear ?? 'null'} | expected: ${r.expectedJoiningYear}`);
    });
  }

  if (applyMode) {
    const applied = await apply(rows, lookups);
    console.log('\n--- APPLY RESULT ---');
    console.log(JSON.stringify(applied, null, 2));
  } else {
    console.log('\nRun with --apply to set joiningYear and create missing historical IB dispatches.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
