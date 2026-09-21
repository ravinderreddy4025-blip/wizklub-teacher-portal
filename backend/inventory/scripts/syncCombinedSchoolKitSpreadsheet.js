/**
 * Sync 2026 pending-acknowledgment SC + IL school kit dispatches from:
 *   - backend/inventory/data/SC-SCHOOL-NOT_ACKNOWLEDGED.xlsx (23 schools, 5,128 kits)
 *   - backend/inventory/data/WIZKLUB_NOT_ACKNOWLEDGED.xlsx (12 schools, 3,803 kits)
 *
 * Creates Dispatched (not acknowledged) dispatches — schools must confirm receipt.
 * School codes: SC-xxx/26, NSC-xxx/26. Runs after FINAL_DATA sync on container start.
 *
 * Usage:
 *   node scripts/syncCombinedSchoolKitSpreadsheet.js
 *   node scripts/syncCombinedSchoolKitSpreadsheet.js --commit
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');
const { syncKitCatalog } = require('../src/services/kitCatalogSyncService');
const { formatComponentId } = require('../src/utils/componentId');
const { generateUniqueDispatchIds } = require('../src/utils/dispatchId');
const dispatchCycle = require('../src/utils/dispatchCycle');
const { pendingAckKitsOnDispatch } = require('../src/utils/operationsKpi');
const {
  loadAmUserLookup,
  resolveAmUserFromHint,
  syncOperationalAmsToDivisions,
} = require('../src/services/operationalAmService');
const {
  normalizeSchoolNameKey,
  isWizklubPortalLoginId,
} = require('../src/utils/schoolIdentity');

loadRootEnv();

const School = require('../src/models/School');
const Kit = require('../src/models/Kit');
const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');
const Division = require('../src/models/Division');
const User = require('../src/models/User');

const catalog = require('../data/component-kits.json');
const COMMIT = process.argv.includes('--commit');
const SC_XLSX_PATH = path.join(__dirname, '../data/SC-SCHOOL-NOT_ACKNOWLEDGED.xlsx');
const IL_XLSX_PATH = path.join(__dirname, '../data/WIZKLUB_NOT_ACKNOWLEDGED.xlsx');
const SNAPSHOT_PATH = path.join(__dirname, '../data/school-portal-code-snapshot.json');
const JOINING_YEAR = 2026;

const EXPECTED_SCHOOLS = 35;
const EXPECTED_KITS = 8931;
const EXPECTED_SC_KITS = 5128;
const EXPECTED_IL_KITS = 3803;

/** IL matrix includes jumper/connector rows that are excluded from pending totals. */
const IL_EXCLUDED_KIT_IDS = new Set(['1', '2', '3', '4']);

const KIT_ALIASES = {
  'mic and amplifier with speaker': 'MIC',
  '( bb-14, rb-10,bbb-2 =26 )': '4',
  'pw & io connectors ypdp': '4',
};

const NAME_ALIASES = {
  chinruha: 'Chinsurah',
  'coimbatore cheety street': 'Coimbatore Chetty Street',
  'cavery public': 'Cauvery Public School',
  radhakrishna: 'Radha Krishna Public School',
  'radhakrishna public school': 'Radha Krishna Public School',
  'seven hills': 'Seven Hills School',
  'soikholal ideal': 'SOIKHOLAL IDEAL HIGH SCHOOL',
  'st arnold': 'St Arnold central school',
  'vivekananda higher': 'Vivekananda Higher Secondary School',
  'st xavier’s': 'Jaipur Xaviers School',
  "st xavier's": 'Jaipur Xaviers School',
  'st. soldier': "St. Soldier's School",
};

const IL_DISPLAY_NAME_BY_CODE = {
  'NSC-001/26': 'Suraj Public',
  'NSC-002/26': 'Jaipur Xaviers School',
  'NSC-003/26': "St. Soldier's School",
  'NSC-004/26': 'Seven Hills',
  'NSC-005/26': 'Radha Krishna Public School',
  'NSC-006/26': 'SOIKHOLAL IDEAL HIGH SCHOOL',
  'NSC-007/26': 'St Arnold central school',
  'NSC-008/26': 'SSV Public School',
  'NSC-009/26': 'Vivekananda Higher Secondary School',
  'NSC-010/26': 'Vivekananda Vidyalaya',
  'NSC-011/26': 'Vivekananda school CBSE',
  'NSC-012/26': 'Cauvery Public School',
};

const IL_REGION_TO_DIVISION = {
  mandya: 'Karnataka',
  manipur: 'IL School',
  uttarpradesh: 'Uttar Pradesh',
  rajasthan: 'Rajasthan',
  jaipur: 'Rajasthan',
  pondechery: 'Tamil Nadu',
  pondicherry: 'Tamil Nadu',
};

const SC_CITY_TO_DIVISION = {
  badlapur: 'Maharashtra',
  bareilly: 'Uttar Pradesh',
  chandigarh: 'Punjab',
  chinsurah: 'West Bengal',
  chittorgarh: 'Rajasthan',
  coimbatore: 'Tamil Nadu',
  gurugram: 'Delhi NCR',
  hospet: 'Karnataka',
  kukatpally: 'Telangana',
  luxor: 'Tamil Nadu',
  madurai: 'Tamil Nadu',
  mohali: 'Punjab',
  mysore: 'Karnataka',
  nizampet: 'Telangana',
  padur: 'Tamil Nadu',
  pollachi: 'Tamil Nadu',
  rampura: 'Bengaluru',
  tiruchengode: 'Tamil Nadu',
  udaipur: 'Rajasthan',
  valasaravakkam: 'Tamil Nadu',
  vellore: 'Tamil Nadu',
};

const kitByName = new Map(catalog.map((kit) => [kit.name.toLowerCase(), kit.kitId]));

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').toLowerCase().trim();
}

function log(msg) {
  console.log(msg);
}

function section(title) {
  log(`\n${'='.repeat(70)}\n  ${title}\n${'='.repeat(70)}`);
}

function normalizeBatchSchoolCode(rawId, joiningYear = JOINING_YEAR) {
  const base = String(rawId || '').trim().replace(/\/\d{2}$/, '');
  const yy = String(joiningYear % 100).padStart(2, '0');
  return `${base}/${yy}`;
}

function resolveKitId(nameOrId) {
  const raw = String(nameOrId || '').trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (KIT_ALIASES[low]) return KIT_ALIASES[low];
  if (kitByName.has(low)) return kitByName.get(low);
  const upper = raw.toUpperCase();
  if (catalog.some((kit) => kit.kitId === upper)) return upper;
  return null;
}

function resolveDisplayName(name, schoolCode = '') {
  if (schoolCode && IL_DISPLAY_NAME_BY_CODE[schoolCode]) {
    return IL_DISPLAY_NAME_BY_CODE[schoolCode];
  }
  const key = clean(name);
  return NAME_ALIASES[key] || String(name || '').trim();
}

function trailingNumberToken(value) {
  const match = clean(value).match(/(\d+)\s*$/);
  return match ? match[1] : null;
}

function namesMatch(a, b) {
  const left = clean(a);
  const right = clean(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const alias = NAME_ALIASES[left];
  if (alias && clean(alias) === right) return true;
  if (normalizeSchoolNameKey(a) === normalizeSchoolNameKey(b)) return true;

  const leftNum = trailingNumberToken(left);
  const rightNum = trailingNumberToken(right);
  if (leftNum && rightNum && leftNum !== rightNum) return false;

  if (left.includes(right) || right.includes(left)) return true;
  return false;
}

function schoolGroupKey(schoolName, schoolCode) {
  return `${normalizeSchoolNameKey(schoolName)}|${schoolCode}`;
}

function parseScMatrix(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`SC spreadsheet not found: ${filePath}`);
  }
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(filePath).Sheets.Sheet1, { header: 1, defval: '' });
  const header = rows[0] || [];
  const schools = [];

  for (let c = 2; c < header.length; c += 2) {
    const name = String(header[c] || '').trim();
    if (!name || name === "Stickers ID's") continue;
    const sticker = String(rows[1]?.[c + 1] || '').trim();
    const match = sticker.match(/^(SC-\d+\/\d+)-/);
    schools.push({
      name: name.replace(/\s*\(\d+\)\s*$/, '').trim(),
      schoolCode: match ? match[1] : '',
      qtyCol: c,
    });
  }

  const kitRows = [];
  const unresolved = new Set();

  for (let r = 1; r < rows.length; r++) {
    const kitName = String(rows[r][1] || '').trim();
    const kitId = resolveKitId(kitName);
    if (!kitId) {
      if (kitName) unresolved.add(kitName);
      continue;
    }
    schools.forEach((school) => {
      const quantity = Number(rows[r][school.qtyCol]) || 0;
      if (quantity <= 0) return;
      kitRows.push({
        schoolName: school.name,
        schoolCode: school.schoolCode,
        region: '',
        joiningYear: JOINING_YEAR,
        kitName,
        kitId: String(kitId).toUpperCase(),
        quantity,
        isIl: false,
      });
    });
  }

  if (unresolved.size) {
    throw new Error(`Unresolved SC kit names: ${[...unresolved].join(', ')}`);
  }

  return kitRows;
}

function parseIlRegionByColumn(rows) {
  const regionRow = rows[0] || [];
  const regions = {};
  let currentRegion = '';
  for (let c = 0; c < regionRow.length; c += 1) {
    const cell = String(regionRow[c] || '').trim();
    if (cell) currentRegion = cell;
    regions[c] = currentRegion;
  }
  return regions;
}

function parseIlMatrix(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`IL spreadsheet not found: ${filePath}`);
  }
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(filePath).Sheets.Sheet1, { header: 1, defval: '' });
  const nameRow = rows[1] || [];
  const regionsByCol = parseIlRegionByColumn(rows);
  const schools = [];

  for (let c = 2; c < nameRow.length; c += 2) {
    const name = String(nameRow[c] || '').trim();
    if (!name || name === "Stickers ID's" || name === 'Module name') continue;

    let schoolCode = '';
    for (let r = 4; r < rows.length; r++) {
      const sticker = String(rows[r][c + 1] || '').trim();
      const match = sticker.match(/^(NSC-\d+\/\d+)-/);
      if (match) {
        schoolCode = match[1];
        break;
      }
    }
    if (!schoolCode) {
      throw new Error(`IL school "${name}" is missing NSC sticker code in ${filePath}`);
    }

    schools.push({
      name,
      qtyCol: c,
      region: String(regionsByCol[c] || '').trim(),
      schoolCode,
    });
  }

  const kitRows = [];
  const unresolved = new Set();

  for (let r = 4; r < rows.length; r++) {
    const kitName = String(rows[r][0] || '').trim();
    const kitId = resolveKitId(rows[r][1] || kitName);
    if (!kitId) {
      if (kitName || rows[r][1]) unresolved.add(kitName || rows[r][1]);
      continue;
    }
    if (IL_EXCLUDED_KIT_IDS.has(String(kitId))) continue;

    schools.forEach((school) => {
      const quantity = Number(rows[r][school.qtyCol]) || 0;
      if (quantity <= 0) return;
      kitRows.push({
        schoolName: school.name,
        schoolCode: school.schoolCode,
        region: school.region,
        joiningYear: JOINING_YEAR,
        kitName: kitName || kitId,
        kitId: String(kitId).toUpperCase(),
        quantity,
        isIl: true,
      });
    });
  }

  if (unresolved.size) {
    throw new Error(`Unresolved IL kit names: ${[...unresolved].join(', ')}`);
  }

  return kitRows;
}

function loadPendingDispatchRows() {
  const scRows = parseScMatrix(SC_XLSX_PATH);
  const ilRows = parseIlMatrix(IL_XLSX_PATH);
  const rows = [...scRows, ...ilRows];

  const scKits = scRows.reduce((sum, row) => sum + row.quantity, 0);
  const ilKits = ilRows.reduce((sum, row) => sum + row.quantity, 0);
  const schools = groupRowsBySchool(rows);

  return {
    rows,
    schools,
    stats: {
      schoolCount: schools.length,
      totalKits: scKits + ilKits,
      scSchools: schools.filter((school) => !school.isIl).length,
      ilSchools: schools.filter((school) => school.isIl).length,
      scKits,
      ilKits,
    },
  };
}

function assertExpectedTotals(stats) {
  const errors = [];
  if (stats.schoolCount !== EXPECTED_SCHOOLS) {
    errors.push(`schools: expected ${EXPECTED_SCHOOLS}, got ${stats.schoolCount} (SC ${stats.scSchools}, IL ${stats.ilSchools})`);
  }
  if (stats.scKits !== EXPECTED_SC_KITS) {
    errors.push(`SC kits: expected ${EXPECTED_SC_KITS}, got ${stats.scKits}`);
  }
  if (stats.ilKits !== EXPECTED_IL_KITS) {
    errors.push(`IL kits: expected ${EXPECTED_IL_KITS}, got ${stats.ilKits}`);
  }
  if (stats.totalKits !== EXPECTED_KITS) {
    errors.push(`total kits: expected ${EXPECTED_KITS}, got ${stats.totalKits}`);
  }
  if (errors.length) {
    throw new Error(`Pending dispatch spreadsheet totals mismatch — ${errors.join('; ')}`);
  }
}

function groupRowsBySchool(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const schoolCode = row.schoolCode;
    if (!schoolCode) return;
    const displayName = resolveDisplayName(row.schoolName, schoolCode);
    const key = schoolGroupKey(displayName, schoolCode);

    if (!grouped.has(key)) {
      grouped.set(key, {
        schoolCode,
        schoolName: displayName,
        region: row.region,
        joiningYear: row.joiningYear,
        isIl: row.isIl,
        kits: [],
      });
    }

    grouped.get(key).kits.push({
      ...row,
      schoolName: displayName,
      schoolCode,
    });
  });

  return [...grouped.values()];
}

function loadPortalSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) return { byName: new Map() };
  const rows = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const byName = new Map();
  rows.forEach((row) => {
    const key = normalizeSchoolNameKey(row.name);
    if (key && row.code && isWizklubPortalLoginId(row.code)) {
      byName.set(key, row.code);
    }
  });
  return { byName };
}

function resolvePortalLoginId(schoolName, snapshot) {
  const displayName = resolveDisplayName(schoolName);
  const keys = [
    normalizeSchoolNameKey(displayName),
    normalizeSchoolNameKey(schoolName),
    normalizeSchoolNameKey(`Sri Chaitanya-${schoolName}`),
  ];
  for (const key of keys) {
    if (key && snapshot.byName.has(key)) return snapshot.byName.get(key);
  }
  return null;
}

function resolveDivisionName(school, divisionMap) {
  if (school.isIl) {
    const regionKey = clean(school.region);
    return IL_REGION_TO_DIVISION[regionKey] || 'IL School';
  }

  const nameKey = clean(resolveDisplayName(school.schoolName));
  for (const [city, division] of Object.entries(SC_CITY_TO_DIVISION)) {
    if (nameKey.includes(city)) return division;
  }
  return divisionMap.get('maharashtra')?.name || 'Maharashtra';
}

function formatSchoolRecordName(school) {
  const name = resolveDisplayName(school.schoolName, school.schoolCode);
  if (school.isIl || name.startsWith('Sri Chaitanya')) return name;
  return `Sri Chaitanya-${name}`;
}

function findSchool(allSchools, schoolCode, schoolName, portalLoginId = null) {
  const displayName = resolveDisplayName(schoolName, schoolCode);
  const prefixedName = schoolName.startsWith('Sri Chaitanya') ? displayName : `Sri Chaitanya-${displayName}`;

  if (portalLoginId) {
    const byPortal = allSchools.find((school) => school.wizklubSchoolId === portalLoginId);
    if (byPortal) return byPortal;
  }

  const byCodeAndName = allSchools.find(
    (school) => school.code === schoolCode && namesMatch(school.name, displayName),
  );
  if (byCodeAndName) return byCodeAndName;

  const byName = allSchools.find(
    (school) => namesMatch(school.name, displayName)
      || namesMatch(school.name, prefixedName)
      || normalizeSchoolNameKey(school.name) === normalizeSchoolNameKey(prefixedName),
  );
  if (byName) return byName;

  if (schoolCode.startsWith('SC-')) {
    const byScCohortName = allSchools.find(
      (school) => /^SC-\d{3}\/26(?:-|$)/.test(String(school.code || ''))
        && namesMatch(school.name, displayName),
    );
    if (byScCohortName) return byScCohortName;
  }

  if (schoolCode.startsWith('NSC-')) {
    const byIlCode = allSchools.find((school) => school.code === schoolCode);
    if (byIlCode) return byIlCode;
  }

  const byCode = allSchools.find((school) => school.code === schoolCode);
  if (byCode && namesMatch(byCode.name, displayName)) return byCode;

  const byCodeSuffix = allSchools.find(
    (school) => school.code.startsWith(`${schoolCode}-`) && namesMatch(school.name, displayName),
  );
  if (byCodeSuffix) return byCodeSuffix;

  return null;
}

async function resolveUniquePortalLoginId(portalLoginId, excludeSchoolId = null) {
  if (!portalLoginId) return null;
  const query = { wizklubSchoolId: portalLoginId };
  if (excludeSchoolId) query._id = { $ne: excludeSchoolId };
  const existing = await School.findOne(query).select('_id');
  return existing ? null : portalLoginId;
}

function uniqueSchoolCode(schoolCode, schoolName) {
  const slug = clean(schoolName).slice(0, 12).replace(/\s+/g, '-');
  return `${schoolCode}-${slug}`;
}

async function ensureSchool({
  school,
  allSchools,
  divisionMap,
  amLookup,
  snapshot,
}) {
  const portalLoginId = resolvePortalLoginId(school.schoolName, snapshot);
  let record = findSchool(allSchools, school.schoolCode, school.schoolName, portalLoginId);
  const divisionName = resolveDivisionName(school, divisionMap);
  const division = divisionMap.get(divisionName.toLowerCase()) || [...divisionMap.values()][0];
  const amUser = resolveAmUserFromHint(
    { state: school.region, region: divisionName },
    amLookup,
  );

  if (!record) {
    if (!COMMIT) {
      return { record: null, action: 'would_create' };
    }
    const codeInUse = await School.findOne({ code: school.schoolCode });
    const code = codeInUse
      ? uniqueSchoolCode(school.schoolCode, school.schoolName)
      : school.schoolCode;
    const safePortalLoginId = await resolveUniquePortalLoginId(portalLoginId);
    record = new School({
      name: formatSchoolRecordName(school),
      code,
      joiningYear: school.joiningYear,
      divisionId: division._id,
      contactEmail: amUser?.email || '',
      rmId: amUser?._id || null,
      address: school.region ? `${school.schoolName}, ${school.region}` : school.schoolName,
      wizklubRegionName: division.wizklubRegionName || division.name,
    });
    if (safePortalLoginId) {
      record.wizklubSchoolId = safePortalLoginId;
    } else {
      record.set('wizklubSchoolId', undefined);
    }
    await record.save();
    allSchools.push(record);
    return { record, action: 'created' };
  }

  const updates = {};
  if (record.joiningYear !== school.joiningYear) updates.joiningYear = school.joiningYear;
  if (portalLoginId && record.wizklubSchoolId !== portalLoginId) {
    const safePortalLoginId = await resolveUniquePortalLoginId(portalLoginId, record._id);
    if (safePortalLoginId) updates.wizklubSchoolId = safePortalLoginId;
  }
  if (amUser && String(record.rmId || '') !== String(amUser._id)) updates.rmId = amUser._id;
  if (!record.code.endsWith('/26') && !await School.findOne({ code: school.schoolCode, _id: { $ne: record._id } })) {
    updates.code = school.schoolCode;
  }

  if (Object.keys(updates).length > 0 && COMMIT) {
    await School.updateOne({ _id: record._id }, { $set: updates });
    Object.assign(record, updates);
  }

  return { record, action: Object.keys(updates).length ? 'updated' : 'matched' };
}

function applyUnacknowledgedDispatchState(dispatch, { quantity, componentId, adminUser, now }) {
  dispatch.componentId = componentId;
  dispatch.kitId = componentId;
  dispatch.quantity = quantity;
  dispatch.quantityInitial = quantity;
  dispatch.quantityDispatched = quantity;
  dispatch.quantityAcknowledged = 0;
  dispatch.quantityAffected = 0;
  dispatch.quantityReceived = undefined;
  dispatch.outstandingQuantity = quantity;
  dispatch.status = 'Dispatched';
  dispatch.category = 'New Dispatch';
  dispatch.dispatchedAt = dispatch.dispatchedAt || now;
  dispatch.dispatchedBy = dispatch.dispatchedBy || adminUser._id;
  dispatch.receivedAt = undefined;

  if (!dispatch.cycles?.length) {
    dispatchCycle.ensureInitialCycle(dispatch, {
      quantity,
      kitId: componentId,
      consignmentNo: dispatch.consignmentNo || '',
      category: 'New Dispatch',
      dispatchedAt: dispatch.dispatchedAt,
      dispatchedBy: dispatch.dispatchedBy,
    });
  } else {
    const cycle = dispatch.cycles.find((entry) => entry.movementType === 'INITIAL') || dispatch.cycles[0];
    cycle.quantityDispatched = quantity;
    cycle.quantityAcknowledged = 0;
    cycle.quantityAffected = 0;
    cycle.status = 'OPEN';
    cycle.kitId = componentId;
    cycle.acknowledgedAt = null;
    dispatchCycle.applyOrderTotals(dispatch);
    if (typeof dispatch.markModified === 'function') dispatch.markModified('cycles');
  }
}

async function upsertUnacknowledgedDispatch({
  school,
  kitDoc,
  quantity,
  adminUser,
}) {
  const schoolCode = school.code;
  const joiningYear = school.joiningYear || JOINING_YEAR;
  const componentId = formatComponentId({
    schoolCode,
    joiningYear,
    kitId: kitDoc.kitId,
    quantity,
  });

  let dispatch = await Dispatch.findOne({
    school: school._id,
    kit: kitDoc._id,
  }).sort({ createdAt: -1 });

  const now = new Date();
  const needsUpdate = !dispatch
    || dispatch.quantity !== quantity
    || dispatch.status !== 'Dispatched'
    || dispatch.quantityAcknowledged !== 0
    || dispatch.componentId !== componentId;

  if (!needsUpdate) {
    return { action: 'skipped', dispatch };
  }

  if (!COMMIT) {
    return { action: dispatch ? 'would_update' : 'would_create', componentId };
  }

  let created = false;
  if (dispatch) {
    applyUnacknowledgedDispatchState(dispatch, { quantity, componentId, adminUser, now });
    await dispatch.save();
  } else {
    created = true;
    const [dispatchId] = await generateUniqueDispatchIds(1);
    dispatch = await Dispatch.create({
      kit: kitDoc._id,
      quantity,
      school: school._id,
      reportingManager: school.rmId || null,
      componentId,
      kitId: componentId,
      consignmentNo: '',
      category: 'New Dispatch',
      status: 'Dispatched',
      dispatchedAt: now,
      dispatchedBy: adminUser._id,
      dispatchId,
      createdBy: adminUser._id,
      quantityInitial: quantity,
      quantityDispatched: quantity,
      quantityAcknowledged: 0,
      outstandingQuantity: quantity,
    });
    dispatchCycle.ensureInitialCycle(dispatch, {
      quantity,
      kitId: componentId,
      consignmentNo: '',
      category: 'New Dispatch',
      dispatchedAt: now,
      dispatchedBy: adminUser._id,
    });
    await dispatch.save();
  }

  await SchoolInventory.deleteOne({ school: school._id, kit: kitDoc._id });

  return { action: created ? 'created' : 'updated', dispatch };
}

async function main() {
  section('Pending 2026 school kit sync (not acknowledged)');
  log(`SC file: ${SC_XLSX_PATH}`);
  log(`IL file: ${IL_XLSX_PATH}`);
  log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN (use --commit to write)'}`);

  const { rows, schools, stats } = loadPendingDispatchRows();
  assertExpectedTotals(stats);

  const schoolsToSync = schools;
  const syncKits = stats.totalKits;

  log(`Loaded ${rows.length} kit row(s) across ${schools.length} school(s).`);
  log(`  SC: ${stats.scSchools} school(s), ${stats.scKits} kit(s)`);
  log(`  IL: ${stats.ilSchools} school(s), ${stats.ilKits} kit(s)`);
  log(`  Pending to sync:   ${schoolsToSync.length} school(s), ${syncKits} kit(s)`);

  const mongoUri = resolveInventoryMongoUri();
  if (!mongoUri) throw new Error('No MONGODB_URI / MONGO_URI found.');
  await mongoose.connect(mongoUri);

  if (COMMIT) {
    await syncKitCatalog({ prune: true });
  }

  const kits = await Kit.find({});
  const kitById = new Map(kits.map((kit) => [String(kit.kitId).toUpperCase(), kit]));
  const divisions = await Division.find({});
  const divisionMap = new Map(divisions.map((division) => [division.name.toLowerCase().trim(), division]));
  const snapshot = loadPortalSnapshot();
  const amLookup = await loadAmUserLookup();

  let adminUser = await User.findOne({ role: 'Admin' });
  if (!adminUser) adminUser = await User.findOne({});
  if (!adminUser) throw new Error('No user found for dispatch createdBy.');

  let allSchools = await School.find({});
  let schoolsCreated = 0;
  let schoolsUpdated = 0;
  let dispatchesCreated = 0;
  let dispatchesUpdated = 0;
  let dispatchesSkipped = 0;
  const unresolvedKitIds = new Set();

  section('Schools + unacknowledged dispatches');

  for (const schoolGroup of schoolsToSync) {
    const { record, action } = await ensureSchool({
      school: schoolGroup,
      allSchools,
      divisionMap,
      amLookup,
      snapshot,
    });

    if (action === 'created') schoolsCreated += 1;
    else if (action === 'updated') schoolsUpdated += 1;

    if (!record && !COMMIT) {
      log(`  [dry-run] Would create ${schoolGroup.schoolCode} — ${schoolGroup.schoolName}`);
      continue;
    }
    if (!record) continue;

    log(`  ${record.name} (${record.code}) — ${schoolGroup.kits.length} kit line(s)`);

    for (const kitRow of schoolGroup.kits) {
      const kitDoc = kitById.get(kitRow.kitId);
      if (!kitDoc) {
        unresolvedKitIds.add(kitRow.kitId);
        log(`    ⚠️  Unknown kit id: ${kitRow.kitId} (${kitRow.kitName})`);
        continue;
      }

      const result = await upsertUnacknowledgedDispatch({
        school: record,
        kitDoc,
        quantity: kitRow.quantity,
        adminUser,
      });

      if (result.action === 'created' || result.action === 'would_create') dispatchesCreated += 1;
      else if (result.action === 'updated' || result.action === 'would_update') dispatchesUpdated += 1;
      else dispatchesSkipped += 1;
    }
  }

  if (COMMIT) {
    const amResult = await syncOperationalAmsToDivisions();
    log(`  Division AM backfill: ${amResult.schoolsUpdated.length} division(s) updated`);
  }

  if (COMMIT) {
    const verifySchools = await School.find({});
    let verifiedPending = 0;
    for (const schoolGroup of schoolsToSync) {
      const record = findSchool(verifySchools, schoolGroup.schoolCode, schoolGroup.schoolName);
      if (!record) continue;
      const dispatches = await Dispatch.find({ school: record._id, status: 'Dispatched' }).lean();
      verifiedPending += dispatches.reduce((sum, dispatch) => sum + pendingAckKitsOnDispatch(dispatch), 0);
    }
    if (verifiedPending !== syncKits) {
      throw new Error(`Post-sync pending kit total ${verifiedPending} does not match expected ${syncKits}`);
    }
    log(`  Post-sync pending kits verified: ${verifiedPending}`);
  }

  section('Summary');
  log(`  Kit rows:              ${rows.length}`);
  log(`  Schools in sheet:      ${schoolsToSync.length}`);
  log(`  Schools created:       ${schoolsCreated}`);
  log(`  Schools updated:       ${schoolsUpdated}`);
  log(`  Dispatches created:    ${dispatchesCreated}`);
  log(`  Dispatches updated:    ${dispatchesUpdated}`);
  log(`  Dispatches unchanged:  ${dispatchesSkipped}`);
  log(`  Unresolved kit ids:    ${unresolvedKitIds.size}`);
  log(`  Pending kit total:     ${syncKits}`);
  log(`  Dispatch status:       Dispatched (not acknowledged)`);
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
  loadPendingDispatchRows,
  assertExpectedTotals,
  findSchool,
  resolveDisplayName,
  EXPECTED_SCHOOLS,
  EXPECTED_KITS,
};
