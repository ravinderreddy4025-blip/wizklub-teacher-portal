const bcrypt = require('bcryptjs');
const Division = require('../models/Division');
const School = require('../models/School');
const User = require('../models/User');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const { encryptSecret } = require('../utils/credentialSecret');
const { OPERATIONAL_AM_BY_STATE, getOperationalAmHint } = require('./operationalSchoolList');

function normName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

function uniqueOperationalAms() {
  const byEmail = new Map();
  Object.values(OPERATIONAL_AM_BY_STATE).forEach((am) => {
    if (am?.email) byEmail.set(am.email.toLowerCase(), am);
  });
  return [...byEmail.entries()].map(([email, am]) => ({ ...am, email }));
}

/**
 * Create AM portal users from the operational spreadsheet roster (if missing).
 * Does not send credential emails — use Account Managers page to regenerate passwords.
 */
async function ensureOperationalAmUsers() {
  const roster = uniqueOperationalAms();
  const byEmail = new Map();
  const created = [];
  const existing = [];

  for (const entry of roster) {
    const normalizedEmail = entry.email.trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail, role: 'AM' });
    if (!user) {
      const plainPassword = generateSecurePassword(12);
      user = await User.create({
        name: entry.name,
        email: normalizedEmail,
        password: await hashPassword(plainPassword),
        passwordEncrypted: encryptSecret(plainPassword),
        role: 'AM',
      });
      created.push({ name: entry.name, email: normalizedEmail, generatedPassword: plainPassword });
    } else {
      existing.push({ name: user.name, email: user.email });
    }
    byEmail.set(normalizedEmail, user);
  }

  return { byEmail, created, existing };
}

function resolveAmHintForDivision(division) {
  return getOperationalAmHint({
    region: division.wizklubRegionName || division.name,
  });
}

/**
 * Link each WizKlub division to the operational AM via division.regionalManagerId.
 * The same AM user can cover multiple divisions (e.g. Aditi → Bengaluru + Maharashtra).
 */
async function syncOperationalAmsToDivisions() {
  const { byEmail, created, existing } = await ensureOperationalAmUsers();
  const divisions = await Division.find().lean();

  const assigned = [];
  const skipped = [];
  const schoolsUpdated = [];

  for (const division of divisions) {
    const hint = resolveAmHintForDivision(division);
    if (!hint?.email) {
      skipped.push({ divisionId: division._id, divisionName: division.name, reason: 'no_operational_am_mapping' });
      continue;
    }

    const am = byEmail.get(hint.email.toLowerCase());
    if (!am) {
      skipped.push({ divisionId: division._id, divisionName: division.name, reason: 'am_user_missing' });
      continue;
    }

    await Division.findByIdAndUpdate(division._id, { regionalManagerId: am._id });

    // Only one AM user may hold a given divisionId (unique index). Clear stale holders
    // when reassigning a division to the operational roster AM.
    await User.updateMany(
      { role: 'AM', divisionId: division._id, _id: { $ne: am._id } },
      { $set: { divisionId: null } },
    );

    if (!am.divisionId) {
      await User.findByIdAndUpdate(am._id, { divisionId: division._id });
      am.divisionId = division._id;
    }

    assigned.push({
      divisionId: division._id,
      divisionName: division.name,
      amName: am.name,
      amEmail: am.email,
    });

    const updateResult = await School.updateMany(
      { divisionId: division._id, $or: [{ rmId: null }, { rmId: { $exists: false } }] },
      { $set: { rmId: am._id } },
    );
    if (updateResult.modifiedCount > 0) {
      schoolsUpdated.push({
        divisionName: division.name,
        count: updateResult.modifiedCount,
      });
    }
  }

  return {
    amUsersCreated: created,
    amUsersExisting: existing,
    divisionsAssigned: assigned,
    divisionsSkipped: skipped,
    schoolsUpdated,
  };
}

async function loadAmUserLookup() {
  const users = await User.find({ role: 'AM' }).lean();
  const byEmail = new Map();
  const byName = new Map();
  users.forEach((user) => {
    byEmail.set(user.email.toLowerCase(), user);
    byName.set(normName(user.name), user);
  });
  return { byEmail, byName, users };
}

/**
 * Resolve an AM user from spreadsheet Account Manager name and/or state/region hints.
 */
function resolveAmUserFromHint({ amName, state, region } = {}, lookup) {
  if (!lookup) return null;
  if (amName) {
    const byName = lookup.byName.get(normName(amName));
    if (byName) return byName;
  }
  const hint = getOperationalAmHint({ state, region });
  if (hint?.email) return lookup.byEmail.get(hint.email.toLowerCase()) || null;
  return null;
}

module.exports = {
  ensureOperationalAmUsers,
  syncOperationalAmsToDivisions,
  loadAmUserLookup,
  resolveAmUserFromHint,
};
