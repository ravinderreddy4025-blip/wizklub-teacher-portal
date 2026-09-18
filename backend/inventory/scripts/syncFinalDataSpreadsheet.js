/**
 * Sync schools + kit inventory from backend/inventory/data/FINAL_DATA.xlsx
 *
 * Usage:
 *   node scripts/syncFinalDataSpreadsheet.js              # dry-run
 *   node scripts/syncFinalDataSpreadsheet.js --commit     # write to DB
 *   node scripts/syncFinalDataSpreadsheet.js --file path  # custom xlsx path
 *
 * Columns used:
 *   A School ID (SC-xxx/yy)  → school.code + wizklubSchoolId + joiningYear
 *   B School Name            → match/create school
 *   C Region                 → division hint for new schools
 *   D Account Manager        → school.rmId (AM user) for new + existing schools
 *   J Kits Present           → "Kit Name (qty); ..." bulk dispatch per school
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
const {
  loadAmUserLookup,
  resolveAmUserFromHint,
  syncOperationalAmsToDivisions,
} = require('../src/services/operationalAmService');
const {
  resolvePortalLoginId,
} = require('../src/utils/schoolIdentity');

loadRootEnv();

const School = require('../src/models/School');
const Kit = require('../src/models/Kit');
const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');
const Division = require('../src/models/Division');
const User = require('../src/models/User');

const COMMIT = process.argv.includes('--commit');
const DEFAULT_XLSX = path.join(__dirname, '../data/FINAL_DATA.xlsx');
const fileArgIdx = process.argv.indexOf('--file');
const XLSX_PATH = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : DEFAULT_XLSX;

const BRANCH_ALIASES = {
  'intl bezawada': 'International Bezawada',
  'tadepalligudem cbse': 'Tadepalligudem',
  'kaggadsapura 3': 'Kaggadasapura 3',
  'kaggadasapura 2': 'Kaggadasapura 2',
  'kaggadasapura sanskriti': 'Kaggadasapura 2',
  'yellahanka': 'Yelahanka',
  'ballari school': 'Ballari',
  'raichur-3': 'Raichur 3',
  'new town': 'New Town 1',
  'new town 2': 'New Town\t2',
  'varthur': 'Future Pathways Global School Varthur',
  'international school': 'International School Vijayawada',
  'international school vijayawada': 'International School Vijayawada',
  'the future foundation school': 'The Future Foundation School',
  'ghaziabad': 'Ghaziabad 1',
  'coimbatore': 'Coimbatore 1',
  'hosur': 'Hosur 1',
  'tumkur': 'Tumkur 1',
  'ram murthy nagar': 'Ram Murthy Nagar 1',
  'marthahally': 'Marthahally 1',
  'marthahally 1': 'Marthahally 1',
  'nashik': 'Nashik 1',
  'aurangabad': 'Aurangabad 1',
  'rfcl ramagundam': 'Ramagundam',
  'dr.b.s rao vidya soudha mysore': 'Mysore',
  'hsr layout': 'HSR layout',
  'eluru cbse': 'Eluru CBSE',
  'chaitanyapuri cbse': 'Chaitanyapuri CBSE',
  'gundla pochampally cbse': 'Gundla Pochampally CBSE',
  'sindhanur': 'Sindhanur',
  'palavakkam': 'Pallavakkam',
};

const EXCEL_REGION_TO_DIVISION = {
  'andhra pradesh': 'Andhra Pradesh',
  bengaluru: 'Bengaluru',
  chennai: 'Tamil Nadu',
  maharashtra: 'Maharashtra',
  telangana: 'Telangana',
  'west bengal': 'West Bengal',
  'rest of karnataka': 'Karnataka',
  'rest of tamil nadu': 'Tamil Nadu',
  'il school': 'IL School',
};

const REST_OF_INDIA_CITY_DIVISION = {
  agra: 'Uttar Pradesh',
  bareilly: 'Uttar Pradesh',
  lucknow: 'Uttar Pradesh',
  muzaffarnagar: 'Uttar Pradesh',
  shamli: 'Uttar Pradesh',
  jaipur: 'Rajasthan',
  bikaner: 'Rajasthan',
  jodhpur: 'Rajasthan',
  ghaziabad: 'Delhi NCR',
  noida: 'Delhi NCR',
  gurugram: 'Delhi NCR',
  gurgaon: 'Delhi NCR',
  faridabad: 'Delhi NCR',
  delhi: 'Delhi NCR',
  karnal: 'Haryana',
  panipat: 'Haryana',
  ambala: 'Haryana',
  chandigarh: 'Punjab',
  jalandhar: 'Punjab',
  ludhiana: 'Punjab',
  mohali: 'Punjab',
  sunam: 'Punjab',
  malsian: 'Punjab',
  dhuri: 'Punjab',
  dehradun: 'Uttarakhand',
};

const KIT_NAME_ALIASES = {
  'futurz ldr sensor': 'Futurz LDR',
  'futurz sound sensor': 'Futurz Sound',
};

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').toLowerCase().trim();
}

function log(msg) {
  console.log(msg);
}

function section(title) {
  log(`\n${'='.repeat(70)}\n  ${title}\n${'='.repeat(70)}`);
}

function parseJoiningYear(schoolId) {
  const m = String(schoolId || '').match(/\/(\d{2})$/);
  if (!m) return null;
  return 2000 + Number(m[1]);
}

function loadSpreadsheetRows() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`Spreadsheet not found: ${XLSX_PATH}`);
  }
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rawRows.map((row) => {
    const keys = Object.keys(row);
    const schoolId = String(row['School ID'] || row[keys[0]] || '').trim();
    const name = String(row['School Name'] || row[keys[1]] || '').trim();
    const region = String(row.Region || row[keys[2]] || '').trim();
    const am = String(row['Account Manager'] || row[keys[3]] || '').trim();
    const kitsPresent = String(
      row['Kits Present (kit + max qty)'] || row[keys[keys.length - 1]] || '',
    ).trim();
    return { schoolId, name, region, am, kitsPresent };
  }).filter((r) => r.name);
}

function parseKitsPresent(raw) {
  if (!raw || raw === '(none)') return [];
  return raw
    .split(';')
    .map((part) => {
      const trimmed = part.trim();
      const m = trimmed.match(/^(.+?)\s*\((\d+)\)$/);
      if (!m) return null;
      return { name: m[1].trim(), quantity: Number(m[2]) };
    })
    .filter(Boolean);
}

function resolveBranchTargetName(branchName) {
  const key = clean(branchName);
  return BRANCH_ALIASES[key] || branchName;
}

function schoolNameMatchesBranch(school, normBranch) {
  const sn = clean(school.name);
  return sn === normBranch || sn === `sri chaitanya-${normBranch}`;
}

function findSchoolByName(allSchools, branchName, schoolId) {
  const targetName = resolveBranchTargetName(branchName);
  const normBranch = clean(targetName);
  const srCode = String(schoolId || '').trim();

  if (srCode) {
    const byCode = allSchools.filter((s) => clean(s.code) === clean(srCode));
    if (byCode.length === 1) return byCode[0];
    if (byCode.length > 1) return byCode[0];
    // Explicit SC code with no DB match — create a new school; do not merge by name.
    if (!srCode.startsWith('NSC-')) {
      return null;
    }
  }

  let match = allSchools.find((s) => clean(s.name) === `sri chaitanya-${normBranch}`);
  if (match) return match;

  match = allSchools.find((s) => clean(s.name) === normBranch);
  if (match) return match;

  if (srCode && !srCode.startsWith('NSC-')) {
    const byCode = allSchools.filter((s) => clean(s.code) === clean(srCode));
    const byCodeAndName = byCode.filter((s) => schoolNameMatchesBranch(s, normBranch));
    if (byCodeAndName.length === 1) return byCodeAndName[0];
    if (byCodeAndName.length > 1) {
      match = byCodeAndName.find((s) => clean(s.name).startsWith('sri chaitanya-'));
      if (match) return match;
      return byCodeAndName[0];
    }
  }

  return null;
}

function resolveDivisionName(row, divisionMap) {
  const regionKey = clean(row.region);
  const direct = EXCEL_REGION_TO_DIVISION[regionKey];
  if (direct) return direct;

  if (regionKey === 'rest of india') {
    const cityKey = clean(row.name).replace(/\s+\d+$/, '').split(' ')[0];
    const byCity = REST_OF_INDIA_CITY_DIVISION[cityKey];
    if (byCity) return byCity;
    return 'Delhi NCR';
  }

  const fallback = divisionMap.get(regionKey);
  return fallback?.name || 'Delhi NCR';
}

async function ensureDivision(divName, divisionMap) {
  const key = clean(divName);
  let divDoc = divisionMap.get(key);
  if (divDoc) return divDoc;

  divDoc = await Division.findOne({ name: divName });
  if (divDoc) {
    divisionMap.set(key, divDoc);
    return divDoc;
  }

  if (!COMMIT) return null;

  const count = await Division.countDocuments();
  divDoc = await Division.create({
    name: divName,
    description: 'Auto-created during FINAL_DATA sync',
    wizklubRegionId: 900000 + count + 1,
    wizklubRegionName: divName,
  });
  divisionMap.set(key, divDoc);
  return divDoc;
}

function resolveKitCatalogName(excelKitName) {
  const alias = KIT_NAME_ALIASES[clean(excelKitName)];
  return alias || String(excelKitName || '').trim();
}

function buildKitLookup(kits) {
  const byName = new Map();
  kits.forEach((kit) => {
    byName.set(clean(kit.name), kit);
  });
  return byName;
}

function resolveKitDoc(excelKitName, kitByName) {
  const catalogName = resolveKitCatalogName(excelKitName);
  let doc = kitByName.get(clean(catalogName));
  if (doc) return doc;

  doc = kitByName.get(clean(excelKitName));
  if (doc) return doc;

  for (const [nameKey, kit] of kitByName.entries()) {
    if (nameKey.includes(clean(catalogName)) || clean(catalogName).includes(nameKey)) {
      return kit;
    }
  }
  return null;
}

async function ensureWarehouseStock(requiredByKitId, kitById) {
  let updated = 0;
  for (const [kitId, requiredTotal] of requiredByKitId.entries()) {
    const kit = kitById.get(kitId);
    if (!kit) continue;
    const current = kit.warehouseQuantity || 0;
    if (current < requiredTotal) {
      log(`  Warehouse ${kitId} (${kit.name}): ${current} → ${requiredTotal}`);
      if (COMMIT) {
        await Kit.findByIdAndUpdate(kit._id, { $set: { warehouseQuantity: requiredTotal } });
        kit.warehouseQuantity = requiredTotal;
      }
      updated += 1;
    }
  }
  return updated;
}

async function assignSchoolCode(school, schoolId, joiningYear) {
  const updates = {};
  const previousCode = school.code;

  const portalLoginId = resolvePortalLoginId({
    code: school.code,
    wizklubSchoolId: school.wizklubSchoolId,
    previousCode,
  });
  if (portalLoginId && school.wizklubSchoolId !== portalLoginId) {
    updates.wizklubSchoolId = portalLoginId;
  }

  if (schoolId && !String(schoolId).startsWith('NSC-')) {
    const inUse = await School.findOne({ code: schoolId, _id: { $ne: school._id } });
    if (!inUse) {
      if (school.code !== schoolId) updates.code = schoolId;
    } else {
      log(`    ⚠️  Code ${schoolId} already used by "${inUse.name}" — keeping ${school.code} for "${school.name}"`);
    }
  } else if (schoolId && String(schoolId).startsWith('NSC-')) {
    const inUse = await School.findOne({ code: schoolId, _id: { $ne: school._id } });
    if (!inUse && school.code !== schoolId) {
      updates.code = schoolId;
    }
  }

  if (joiningYear && school.joiningYear !== joiningYear) {
    updates.joiningYear = joiningYear;
  }

  if (Object.keys(updates).length === 0) return false;
  if (COMMIT) {
    await School.updateOne({ _id: school._id }, { $set: updates });
    Object.assign(school, updates);
  }
  return true;
}

async function removeDuplicateDispatches(schoolId, kitId, keepDispatchId) {
  if (!COMMIT || !keepDispatchId) return 0;
  const result = await Dispatch.deleteMany({
    school: schoolId,
    kit: kitId,
    _id: { $ne: keepDispatchId },
  });
  return result.deletedCount || 0;
}

async function pruneOrphanSchoolKits(school, keptKitIds) {
  if (!COMMIT || !keptKitIds?.size) return { removedDispatches: 0, removedInventory: 0 };
  const kitIdArray = [...keptKitIds];
  const dispResult = await Dispatch.deleteMany({
    school: school._id,
    kit: { $nin: kitIdArray },
  });
  const invResult = await SchoolInventory.deleteMany({
    school: school._id,
    kit: { $nin: kitIdArray },
  });
  return {
    removedDispatches: dispResult.deletedCount || 0,
    removedInventory: invResult.deletedCount || 0,
  };
}

async function syncDispatchExcelQuantities(dispatch, quantity, componentId) {
  dispatch.componentId = componentId;
  dispatch.kitId = componentId;
  dispatch.quantity = quantity;
  dispatch.quantityReceived = quantity;
  dispatch.quantityInitial = quantity;
  dispatch.quantityDispatched = quantity;
  dispatch.quantityAcknowledged = quantity;
  dispatch.quantityAffected = 0;
  dispatch.outstandingQuantity = 0;
  dispatch.status = 'Completed';
  if (!dispatch.receivedAt) {
    dispatch.receivedAt = new Date();
  }

  if (dispatch.cycles?.length) {
    const initial = dispatch.cycles.find((cycle) => cycle.movementType === 'INITIAL') || dispatch.cycles[0];
    if (initial) {
      initial.quantityDispatched = quantity;
      initial.quantityAcknowledged = quantity;
      initial.quantityAffected = 0;
      initial.kitId = componentId;
      initial.status = 'ACKNOWLEDGED';
    }
    dispatchCycle.applyOrderTotals(dispatch);
    if (typeof dispatch.markModified === 'function') dispatch.markModified('cycles');
  }
}

async function upsertSchoolKitDispatch({
  school,
  schoolCode,
  joiningYear,
  kitDoc,
  quantity,
  adminUser,
}) {
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

  if (dispatch) {
    const initialCycle = dispatch.cycles?.find((cycle) => cycle.movementType === 'INITIAL') || dispatch.cycles?.[0];
    const cycleQty = initialCycle ? Number(initialCycle.quantityDispatched) : null;
    const changed =
      dispatch.quantity !== quantity
      || dispatch.componentId !== componentId
      || dispatch.quantityAcknowledged !== quantity
      || dispatch.status !== 'Completed'
      || (cycleQty != null && cycleQty !== quantity);
    if (!changed) {
      await SchoolInventory.findOneAndUpdate(
        { school: school._id, kit: kitDoc._id },
        { $set: { quantity } },
        { upsert: true },
      );
      await removeDuplicateDispatches(school._id, kitDoc._id, dispatch._id);
      return { action: 'skipped', dispatch };
    }

    if (COMMIT) {
      await syncDispatchExcelQuantities(dispatch, quantity, componentId);
      await dispatch.save();
      await SchoolInventory.findOneAndUpdate(
        { school: school._id, kit: kitDoc._id },
        { $set: { quantity } },
        { upsert: true },
      );
      await removeDuplicateDispatches(school._id, kitDoc._id, dispatch._id);
    }
    return { action: 'updated', dispatch };
  }

  if (!COMMIT) {
    return { action: 'would_create', componentId };
  }

  const [dispatchId] = await generateUniqueDispatchIds(1);
  const now = new Date();
  dispatch = await Dispatch.create({
    kit: kitDoc._id,
    quantity,
    school: school._id,
    reportingManager: school.rmId || null,
    componentId,
    kitId: componentId,
    consignmentNo: '',
    category: 'New Dispatch',
    status: 'Completed',
    dispatchedAt: now,
    dispatchedBy: adminUser._id,
    dispatchId,
    createdBy: adminUser._id,
    quantityReceived: quantity,
    quantityInitial: quantity,
    quantityDispatched: quantity,
    quantityAcknowledged: quantity,
    outstandingQuantity: 0,
    receivedAt: now,
  });

  dispatchCycle.ensureInitialCycle(dispatch, {
    quantity,
    kitId: componentId,
    consignmentNo: '',
    category: 'New Dispatch',
    dispatchedAt: now,
    dispatchedBy: adminUser._id,
  });
  await syncDispatchExcelQuantities(dispatch, quantity, componentId);
  dispatch.receivedAt = now;
  await dispatch.save();

  await SchoolInventory.findOneAndUpdate(
    { school: school._id, kit: kitDoc._id },
    { $set: { quantity } },
    { upsert: true },
  );

  await removeDuplicateDispatches(school._id, kitDoc._id, dispatch._id);

  const warehouseBefore = kitDoc.warehouseQuantity || 0;
  if (warehouseBefore >= quantity) {
    await Kit.findByIdAndUpdate(kitDoc._id, { $inc: { warehouseQuantity: -quantity } });
    kitDoc.warehouseQuantity = warehouseBefore - quantity;
  }

  return { action: 'created', dispatch };
}

async function main() {
  section('FINAL_DATA Spreadsheet Sync');
  log(`File: ${XLSX_PATH}`);
  log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN (use --commit to write)'}`);

  const rows = loadSpreadsheetRows();
  log(`Loaded ${rows.length} school row(s) from spreadsheet.`);

  const mongoUri = resolveInventoryMongoUri();
  if (!mongoUri) {
    throw new Error('No MONGODB_URI / MONGO_URI found.');
  }
  await mongoose.connect(mongoUri);
  log('Connected to MongoDB.');

  section('Phase 1: Kit catalog');
  if (COMMIT) {
    await syncKitCatalog({ prune: true });
  }
  const kits = await Kit.find({});
  const kitByName = buildKitLookup(kits);
  const kitById = new Map(kits.map((k) => [String(k.kitId).toUpperCase(), k]));
  log(`  Kits in DB: ${kits.length}`);

  section('Phase 2: Parse kit requirements');
  const requiredByKitId = new Map();
  const unresolvedKitNames = new Set();
  const parsedRows = rows.map((row) => {
    const kitsForRow = parseKitsPresent(row.kitsPresent);
    kitsForRow.forEach((entry) => {
      const kitDoc = resolveKitDoc(entry.name, kitByName);
      if (!kitDoc) {
        unresolvedKitNames.add(entry.name);
        return;
      }
      const kitId = String(kitDoc.kitId).toUpperCase();
      requiredByKitId.set(kitId, (requiredByKitId.get(kitId) || 0) + entry.quantity);
    });
    return { ...row, kitsForRow };
  });

  if (unresolvedKitNames.size > 0) {
    log(`  ⚠️  Unresolved kit names (${unresolvedKitNames.size}):`);
    [...unresolvedKitNames].sort().forEach((name) => log(`    - ${name}`));
  }

  section('Phase 3: Ensure warehouse stock');
  const warehouseUpdates = await ensureWarehouseStock(requiredByKitId, kitById);
  log(`  Warehouse top-ups planned/applied: ${warehouseUpdates}`);

  section('Phase 4: Schools — match, SC codes, kit dispatch');
  const divisions = await Division.find({});
  const divisionMap = new Map(divisions.map((d) => [d.name.toLowerCase().trim(), d]));
  let allSchools = await School.find({});

  let adminUser = await User.findOne({ role: 'Admin' });
  if (!adminUser) adminUser = await User.findOne({});
  if (!adminUser) {
    throw new Error('No user found for dispatch createdBy.');
  }
  log(`  Dispatch actor: ${adminUser.name}`);

  const amLookup = await loadAmUserLookup();
  let rmIdsUpdated = 0;

  async function syncSchoolRmId(school, row) {
    const divName = resolveDivisionName(row, divisionMap);
    const amUser = resolveAmUserFromHint(
      { amName: row.am, state: row.region, region: divName },
      amLookup,
    );
    if (!amUser) return false;
    if (school.rmId && String(school.rmId) === String(amUser._id)) return false;

    log(`  AM: ${school.name} → ${amUser.name}`);
    if (COMMIT) {
      await School.updateOne({ _id: school._id }, { $set: { rmId: amUser._id } });
      school.rmId = amUser._id;
    }
    rmIdsUpdated += 1;
    return true;
  }

  let schoolsCreated = 0;
  let codesUpdated = 0;
  let dispatchesCreated = 0;
  let dispatchesUpdated = 0;
  let dispatchesSkipped = 0;
  let orphansRemoved = 0;
  let schoolsNotMatched = [];
  const syncedSchoolIds = new Set();

  for (const row of parsedRows) {
    if (!row.kitsForRow.length) {
      continue;
    }

    let school = findSchoolByName(allSchools, row.name, row.schoolId);
    const joiningYear = parseJoiningYear(row.schoolId);

    if (!school && COMMIT) {
      const divName = resolveDivisionName(row, divisionMap);
      const divDoc = await ensureDivision(divName, divisionMap);
      if (!divDoc) {
        schoolsNotMatched.push(row);
        log(`  ❌ No division (dry-run): ${row.name} → ${divName}`);
        continue;
      }
      const amUser = resolveAmUserFromHint(
        { amName: row.am, state: row.region, region: divName },
        amLookup,
      );
      const schoolName = row.name.startsWith('Sri Chaitanya')
        ? row.name
        : `Sri Chaitanya-${resolveBranchTargetName(row.name)}`;

      school = await School.create({
        name: schoolName,
        code: row.schoolId || `TEMP-${clean(row.name).replace(/\s+/g, '-').slice(0, 24)}`,
        joiningYear,
        divisionId: divDoc._id,
        contactEmail: amUser?.email || '',
        rmId: amUser?._id || null,
        address: `${row.name}, ${row.region}`,
        wizklubRegionName: divDoc.wizklubRegionName || divDoc.name,
      });
      allSchools = await School.find({});
      schoolsCreated += 1;
      log(`  ✅ Created school: ${school.name} (${school.code}) → ${divName}`);
    } else if (!school) {
      schoolsNotMatched.push(row);
      log(`  ❌ No match: ${row.name} (${row.schoolId})`);
      continue;
    }

    const schoolCode = row.schoolId && !String(row.schoolId).startsWith('NSC-')
      ? row.schoolId
      : school.code;
    const codeChanged = await assignSchoolCode(school, row.schoolId, joiningYear);
    if (codeChanged) codesUpdated += 1;

    await syncSchoolRmId(school, row);
    syncedSchoolIds.add(String(school._id));

    if (!row.kitsForRow.length) {
      log(`  ${row.name}: no kits in spreadsheet — SC code only`);
      if (COMMIT) {
        const pruned = await pruneOrphanSchoolKits(school, new Set());
        if (pruned.removedDispatches || pruned.removedInventory) {
          orphansRemoved += pruned.removedDispatches;
          log(`    🧹 Cleared ${pruned.removedDispatches} dispatch(es), ${pruned.removedInventory} inventory row(s)`);
        }
      }
      continue;
    }

    const aggregatedKits = new Map();
    for (const entry of row.kitsForRow) {
      const kitDoc = resolveKitDoc(entry.name, kitByName);
      if (!kitDoc) {
        log(`    ⚠️  Unknown kit: ${entry.name}`);
        continue;
      }
      const kitKey = String(kitDoc._id);
      aggregatedKits.set(kitKey, {
        kitDoc,
        quantity: (aggregatedKits.get(kitKey)?.quantity || 0) + entry.quantity,
      });
    }

    log(`  ${row.name} (${schoolCode}): ${aggregatedKits.size} kit type(s)`);
    const keptKitIds = new Set();
    for (const { kitDoc, quantity } of aggregatedKits.values()) {
      keptKitIds.add(String(kitDoc._id));

      const result = await upsertSchoolKitDispatch({
        school,
        schoolCode,
        joiningYear: joiningYear || school.joiningYear,
        kitDoc,
        quantity,
        adminUser,
      });

      if (result.action === 'created' || result.action === 'would_create') dispatchesCreated += 1;
      else if (result.action === 'updated') dispatchesUpdated += 1;
      else dispatchesSkipped += 1;
    }

    const pruned = await pruneOrphanSchoolKits(school, keptKitIds);
    if (pruned.removedDispatches || pruned.removedInventory) {
      orphansRemoved += pruned.removedDispatches;
      log(`    🧹 Removed ${pruned.removedDispatches} orphan dispatch(es), ${pruned.removedInventory} inventory row(s)`);
    }
  }

  section('Phase 4b: Clear inventory on schools not referenced by spreadsheet');
  if (COMMIT) {
    for (const school of allSchools) {
      if (syncedSchoolIds.has(String(school._id))) continue;
      // 2026 combined cohort is managed by syncCombinedAcknowledgedSpreadsheet.js
      if (/^(NSC|SC)-\d+\/26$/i.test(String(school.code || ''))) continue;
      const pruned = await pruneOrphanSchoolKits(school, new Set());
      if (pruned.removedDispatches || pruned.removedInventory) {
        orphansRemoved += pruned.removedDispatches;
        log(`  🧹 ${school.name}: removed ${pruned.removedDispatches} dispatch(es), ${pruned.removedInventory} inventory row(s)`);
      }
    }
  } else {
    const untouched = allSchools.filter((s) => !syncedSchoolIds.has(String(s._id))).length;
    log(`  Would clear kit data from ${untouched} school(s) not matched to any spreadsheet row`);
  }

  section('Phase 5: Division AM backfill (schools without rmId)');
  let divisionAmResult = null;
  if (COMMIT) {
    divisionAmResult = await syncOperationalAmsToDivisions();
    log(`  Divisions assigned: ${divisionAmResult.divisionsAssigned.length}`);
    divisionAmResult.schoolsUpdated.forEach((entry) => {
      log(`  Backfilled ${entry.count} school(s) in ${entry.divisionName}`);
    });
    if (divisionAmResult.divisionsSkipped.length) {
      log(`  Divisions skipped: ${divisionAmResult.divisionsSkipped.length}`);
      divisionAmResult.divisionsSkipped.forEach((entry) => {
        log(`    - ${entry.divisionName}: ${entry.reason}`);
      });
    }
  } else {
    const missingRm = await School.countDocuments({ $or: [{ rmId: null }, { rmId: { $exists: false } }] });
    log(`  Would run division AM backfill for ${missingRm} school(s) without rmId`);
  }

  section('Summary');
  log(`  Spreadsheet rows:        ${rows.length}`);
  log(`  Schools created:         ${schoolsCreated}`);
  log(`  SC codes updated:        ${codesUpdated}`);
  log(`  AM (rmId) from Excel:    ${rmIdsUpdated}`);
  log(`  Dispatches created:      ${dispatchesCreated}`);
  log(`  Dispatches updated:      ${dispatchesUpdated}`);
  log(`  Dispatches unchanged:    ${dispatchesSkipped}`);
  log(`  Orphan rows removed:     ${orphansRemoved}`);
  log(`  Schools not matched:     ${schoolsNotMatched.length}`);
  if (schoolsNotMatched.length) {
    schoolsNotMatched.forEach((r) => log(`    - ${r.name} (${r.schoolId})`));
  }
  log(`  Unresolved kit names:    ${unresolvedKitNames.size}`);
  log(`  Mode:                    ${COMMIT ? 'COMMITTED' : 'DRY-RUN'}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
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
};
