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
const {
  buildSrSchoolIndex,
  resolveSrSchoolFromPortalHit,
  resolvePortalLoginId,
} = require('./wizklubSchoolMappingService');

const PORTAL_SNAPSHOT_PATH = path.join(__dirname, '../../data/school-portal-code-snapshot.json');
let portalSnapshotByLoginId = null;

function loadPortalSnapshotByLoginId() {
  if (portalSnapshotByLoginId) return portalSnapshotByLoginId;

  portalSnapshotByLoginId = new Map();
  if (!fs.existsSync(PORTAL_SNAPSHOT_PATH)) return portalSnapshotByLoginId;

  try {
    const rows = JSON.parse(fs.readFileSync(PORTAL_SNAPSHOT_PATH, 'utf8'));
    for (const row of Array.isArray(rows) ? rows : []) {
      const loginId = String(row.code || row.id || '').trim().toLowerCase();
      const branch = wizklubSchoolNameToBranch(row.name);
      if (loginId && branch) portalSnapshotByLoginId.set(loginId, branch);
    }
  } catch (err) {
    console.warn('[schoolPortalLink] Could not read portal snapshot:', err.message);
  }

  return portalSnapshotByLoginId;
}

function findSnapshotBranchForPortalId(portalLoginId) {
  const key = String(portalLoginId || '').trim().toLowerCase();
  if (!key) return null;
  return loadPortalSnapshotByLoginId().get(key) || null;
}

function escapeRegex(value) {
  return String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveSchoolDisplayCodes(school, srIndex = null) {
  if (!school) {
    return { srCode: null, wizklubSchoolId: null };
  }

  const canonical = srIndex
    ? (resolveSrSchoolFromPortalHit(school, srIndex) || school)
    : school;

  const primaryCode = String(canonical.code || '').trim();
  const fallbackCode = String(school.code || '').trim();
  const wiz = String(canonical.wizklubSchoolId || school.wizklubSchoolId || '').trim();

  let srCode = null;
  for (const candidate of [primaryCode, fallbackCode, wiz]) {
    if (isSpreadsheetSrCode(candidate)) {
      srCode = candidate;
      break;
    }
  }

  let wizklubSchoolId = null;
  for (const candidate of [wiz, primaryCode, fallbackCode]) {
    if (isWizklubPortalLoginId(candidate)) {
      wizklubSchoolId = candidate;
      break;
    }
  }

  return { srCode, wizklubSchoolId };
}

function formatSrCode(school, srIndex = null) {
  return resolveSchoolDisplayCodes(school, srIndex).srCode;
}

async function findSchoolByDirectIdentifier(schoolId) {
  const id = String(schoolId || '').trim();
  if (!id) return null;

  const escaped = escapeRegex(id);
  const hits = await School.find({
    $or: [
      { code: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      { wizklubSchoolId: { $regex: new RegExp(`^${escaped}$`, 'i') } },
    ],
  });
  if (!hits.length) return null;

  const allSchools = await School.find({});
  const srIndex = buildSrSchoolIndex(allSchools);

  const srHit = hits.find((row) => isSpreadsheetSrCode(row.code));
  if (srHit) return srHit;

  return resolveSrSchoolFromPortalHit(hits[0], srIndex);
}

async function findSchoolByBranchName(branchName) {
  const key = normalizeSchoolNameKey(branchName);
  if (!key) return null;

  const schools = await School.find({});
  const srIndex = buildSrSchoolIndex(schools);
  const match = srIndex.get(key);
  if (match?.length === 1) return match[0];

  return schools.find((school) => {
    const candidates = [
      school.name,
      wizklubSchoolNameToBranch(school.name),
      `Sri Chaitanya-${wizklubSchoolNameToBranch(school.name)}`,
    ];
    return candidates.some((name) => normalizeSchoolNameKey(name) === key);
  }) || null;
}

async function fetchWizklubBranchName(schoolId, wizklubTokens = []) {
  const tokens = (Array.isArray(wizklubTokens) ? wizklubTokens : [wizklubTokens]).filter(Boolean);
  for (const token of tokens) {
    try {
      const details = await wizklubApi.getSchoolDetails(schoolId, token);
      const parsed = wizklubApi.parseSchoolDetailsResponse(details, schoolId);
      const branch = wizklubSchoolNameToBranch(parsed.name);
      if (branch) return branch;
    } catch {
      // try next token
    }
  }
  return null;
}

async function maybeLinkPortalLoginId(school, portalLoginId, { commit = true } = {}) {
  if (!school?._id || !isWizklubPortalLoginId(portalLoginId)) return school;
  if (school.wizklubSchoolId === portalLoginId) return school;

  const inUse = await School.findOne({
    wizklubSchoolId: portalLoginId,
    _id: { $ne: school._id },
  });
  if (inUse) return school;

  if (commit) {
    await School.updateOne({ _id: school._id }, { $set: { wizklubSchoolId: portalLoginId } });
    school.wizklubSchoolId = portalLoginId;
  }
  return school;
}

/**
 * Resolve an inventory school from portal login id (beng0010) or SR code (SC-098/22).
 */
async function findInventorySchoolByIdentifier(schoolId, {
  wizklubTokens = [],
  wizklubBranchName = null,
  commitLink = true,
} = {}) {
  const id = String(schoolId || '').trim();
  if (!id) return null;

  if (isSpreadsheetSrCode(id)) {
    return findSchoolByDirectIdentifier(id);
  }

  if (isWizklubPortalLoginId(id)) {
    let school = await findSchoolByDirectIdentifier(id);
    if (school) {
      return maybeLinkPortalLoginId(school, id, { commit: commitLink });
    }

    const branchName = wizklubBranchName
      || findSnapshotBranchForPortalId(id)
      || await fetchWizklubBranchName(id, wizklubTokens);
    if (branchName) {
      school = await findSchoolByBranchName(branchName);
      if (school) {
        return maybeLinkPortalLoginId(school, id, { commit: commitLink });
      }
    }
  }

  return findSchoolByDirectIdentifier(id);
}

async function instructorCanAccessSchool(decoded, school, options = {}) {
  if (!school) return false;

  const tokens = [decoded?.wizklubToken, ...(options.wizklubTokens || [])].filter(Boolean);
  const linkOptions = { wizklubTokens: tokens, commitLink: options.commitLink !== false };

  for (const schoolId of decoded?.schoolIds || []) {
    const resolved = await findInventorySchoolByIdentifier(schoolId, linkOptions);
    if (resolved && String(resolved._id) === String(school._id)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  formatSrCode,
  resolveSchoolDisplayCodes,
  buildSrSchoolIndex,
  findSchoolByDirectIdentifier,
  findSchoolByBranchName,
  findInventorySchoolByIdentifier,
  maybeLinkPortalLoginId,
  instructorCanAccessSchool,
  resolvePortalLoginId,
};
