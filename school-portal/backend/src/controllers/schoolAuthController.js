const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { models, services, utils } = require('../../core');
const {
  generateInstructorSession,
  verifyInstructorSession,
  readInstructorToken,
} = require('../utils/instructorAuth');

const { User, School } = models;
const wizklubApi = services.wizklubApi;
const {
  formatSrCode,
  findInventorySchoolByIdentifier,
  instructorCanAccessSchool,
} = services.schoolPortalLink;
const {
  preserveSchoolLoginId,
  wizklubSchoolNameToBranch,
  formatSchoolDisplayName,
  generateSecurePassword,
} = utils;

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

async function hashPassword(plain) {
  return bcrypt.hash(plain, await bcrypt.genSalt(10));
}

async function ensureSchoolPortalUser(school) {
  const existing = await User.findOne({ role: 'School', schoolId: school._id });
  if (existing) return existing;

  const email = school.contactEmail?.trim().toLowerCase()
    || `school.${String(school.code).trim().toLowerCase().replace(/[^a-z0-9]/gi, '_')}@portal.local`;

  return User.create({
    name: formatSchoolDisplayName(school.name),
    email,
    password: await hashPassword(generateSecurePassword(24)),
    role: 'School',
    schoolId: school._id,
  });
}

const authSchoolUser = async (_req, res) => {
  return res.status(403).json({
    message: 'School ID login is no longer available. Sign in with your instructor (teacher) account.',
  });
};

const authInstructor = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const wizklubData = await wizklubApi.instructorLogin(username.trim(), password);
    const parsed = wizklubApi.parseInstructorLoginResponse(wizklubData);

    if (!parsed.hasInstructorRole) {
      return res.status(403).json({ message: 'This account is not an instructor account' });
    }

    if (!parsed.schoolIds.length) {
      return res.status(403).json({ message: 'No schools are linked to this instructor account' });
    }

    const instructorToken = generateInstructorSession(parsed);

    res.json({
      instructorToken,
      schoolIds: parsed.schoolIds,
      instructorName: parsed.instructorName || parsed.username || username.trim(),
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Instructor login failed',
    });
  }
};

async function buildInstructorSchoolList(decoded) {
  let serviceAdminToken = null;
  try {
    serviceAdminToken = await wizklubApi.getServiceAdminAccessToken();
  } catch {
    serviceAdminToken = null;
  }

  const tokens = [decoded.wizklubToken, serviceAdminToken].filter(Boolean);

  const schools = await Promise.all(
    (decoded.schoolIds || []).map(async (schoolId) => {
      let displayName = null;
      let wizklubBranchName = null;
      let wizklubError = null;

      for (const token of tokens) {
        try {
          const details = await wizklubApi.getSchoolDetails(schoolId, token);
          const parsed = wizklubApi.parseSchoolDetailsResponse(details, schoolId);
          const branch = wizklubSchoolNameToBranch(parsed.name);
          if (branch) {
            displayName = branch;
            wizklubBranchName = branch;
            wizklubError = null;
            break;
          }
        } catch (err) {
          if (!wizklubError) wizklubError = err.message;
        }
      }

      const localSchool = await findInventorySchoolByIdentifier(schoolId, {
        wizklubTokens: tokens,
        wizklubBranchName,
        commitLink: true,
      });

      const srCode = formatSrCode(localSchool);
      const wizklubSchoolId = localSchool?.wizklubSchoolId || schoolId;
      const portalLoginId = localSchool?.wizklubSchoolId || schoolId;

      return {
        schoolId,
        wizklubSchoolId,
        srCode,
        name: displayName
          || (localSchool?.name ? wizklubSchoolNameToBranch(localSchool.name) : schoolId),
        schoolCode: portalLoginId,
        localSchoolId: localSchool?._id || null,
        hasInventory: Boolean(localSchool),
        wizklubError,
      };
    }),
  );

  return {
    instructorName: decoded.instructorName,
    schools,
  };
}

async function openInstructorSchool(decoded, schoolCode, instructorToken = null) {
  const loginId = preserveSchoolLoginId(schoolCode || decoded.schoolId);

  if (!loginId.trim()) {
    const error = new Error('School ID is required');
    error.status = 400;
    throw error;
  }

  let serviceAdminToken = null;
  try {
    serviceAdminToken = await wizklubApi.getServiceAdminAccessToken();
  } catch {
    serviceAdminToken = null;
  }

  const tokens = [decoded.wizklubToken, serviceAdminToken].filter(Boolean);
  const school = await findInventorySchoolByIdentifier(loginId, {
    wizklubTokens: tokens,
    commitLink: true,
  });

  if (!school) {
    const error = new Error(`School "${loginId}" is not registered in the inventory system. Contact your admin team.`);
    error.status = 404;
    throw error;
  }

  const hasAccess = await instructorCanAccessSchool(decoded, school, {
    wizklubTokens: tokens,
    commitLink: true,
  });

  if (!hasAccess) {
    const error = new Error('You do not have access to this school');
    error.status = 403;
    throw error;
  }

  const user = await ensureSchoolPortalUser(school);

  return {
    _id: user._id,
    name: school.name,
    email: user.email,
    role: user.role,
    schoolCode: school.wizklubSchoolId || formatSrCode(school) || school.code,
    srCode: formatSrCode(school),
    wizklubSchoolId: school.wizklubSchoolId || decoded.schoolId || null,
    loginType: 'instructor',
    instructorName: decoded.instructorName,
    instructorToken,
    token: generateToken(user._id),
  };
}

const getInstructorSchools = async (req, res) => {
  try {
    const instructorToken = readInstructorToken(req);
    const decoded = verifyInstructorSession(instructorToken);
    res.json(await buildInstructorSchoolList(decoded));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const selectInstructorSchool = async (req, res) => {
  try {
    const instructorToken = readInstructorToken(req);
    const decoded = verifyInstructorSession(instructorToken);
    const schoolCode = preserveSchoolLoginId(req.body.schoolCode || req.body.schoolId);
    res.json(await openInstructorSchool(decoded, schoolCode, instructorToken));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

/** Trusted bridge from WizKlub Teachers Portal (same instructor login, no second sign-in). */
const bridgeTeacherSchools = async (req, res) => {
  try {
    const schoolIds = Array.isArray(req.body.schoolIds) ? req.body.schoolIds : [];
    if (!schoolIds.length) {
      return res.json({
        schools: [],
        instructorName: req.body.instructorName || req.body.userId || 'Instructor',
      });
    }

    const decoded = {
      schoolIds,
      wizklubToken: req.body.wizklubToken || null,
      instructorName: req.body.instructorName || req.body.userId || 'Instructor',
    };

    res.json(await buildInstructorSchoolList(decoded));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const bridgeTeacherSelectSchool = async (req, res) => {
  try {
    const schoolIds = Array.isArray(req.body.schoolIds) ? req.body.schoolIds : [];
    const decoded = {
      schoolIds,
      wizklubToken: req.body.wizklubToken || null,
      instructorName: req.body.instructorName || req.body.userId || 'Instructor',
    };
    const schoolCode = preserveSchoolLoginId(req.body.schoolCode || req.body.schoolId);
    res.json(await openInstructorSchool(decoded, schoolCode, null));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  authSchoolUser,
  authInstructor,
  getInstructorSchools,
  selectInstructorSchool,
  bridgeTeacherSchools,
  bridgeTeacherSelectSchool,
  ensureSchoolPortalUser,
};
