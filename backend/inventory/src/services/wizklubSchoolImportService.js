const bcrypt = require('bcryptjs');
const School = require('../models/School');
const User = require('../models/User');
const Division = require('../models/Division');
const { preserveSchoolLoginId } = require('../utils/schoolCode');
const { normalizeBranchName, formatSchoolDisplayName } = require('../utils/schoolName');
const { getDivisionManager } = require('../utils/divisionManager');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const { hasRegionAssignment, resolveDivisionForSchool } = require('./wizklubRegionService');

function resolveFallbackEmail(wizklubSchool) {
  if (wizklubSchool.email?.trim()) {
    return wizklubSchool.email.trim().toLowerCase();
  }
  const fallback = process.env.WIZKLUB_SCHOOL_FALLBACK_EMAIL?.trim().toLowerCase();
  return fallback || null;
}

async function registerWizklubSchool(wizklubSchool, {
  divisionId,
  contactEmail,
} = {}) {
  const schoolLoginId = preserveSchoolLoginId(wizklubSchool.code || wizklubSchool.id);
  if (!schoolLoginId.trim()) {
    return { ok: false, reason: 'missing_code', message: 'School code is required' };
  }

  const wizklubSchoolId = String(wizklubSchool.id || wizklubSchool.code || schoolLoginId);
  const existing = await School.findOne({
    $or: [{ code: schoolLoginId }, { wizklubSchoolId }],
  });
  if (existing) {
    return { ok: false, reason: 'already_registered', message: 'School already registered', code: schoolLoginId };
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

  const school = await School.create({
    name: branchName,
    code: schoolLoginId,
    divisionId,
    ...(normalizedEmail ? { contactEmail: normalizedEmail } : {}),
    ...(divisionAM ? { rmId: divisionAM._id } : {}),
    wizklubSchoolId,
    wizklubRegionId: wizklubSchool.region_id ?? division.wizklubRegionId ?? null,
    wizklubRegionName: wizklubSchool.region ?? division.wizklubRegionName ?? null,
  });

  let portalUser = null;
  let plainPassword = null;

  if (normalizedEmail) {
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
    ok: true,
    school,
    portalUser: portalUser ? { _id: portalUser._id, email: portalUser.email } : null,
    generatedPassword: plainPassword,
    credentialsPending: !normalizedEmail,
  };
}

async function bulkRegisterWizklubSchools(schools, {
  divisionLookup,
  amDivisionIds,
  registeredCodes,
  schoolIds = null,
  fallbackEmailOnly = false,
} = {}) {
  const report = {
    registered: [],
    skippedAlreadyRegistered: [],
    skippedNoRegion: [],
    skippedNoDivision: [],
    skippedNoAm: [],
    skippedNoEmail: [],
    failed: [],
  };

  let candidates = schools.filter((s) => hasRegionAssignment(s) && !registeredCodes.has(String(s.code || s.id).trim().toLowerCase()));

  if (Array.isArray(schoolIds) && schoolIds.length > 0) {
    const idSet = new Set(schoolIds.map(String));
    candidates = candidates.filter((s) => idSet.has(String(s.id)) || idSet.has(String(s.code)));
  }

  for (const wizklubSchool of candidates) {
    const codeKey = String(wizklubSchool.code || wizklubSchool.id).trim().toLowerCase();

    if (!hasRegionAssignment(wizklubSchool)) {
      report.skippedNoRegion.push({ id: wizklubSchool.id, code: wizklubSchool.code, name: wizklubSchool.name });
      continue;
    }

    const division = resolveDivisionForSchool(wizklubSchool, divisionLookup);

    if (!division) {
      report.skippedNoDivision.push({ id: wizklubSchool.id, code: wizklubSchool.code, name: wizklubSchool.name, region_id: wizklubSchool.region_id });
      continue;
    }

    const divisionId = String(division._id);

    try {
      const result = await registerWizklubSchool(wizklubSchool, { divisionId: division._id });
      if (!result.ok) {
        if (result.reason === 'already_registered') {
          report.skippedAlreadyRegistered.push({ code: codeKey, name: wizklubSchool.name });
        } else if (result.reason === 'no_email') {
          report.skippedNoEmail.push({ id: wizklubSchool.id, code: wizklubSchool.code, name: wizklubSchool.name });
        } else if (result.reason === 'no_am') {
          report.skippedNoAm.push({ id: wizklubSchool.id, code: wizklubSchool.code, name: wizklubSchool.name, divisionName: result.divisionName });
        } else {
          report.failed.push({ id: wizklubSchool.id, code: wizklubSchool.code, message: result.message });
        }
        continue;
      }
      report.registered.push({
        id: wizklubSchool.id,
        code: result.school.code,
        name: result.school.name,
        divisionId,
        credentialsPending: result.credentialsPending,
      });
    } catch (err) {
      report.failed.push({ id: wizklubSchool.id, code: wizklubSchool.code, message: err.message });
    }
  }

  return report;
}

module.exports = {
  registerWizklubSchool,
  bulkRegisterWizklubSchools,
  resolveFallbackEmail,
};
