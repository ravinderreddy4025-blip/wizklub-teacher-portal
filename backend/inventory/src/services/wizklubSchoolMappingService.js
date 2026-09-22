const fs = require('fs');
const path = require('path');
const School = require('../models/School');
const wizklubApi = require('./wizklubApiService');
const { wizklubSchoolNameToBranch } = require('../utils/schoolName');
const {
  isSpreadsheetSrCode,
  isWizklubPortalLoginId,
  normalizeSchoolNameKey,
} = require('../utils/schoolIdentity');

function resolvePortalLoginId(school) {
  const code = String(school?.code || '').trim();
  const wiz = String(school?.wizklubSchoolId || '').trim();
  if (isWizklubPortalLoginId(wiz)) return wiz;
  if (isWizklubPortalLoginId(code)) return code;
  return null;
}

function resolveApiPortalLoginId(apiSchool) {
  const code = String(apiSchool?.code || '').trim();
  const id = String(apiSchool?.id || '').trim();
  if (isWizklubPortalLoginId(code)) return code;
  if (isWizklubPortalLoginId(id)) return id;
  return null;
}

function schoolNameKeys(school) {
  const branch = wizklubSchoolNameToBranch(school?.name);
  const keys = new Set([
    normalizeSchoolNameKey(school?.name),
    normalizeSchoolNameKey(branch),
    normalizeSchoolNameKey(`Sri Chaitanya-${branch}`),
  ]);
  keys.delete('');
  return [...keys];
}

function apiNameKeys(apiSchool) {
  const keys = new Set([
    normalizeSchoolNameKey(apiSchool?.name),
    normalizeSchoolNameKey(wizklubSchoolNameToBranch(apiSchool?.name)),
  ]);
  keys.delete('');
  return [...keys];
}

function isSrInventorySchool(school) {
  return isSpreadsheetSrCode(school?.code);
}

function isPortalRecordSchool(school) {
  return Boolean(resolvePortalLoginId(school)) && !isSpreadsheetSrCode(school?.code);
}

/**
 * Index SR-code inventory schools by normalized branch name.
 */
function buildSrSchoolIndex(schools) {
  const byName = new Map();
  for (const school of schools) {
    if (!isSrInventorySchool(school)) continue;
    for (const key of schoolNameKeys(school)) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(school);
    }
  }
  return byName;
}

/**
 * Index legacy portal-login schools (beng0010) by normalized branch name.
 */
function buildPortalSchoolIndex(schools) {
  const byName = new Map();
  const byPortalId = new Map();

  for (const school of schools) {
    const portalLoginId = resolvePortalLoginId(school);
    if (!portalLoginId) continue;

    byPortalId.set(portalLoginId.toLowerCase(), school);
    for (const key of schoolNameKeys(school)) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({ school, portalLoginId });
    }
  }

  return { byName, byPortalId };
}

function pickUniqueMatch(matches) {
  if (!matches?.length) return null;
  if (matches.length === 1) return matches[0];
  return null;
}

/**
 * Find an Excel SR school that matches a WizKlub API school by branch name.
 */
function findSrSchoolForWizklubApiSchool(wizklubSchool, srIndex) {
  for (const key of apiNameKeys(wizklubSchool)) {
    const match = pickUniqueMatch(srIndex.get(key));
    if (match) return match;
  }
  return null;
}

/**
 * Match SR inventory school to a legacy portal school already stored in MongoDB.
 */
function matchSrSchoolToPortalRecord(srSchool, portalIndex) {
  for (const key of schoolNameKeys(srSchool)) {
    const match = pickUniqueMatch(portalIndex.byName.get(key));
    if (match) return match;
  }
  return null;
}

function matchInventorySchoolToApi(inventorySchool, apiIndex) {
  const candidates = new Map();

  for (const key of schoolNameKeys(inventorySchool)) {
    const matches = apiIndex.get(key) || [];
    for (const match of matches) {
      candidates.set(match.portalLoginId, match);
    }
  }

  if (candidates.size === 1) {
    return [...candidates.values()][0];
  }
  return null;
}

function buildApiSchoolIndex(apiSchools) {
  const byName = new Map();

  for (const apiSchool of apiSchools) {
    const portalLoginId = resolveApiPortalLoginId(apiSchool);
    if (!portalLoginId) continue;

    for (const key of apiNameKeys(apiSchool)) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({ ...apiSchool, portalLoginId });
    }
  }

  return byName;
}

/**
 * When lookup hits a legacy portal row, return the SR inventory row for the same branch.
 */
function resolveSrSchoolFromPortalHit(portalSchool, srIndex) {
  if (!portalSchool || isSrInventorySchool(portalSchool)) return portalSchool;

  for (const key of schoolNameKeys(portalSchool)) {
    const match = pickUniqueMatch(srIndex.get(key));
    if (match) return match;
  }

  return portalSchool;
}

/**
 * Link SR-code schools to portal login ids using data already in MongoDB.
 * No WizKlub admin credentials required.
 */
async function syncPortalMappingsFromDatabase({ commit = true, log = () => {} } = {}) {
  const allSchools = await School.find({}).sort({ name: 1 });
  const srSchools = allSchools.filter(isSrInventorySchool);
  const portalIndex = buildPortalSchoolIndex(allSchools);

  let linked = 0;
  let skipped = 0;
  let unmatched = 0;
  let conflicts = 0;
  const unmatchedSamples = [];

  for (const srSchool of srSchools) {
    const portalMatch = matchSrSchoolToPortalRecord(srSchool, portalIndex);
    if (!portalMatch) {
      unmatched += 1;
      if (unmatchedSamples.length < 8) {
        unmatchedSamples.push(`${srSchool.name} (${srSchool.code})`);
      }
      continue;
    }

    const portalLoginId = portalMatch.portalLoginId;
    if (srSchool.wizklubSchoolId === portalLoginId) {
      skipped += 1;
      continue;
    }

    const inUse = await School.findOne({
      wizklubSchoolId: portalLoginId,
      _id: { $ne: srSchool._id },
    });
    if (inUse && String(inUse._id) !== String(srSchool._id)) {
      const holderIsLegacyPortal = isPortalRecordSchool(inUse)
        && resolvePortalLoginId(inUse) === portalLoginId;
      if (holderIsLegacyPortal) {
        log(`  ↪ migrate portal ${portalLoginId}: "${inUse.name}" → "${srSchool.name}"`);
        if (commit) {
          await School.updateOne({ _id: inUse._id }, { $unset: { wizklubSchoolId: '' } });
        }
      } else {
        conflicts += 1;
        log(`  ⚠️  Portal id ${portalLoginId} already linked to "${inUse.name}" — skip "${srSchool.name}"`);
        continue;
      }
    }

    log(`  🔗 ${srSchool.name}: SR ${srSchool.code} ↔ portal ${portalLoginId}`);
    if (commit) {
      await School.updateOne(
        { _id: srSchool._id },
        { $set: { wizklubSchoolId: portalLoginId } },
      );
    }
    linked += 1;
  }

  return {
    ok: true,
    source: 'database',
    inventorySchools: srSchools.length,
    portalRecords: portalIndex.byPortalId.size,
    linked,
    skipped,
    unmatched,
    conflicts,
    unmatchedSamples,
  };
}

function loadPortalSnapshotRows() {
  const snapshotPath = path.join(__dirname, '../../data/school-portal-code-snapshot.json');
  if (!fs.existsSync(snapshotPath)) return [];

  try {
    const rows = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn('[wizklubSchoolMapping] Could not read portal snapshot:', err.message);
    return [];
  }
}

/**
 * Link SR schools using baked portal login snapshot (name → portal id).
 * Used after Excel rebuild removes legacy portal-only Mongo rows.
 */
async function syncPortalMappingsFromSnapshot({ commit = true, log = () => {} } = {}) {
  const snapshot = loadPortalSnapshotRows();
  if (!snapshot.length) return null;

  const inventorySchools = await School.find({ code: /^(SC|NSC)-\d+\/\d{2}$/i }).sort({ name: 1 });
  const srIndex = buildSrSchoolIndex(inventorySchools);

  let linked = 0;
  let skipped = 0;
  let unmatched = 0;
  let conflicts = 0;

  for (const row of snapshot) {
    const portalLoginId = resolveApiPortalLoginId({ code: row.code, id: row.code });
    if (!portalLoginId) continue;

    const branchKey = normalizeSchoolNameKey(wizklubSchoolNameToBranch(row.name));
    const srSchool = pickUniqueMatch(srIndex.get(branchKey));
    if (!srSchool) {
      unmatched += 1;
      continue;
    }

    if (srSchool.wizklubSchoolId === portalLoginId) {
      skipped += 1;
      continue;
    }

    const inUse = await School.findOne({
      wizklubSchoolId: portalLoginId,
      _id: { $ne: srSchool._id },
    });
    if (inUse) {
      conflicts += 1;
      continue;
    }

    log(`  🔗 snapshot ${srSchool.name}: SR ${srSchool.code} ↔ portal ${portalLoginId}`);
    if (commit) {
      await School.updateOne(
        { _id: srSchool._id },
        { $set: { wizklubSchoolId: portalLoginId } },
      );
    }
    linked += 1;
  }

  return {
    ok: true,
    source: 'snapshot',
    snapshotRows: snapshot.length,
    linked,
    skipped,
    unmatched,
    conflicts,
  };
}

/**
 * Optional fallback: link via WizKlub API when admin credentials are configured.
 */
async function syncPortalMappingsFromApi({ commit = true, log = () => {} } = {}) {
  const token = await wizklubApi.getServiceAdminAccessToken();
  if (!token) return null;

  const apiSchools = await wizklubApi.listAllSchools(token);
  const apiIndex = buildApiSchoolIndex(apiSchools);
  const inventorySchools = await School.find({ code: /^(SC|NSC)-\d+\/\d{2}$/i }).sort({ name: 1 });

  let linked = 0;
  let skipped = 0;
  let unmatched = 0;
  let conflicts = 0;

  for (const school of inventorySchools) {
    if (isWizklubPortalLoginId(school.wizklubSchoolId)) {
      skipped += 1;
      continue;
    }

    const apiMatch = matchInventorySchoolToApi(school, apiIndex);
    if (!apiMatch) {
      unmatched += 1;
      continue;
    }

    const portalLoginId = apiMatch.portalLoginId;
    if (school.wizklubSchoolId === portalLoginId) {
      skipped += 1;
      continue;
    }

    const inUse = await School.findOne({
      wizklubSchoolId: portalLoginId,
      _id: { $ne: school._id },
    });
    if (inUse) {
      conflicts += 1;
      continue;
    }

    log(`  🔗 API ${school.name}: SR ${school.code} ↔ portal ${portalLoginId}`);
    if (commit) {
      await School.updateOne(
        { _id: school._id },
        {
          $set: {
            wizklubSchoolId: portalLoginId,
            ...(apiMatch.region_id != null ? { wizklubRegionId: apiMatch.region_id } : {}),
            ...(apiMatch.region ? { wizklubRegionName: apiMatch.region } : {}),
          },
        },
      );
    }
    linked += 1;
  }

  return {
    ok: true,
    source: 'api',
    apiSchools: apiSchools.length,
    linked,
    skipped,
    unmatched,
    conflicts,
  };
}

/**
 * Link Excel SR codes to Teachers Portal login ids.
 * Uses existing MongoDB portal records first; API is optional.
 */
async function syncWizklubSchoolMappings({ commit = true, log = console.log } = {}) {
  const dbResult = await syncPortalMappingsFromDatabase({ commit, log });
  const snapshotResult = await syncPortalMappingsFromSnapshot({ commit, log });
  const apiResult = await syncPortalMappingsFromApi({ commit, log });

  return {
    ok: true,
    database: dbResult,
    snapshot: snapshotResult,
    api: apiResult,
  };
}

module.exports = {
  resolvePortalLoginId,
  resolveApiPortalLoginId,
  buildSrSchoolIndex,
  buildPortalSchoolIndex,
  buildApiSchoolIndex,
  matchSrSchoolToPortalRecord,
  matchInventorySchoolToApi,
  findSrSchoolForWizklubApiSchool,
  resolveSrSchoolFromPortalHit,
  syncPortalMappingsFromDatabase,
  syncPortalMappingsFromSnapshot,
  syncPortalMappingsFromApi,
  syncWizklubSchoolMappings,
};
