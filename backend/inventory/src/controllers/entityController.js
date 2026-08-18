const School = require('../models/School');
const Division = require('../models/Division');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const { encryptSecret, decryptSecret } = require('../utils/credentialSecret');
const { serializeAM } = require('../utils/amUser');
const { sendAccountManagerCredentialsEmail, sendSchoolCredentialsEmail, sendCredentialsEmailAsync } = require('../services/emailService');
const { getDivisionManager, getAmDivisions } = require('../utils/divisionManager');
const { normalizeBranchName, formatSchoolDisplayName } = require('../utils/schoolName');
const { preserveSchoolLoginId } = require('../utils/schoolCode');

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

function formatAM(user) {
  return serializeAM(user);
}

// --- DIVISION (no bundled AM) ---
const createDivision = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Division name is required' });
    }

    const existingDivision = await Division.findOne({ name: name.trim() });
    if (existingDivision) {
      return res.status(400).json({ message: 'Division with this name already exists' });
    }

    const division = await Division.create({
      name: name.trim(),
      description: description?.trim() || '',
    });

    res.status(201).json({ division });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateDivision = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const division = await Division.findById(id);
    if (!division) return res.status(404).json({ message: 'Division not found' });

    if (name?.trim()) division.name = name.trim();
    if (description !== undefined) division.description = description?.trim() || '';

    await division.save();

    const am = await getDivisionManager(division._id);
    const populated = await Division.findById(division._id).populate('regionalManagerId', 'name email');

    res.json({
      division: populated,
      accountManager: formatAM(am),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteDivision = async (req, res) => {
  try {
    const division = await Division.findById(req.params.id);
    if (!division) return res.status(404).json({ message: 'Division not found' });

    const schoolCount = await School.countDocuments({ divisionId: division._id });
    if (schoolCount > 0) {
      return res.status(400).json({ message: 'Cannot delete division with assigned schools' });
    }

    await Division.findByIdAndDelete(division._id);
    res.json({ message: 'Division deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- ACCOUNT MANAGER (AM) ---
const createAM = async (req, res) => {
  try {
    const { name, email, divisionId } = req.body;

    if (!name?.trim() || !email?.trim() || !divisionId) {
      return res.status(400).json({ message: 'AM name, email, and division are required' });
    }

    const division = await Division.findById(divisionId);
    if (!division) return res.status(400).json({ message: 'Division not found' });

    const existingAM = await getDivisionManager(divisionId);
    if (existingAM) {
      return res.status(400).json({ message: 'This division already has an Account Manager' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailTaken = await User.findOne({ email: normalizedEmail });
    if (emailTaken) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    const plainPassword = generateSecurePassword(12);
    const am = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await hashPassword(plainPassword),
      passwordEncrypted: encryptSecret(plainPassword),
      role: 'AM',
      divisionId: division._id,
    });

    division.regionalManagerId = am._id;
    await division.save();

    const assignedDivisions = await getAmDivisions(am);
    const emailResult = await sendCredentialsEmailAsync(() =>
      sendAccountManagerCredentialsEmail({
        to: am.email,
        name: am.name,
        password: plainPassword,
        divisionNames: assignedDivisions.map((d) => d.name),
        isRegenerated: false,
      })
    );

    res.status(201).json({
      accountManager: formatAM(am),
      generatedPassword: plainPassword,
      emailSent: emailResult.sent,
      emailNote: emailResult.reason || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateAM = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    const am = await User.findById(id);
    if (!am || am.role !== 'AM') {
      return res.status(404).json({ message: 'Account Manager not found' });
    }

    if (name?.trim()) am.name = name.trim();

    if (email?.trim()) {
      const normalized = email.trim().toLowerCase();
      if (normalized !== am.email) {
        const emailTaken = await User.findOne({ email: normalized, _id: { $ne: am._id } });
        if (emailTaken) {
          return res.status(400).json({ message: 'Another user already uses this email' });
        }
        am.email = normalized;
      }
    }

    await am.save();
    res.json(formatAM(am));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteAM = async (req, res) => {
  try {
    const am = await User.findById(req.params.id);
    if (!am || am.role !== 'AM') {
      return res.status(404).json({ message: 'Account Manager not found' });
    }

    const schools = await School.countDocuments({ rmId: am._id });
    if (schools > 0) {
      return res.status(400).json({ message: 'Cannot delete AM assigned to schools. Reassign schools first.' });
    }

    await Division.updateMany({ regionalManagerId: am._id }, { $set: { regionalManagerId: null } });
    await User.findByIdAndDelete(am._id);

    res.json({ message: 'Account Manager deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const regenerateAMPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const am = await User.findById(id);
    if (!am || am.role !== 'AM') {
      return res.status(404).json({ message: 'Account Manager not found' });
    }

    const assignedDivisions = await getAmDivisions(am);
    if (!assignedDivisions.length) {
      return res.status(400).json({ message: 'AM is not linked to a division' });
    }

    const plainPassword = generateSecurePassword(12);
    am.password = await hashPassword(plainPassword);
    am.passwordEncrypted = encryptSecret(plainPassword);
    await am.save();

    const emailResult = await sendCredentialsEmailAsync(() =>
      sendAccountManagerCredentialsEmail({
        to: am.email,
        name: am.name,
        password: plainPassword,
        divisionNames: assignedDivisions.map((d) => d.name),
        isRegenerated: true,
      })
    );

    res.json({
      accountManager: formatAM(am),
      generatedPassword: plainPassword,
      emailSent: emailResult.sent,
      emailNote: emailResult.reason || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAMPassword = async (req, res) => {
  try {
    const am = await User.findById(req.params.id).select('+passwordEncrypted');
    if (!am || am.role !== 'AM') {
      return res.status(404).json({ message: 'Account Manager not found' });
    }

    const password = decryptSecret(am.passwordEncrypted);
    if (!password) {
      return res.status(404).json({
        available: false,
        message: 'This password was set before admin viewing was enabled. Regenerate it to view going forward.',
      });
    }

    res.json({
      available: true,
      password,
      name: am.name,
      email: am.email,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Legacy RM endpoints removed — use /admin/ams only.

// --- SCHOOL CRUD ---
const createSchool = async (req, res) => {
  try {
    const {
      name, code, divisionId, address, contactEmail,
      wizklubSchoolId, wizklubRegionId, wizklubRegionName,
    } = req.body;
    const schoolLoginId = preserveSchoolLoginId(code);

    if (!name?.trim() || !schoolLoginId.trim() || !divisionId) {
      return res.status(400).json({ message: 'Branch name, unique school ID, and division are required' });
    }

    const branchName = normalizeBranchName(name);
    if (!branchName) {
      return res.status(400).json({ message: 'Branch name is required' });
    }

    const existingCode = await School.findOne({ code: schoolLoginId });
    if (existingCode) return res.status(400).json({ message: 'School with this code already exists' });

    const division = await Division.findById(divisionId);
    if (!division) return res.status(400).json({ message: 'Division not found' });

    const divisionAM = await getDivisionManager(divisionId);
    const normalizedEmail = contactEmail?.trim().toLowerCase() || null;

    const displayName = formatSchoolDisplayName(branchName);

    const school = await School.create({
      name: branchName,
      code: schoolLoginId,
      divisionId,
      address,
      ...(normalizedEmail ? { contactEmail: normalizedEmail } : {}),
      ...(divisionAM ? { rmId: divisionAM._id } : {}),
      ...(wizklubSchoolId ? { wizklubSchoolId: String(wizklubSchoolId).trim() } : {}),
      ...(wizklubRegionId != null ? { wizklubRegionId: Number(wizklubRegionId) } : {}),
      ...(wizklubRegionName ? { wizklubRegionName: String(wizklubRegionName).trim() } : {}),
    });

    let portalUser = null;
    let plainPassword = null;
    let emailSent = false;
    let emailNote = null;

    if (normalizedEmail) {
      plainPassword = generateSecurePassword(12);
      portalUser = await User.create({
        name: displayName,
        email: normalizedEmail,
        password: await hashPassword(plainPassword),
        role: 'School',
        schoolId: school._id,
      });

      const emailResult = await sendCredentialsEmailAsync(() =>
        sendSchoolCredentialsEmail({
          to: normalizedEmail,
          name: displayName,
          schoolName: displayName,
          schoolCode: school.code,
          password: plainPassword,
          isRegenerated: false,
        })
      );
      emailSent = emailResult.sent;
      emailNote = emailResult.reason || null;
    }

    res.status(201).json({
      school,
      portalUser: portalUser ? { _id: portalUser._id, email: portalUser.email } : null,
      generatedPassword: plainPassword,
      emailSent,
      emailNote,
      credentialsPending: !normalizedEmail,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, divisionId, address, contactEmail } = req.body;

    const school = await School.findById(id);
    if (!school) return res.status(404).json({ message: 'School not found' });

    if (code !== undefined) {
      const nextLoginId = preserveSchoolLoginId(code);
      if (!nextLoginId.trim()) {
        return res.status(400).json({ message: 'Unique school ID is required' });
      }
      if (nextLoginId !== school.code) {
        const existingCode = await School.findOne({ code: nextLoginId });
        if (existingCode) return res.status(400).json({ message: 'School code is already in use' });
        school.code = nextLoginId;
      }
    }

    const nextDivisionId = divisionId || school.divisionId;
    const divisionAM = await getDivisionManager(nextDivisionId);

    if (name !== undefined) {
      const branchName = normalizeBranchName(name);
      if (!branchName) {
        return res.status(400).json({ message: 'Branch name is required' });
      }
      school.name = branchName;
    }
    school.divisionId = nextDivisionId;
    school.address = address !== undefined ? address : school.address;
    if (contactEmail !== undefined) {
      const normalized = contactEmail?.trim().toLowerCase() || '';
      const previousEmail = school.contactEmail;
      school.contactEmail = normalized || undefined;
      if (normalized && normalized !== previousEmail) {
        await User.updateOne(
          { role: 'School', schoolId: school._id },
          { $set: { email: normalized, name: formatSchoolDisplayName(school.name) } }
        );
      }
    }

    school.rmId = divisionAM?._id || null;

    await school.save();

    const displayName = formatSchoolDisplayName(school.name);
    const portalUser = await User.findOne({ role: 'School', schoolId: school._id }).select('_id email');
    if (portalUser) {
      await User.updateOne(
        { role: 'School', schoolId: school._id },
        { $set: { name: displayName } }
      );
    }

    res.json({ school, portalUser: portalUser || null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const regenerateSchoolPassword = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });

    const normalizedEmail = school.contactEmail?.trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'School has no contact email for credential delivery' });
    }

    let schoolUser = await User.findOne({ role: 'School', schoolId: school._id });
    const plainPassword = generateSecurePassword(12);

    if (!schoolUser) {
      schoolUser = await User.create({
        name: formatSchoolDisplayName(school.name),
        email: normalizedEmail,
        password: await hashPassword(plainPassword),
        role: 'School',
        schoolId: school._id,
      });
    } else {
      if (schoolUser.email !== normalizedEmail) {
        schoolUser.email = normalizedEmail;
      }
      schoolUser.name = formatSchoolDisplayName(school.name);
      schoolUser.password = await hashPassword(plainPassword);
      await schoolUser.save();
    }

    const displayName = formatSchoolDisplayName(school.name);
    const emailResult = await sendCredentialsEmailAsync(() =>
      sendSchoolCredentialsEmail({
        to: normalizedEmail,
        name: displayName,
        schoolName: displayName,
        schoolCode: school.code,
        password: plainPassword,
        isRegenerated: true,
      })
    );

    res.json({
      school,
      portalUser: { _id: schoolUser._id, email: schoolUser.email },
      generatedPassword: plainPassword,
      emailSent: emailResult.sent,
      emailNote: emailResult.reason || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });

    await User.deleteOne({ role: 'School', schoolId: school._id });
    await School.findByIdAndDelete(school._id);
    res.json({ message: 'School deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createDivision,
  updateDivision,
  deleteDivision,
  createAM,
  updateAM,
  deleteAM,
  regenerateAMPassword,
  getAMPassword,
  createSchool,
  updateSchool,
  deleteSchool,
  regenerateSchoolPassword,
};
