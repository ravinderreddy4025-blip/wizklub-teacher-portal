const bcrypt = require('bcryptjs');
const School = require('../models/School');
const User = require('../models/User');
const Division = require('../models/Division');
const { preserveSchoolLoginId } = require('../utils/schoolCode');
const { normalizeBranchName, formatSchoolDisplayName } = require('../utils/schoolName');
const { getDivisionManager } = require('../utils/divisionManager');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const { hasRegionAssignment, resolveDivisionForSchool } = require('./wizklubRegionService');
const {
  buildSrSchoolIndex,
  findSrSchoolForWizklubApiSchool,
  resolveApiPortalLoginId,
} = require('./wizklubSchoolMappingService');
const { isWizklubPortalLoginId } = require('../utils/schoolIdentity');

function resolveFallbackEmail(wizklubSchool) {
  if (wizklubSchool.email?.trim()) {
    return wizklubSchool.email.trim().toLowerCase();
  }
  const fallback = process.env.WIZKLUB_SCHOOL_FALLBACK_EMAIL?.trim().toLowerCase();
  return fallback || null;
}

async function ensureSchoolPortalUser(school, displayName, normalizedEmail) {
  if (!normalizedEmail) {
    return { portalUser: null, generatedPassword: null, credentialsPending: true };
  }

  let portalUser = await User.findOne({ role: 'School', schoolId: school._id });
  let plainPassword = null;

  if (!portalUser) {
    plainPassword = generateSecurePassword(12);
    portalUser = await User.create({
      name: displayName,
      email: normalizedEmail,
      password: await bcrypt.hash(plainPassword, await bcrypt.genSalt(10)),
      role: 'School',
      schoolId: school._id,
    });
  }

  return {
    portalUser: portalUser ? { _id: portalUser._id, email: portalUser.email } : null,
    generatedPassword: plainPassword,
    credentialsPending: false,
  };
}

/**
 * Register or link a WizKlub API school.
 * - Excel SR school exists (SC-xxx/yy) → attach portal id + region/AM on same row
 * - No Excel match → create API-only school (portal id as code, no kits yet)
 */
async function registerWizklubSchool(wizklubSchool, {
  divisionId,
  contactEmail,
  srIndex = null,
} = {}) {
  const schoolLoginId = preserveSchoolLoginId(wizklubSchool.code || wizklubSchool.id);
  if (!schoolLoginId.trim()) {
    return { ok: false, reason: 'missing_code', message: 'School code is required' };
  }

  const portalLoginId = resolveApiPortalLoginId(wizklubSchool) || schoolLoginId;
  const wizklubSchoolId = String(wizklubSchool.id || wizklubSchool.code || portalLoginId);

  const byPortal = await School.findOne({ wizklubSchoolId: portalLoginId });
  if (byPortal) {
    return {
      ok: false,
      reason: 'already_registered',
      message: 'School already registered',
      code: portalLoginId,
    };
  }

  const byPortalCode = await School.findOne({
    code: new RegExp(`^${String(schoolLoginId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (byPortalCode && isWizklubPortalLoginId(byPortalCode.code)) {
    return {
      ok: false,
      reason: 'already_registered',
      message: 'School already registered',
      code: schoolLoginId,
    };
  }

  if (!divisionId) {
    return { ok: false, reason: 'missing_division', message: 'Division is required' };
  }

  const division = await Division.findById(divisionId);
  if (!division) {
    return { ok: false, reason: 'invalid_division', message: 'Division not found' };
  }

  const divisionAM = await getDivisionManager(divisionId);
  const normalizedEmail = (contactEmail || resolveFallbackEmail(wizklubSchool))?.trim().toLowerCase() || null;
  const branchName = normalizeBranchName(wizklubSchool.name);
  if (!branchName) {
    return { ok: false, reason: 'missing_name', message: 'School name is required' };
  }

  const displayName = formatSchoolDisplayName(branchName);
  const index = srIndex || buildSrSchoolIndex(await School.find({}));
  const srMatch = findSrSchoolForWizklubApiSchool(wizklubSchool, index);

  if (srMatch) {
    if (srMatch.wizklubSchoolId && srMatch.wizklubSchoolId !== portalLoginId) {
      return {
        ok: false,
        reason: 'portal_conflict',
        message: `SR school "${srMatch.name}" already linked to ${srMatch.wizklubSchoolId}`,
      };
    }

    const updates = {
      wizklubSchoolId: portalLoginId,
      divisionId,
      wizklubRegionId: wizklubSchool.region_id ?? division.wizklubRegionId ?? null,
      wizklubRegionName: wizklubSchool.region ?? division.wizklubRegionName ?? null,
      ...(divisionAM ? { rmId: divisionAM._id } : {}),
      ...(normalizedEmail ? { contactEmail: normalizedEmail } : {}),
    };

    await School.updateOne({ _id: srMatch._id }, { $set: updates });
    const school = await School.findById(srMatch._id);
    const userResult = await ensureSchoolPortalUser(school, displayName, normalizedEmail);

    return {
      ok: true,
      action: 'linked',
      school,
      srCode: school.code,
      portalLoginId,
      portalUser: userResult.portalUser,
      generatedPassword: userResult.generatedPassword,
      credentialsPending: userResult.credentialsPending,
    };
  }

  const school = await School.create({
    name: branchName,
    code: schoolLoginId,
    divisionId,
    ...(normalizedEmail ? { contactEmail: normalizedEmail } : {}),
    ...(divisionAM ? { rmId: divisionAM._id } : {}),
    wizklubSchoolId: portalLoginId,
    wizklubRegionId: wizklubSchool.region_id ?? division.wizklubRegionId ?? null,
    wizklubRegionName: wizklubSchool.region ?? division.wizklubRegionName ?? null,
  });

  const userResult = await ensureSchoolPortalUser(school, displayName, normalizedEmail);

  return {
    ok: true,
    action: 'created',
    school,
    srCode: null,
    portalLoginId,
    portalUser: userResult.portalUser,
    generatedPassword: userResult.generatedPassword,
    credentialsPending: userResult.credentialsPending,
  };
}

async function loadRegistrationIndex() {
  const schools = await School.find({}).lean();
  const registeredCodes = new Set(
    schools.map((school) => String(school.code || '').trim().toLowerCase()).filter(Boolean),
  );
  const registeredPortalIds = new Set(
    schools
      .map((school) => String(school.wizklubSchoolId || '').trim().toLowerCase())
      .filter((id) => isWizklubPortalLoginId(id)),
  );
  const srIndex = buildSrSchoolIndex(schools);
  return { registeredCodes, registeredPortalIds, srIndex };
}

async function bulkRegisterWizklubSchools(schools, {
  divisionLookup,
  amDivisionIds,
  registeredCodes,
  registeredPortalIds,
  srIndex,
  schoolIds = null,
} = {}) {
  const report = {
    registered: [],
    linked: [],
    skippedAlreadyRegistered: [],
    skippedNoRegion: [],
    skippedNoDivision: [],
    skippedNoAm: [],
    skippedNoEmail: [],
    failed: [],
  };

  const codes = registeredCodes || new Set();
  const portalIds = registeredPortalIds || new Set();
  const index = srIndex || buildSrSchoolIndex(await School.find({}));

  let candidates = schools.filter((s) => {
    if (!hasRegionAssignment(s)) return false;
    const portalId = String(resolveApiPortalLoginId(s) || s.code || s.id || '').trim().toLowerCase();
    const codeKey = String(s.code || s.id || '').trim().toLowerCase();
    if (portalIds.has(portalId)) return false;
    if (codes.has(codeKey)) return false;
    return true;
  });

  if (Array.isArray(schoolIds) && schoolIds.length > 0) {
    const idSet = new Set(schoolIds.map(String));
    candidates = candidates.filter((s) => idSet.has(String(s.id)) || idSet.has(String(s.code)));
  }

  for (const wizklubSchool of candidates) {
    const codeKey = String(wizklubSchool.code || wizklubSchool.id).trim().toLowerCase();
    const portalId = String(resolveApiPortalLoginId(wizklubSchool) || codeKey).trim().toLowerCase();

    if (!hasRegionAssignment(wizklubSchool)) {
      report.skippedNoRegion.push({ id: wizklubSchool.id, code: wizklubSchool.code, name: wizklubSchool.name });
      continue;
    }

    const division = resolveDivisionForSchool(wizklubSchool, divisionLookup);
    if (!division) {
      report.skippedNoDivision.push({
        id: wizklubSchool.id,
        code: wizklubSchool.code,
        name: wizklubSchool.name,
        region_id: wizklubSchool.region_id,
      });
      continue;
    }

    try {
      const result = await registerWizklubSchool(wizklubSchool, {
        divisionId: division._id,
        srIndex: index,
      });

      if (!result.ok) {
        if (result.reason === 'already_registered') {
          report.skippedAlreadyRegistered.push({ code: codeKey, name: wizklubSchool.name });
        } else {
          report.failed.push({ id: wizklubSchool.id, code: wizklubSchool.code, message: result.message });
        }
        continue;
      }

      portalIds.add(portalId);
      const entry = {
        id: wizklubSchool.id,
        code: result.portalLoginId,
        srCode: result.srCode || null,
        name: result.school.name,
        divisionId: String(division._id),
        credentialsPending: result.credentialsPending,
      };

      if (result.action === 'linked') {
        report.linked.push(entry);
      } else {
        report.registered.push(entry);
      }
    } catch (err) {
      report.failed.push({ id: wizklubSchool.id, code: wizklubSchool.code, message: err.message });
    }
  }

  return report;
}

module.exports = {
  registerWizklubSchool,
  bulkRegisterWizklubSchools,
  loadRegistrationIndex,
  resolveFallbackEmail,
};
