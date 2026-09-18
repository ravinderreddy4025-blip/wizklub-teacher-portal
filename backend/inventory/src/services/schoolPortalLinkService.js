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

function escapeRegex(value) {
  return String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatSrCode(school) {
  if (!school?.code) return null;
  return isSpreadsheetSrCode(school.code) ? String(school.code).trim() : null;
}

async function findSchoolByDirectIdentifier(schoolId) {
  const id = String(schoolId || '').trim();
  if (!id) return null;

  const escaped = escapeRegex(id);
  const hit = await School.findOne({
    $or: [
      { code: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      { wizklubSchoolId: { $regex: new RegExp(`^${escaped}$`, 'i') } },
    ],
  });
  if (!hit) return null;

  const allSchools = await School.find({});
  const srIndex = buildSrSchoolIndex(allSchools);
  return resolveSrSchoolFromPortalHit(hit, srIndex);
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

    const branchName = wizklubBranchName || await fetchWizklubBranchName(id, wizklubTokens);
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
  findSchoolByDirectIdentifier,
  findSchoolByBranchName,
  findInventorySchoolByIdentifier,
  maybeLinkPortalLoginId,
  instructorCanAccessSchool,
  resolvePortalLoginId,
};
