const fs = require('fs');
const path = require('path');
const School = require('../models/School');
const Division = require('../models/Division');

const OVERRIDES_PATH = path.join(__dirname, '../../data/school-division-overrides.json');

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) {
    return [];
  }
  try {
    const rows = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('[schoolDivisionOverride] Failed to parse overrides JSON:', err.message);
    return [];
  }
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function findSchool(row) {
  const code = String(row.schoolCode || '').trim();
  if (code) {
    const byCode = await School.findOne({ code });
    if (byCode) return byCode;
  }

  const name = cleanName(row.schoolName);
  if (!name) return null;

  const candidates = await School.find({});
  return (
    candidates.find((school) => cleanName(school.name) === name)
    || candidates.find((school) => cleanName(school.name).includes(name) || name.includes(cleanName(school.name)))
    || null
  );
}

/**
 * Apply authoritative division overrides (e.g. Jaipur 4 → Rajasthan).
 * Runs on container start so prod self-heals after rebuild.
 */
async function syncSchoolDivisionOverrides() {
  const rows = loadOverrides();
  if (!rows.length) {
    return { checked: 0, updated: 0, skipped: 0, missing: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const row of rows) {
    const divisionName = String(row.divisionName || '').trim();
    if (!divisionName) continue;

    const division = await Division.findOne({
      name: { $regex: new RegExp(`^${divisionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (!division) {
      console.warn(`[schoolDivisionOverride] Division not found: ${divisionName}`);
      missing += 1;
      continue;
    }

    const school = await findSchool(row);
    if (!school) {
      console.warn(
        `[schoolDivisionOverride] School not found: ${row.schoolName || row.schoolCode || '(unknown)'}`,
      );
      missing += 1;
      continue;
    }

    const currentDivisionId = String(school.divisionId || '');
    const targetDivisionId = String(division._id);
    const regionName = division.wizklubRegionName || division.name;
    const needsUpdate =
      currentDivisionId !== targetDivisionId
      || (school.wizklubRegionName && school.wizklubRegionName !== regionName)
      || (division.wizklubRegionId && school.wizklubRegionId !== division.wizklubRegionId);

    if (!needsUpdate) {
      skipped += 1;
      continue;
    }

    school.divisionId = division._id;
    school.wizklubRegionName = regionName;
    if (division.wizklubRegionId) {
      school.wizklubRegionId = division.wizklubRegionId;
    }
    await school.save();
    updated += 1;
    console.log(
      `[schoolDivisionOverride] ${school.name} (${school.code}) → ${division.name}`,
    );
  }

  if (updated > 0) {
    console.log(`[schoolDivisionOverride] Applied ${updated} division override(s).`);
  }

  return { checked: rows.length, updated, skipped, missing };
}

module.exports = { syncSchoolDivisionOverrides, loadOverrides, OVERRIDES_PATH };
