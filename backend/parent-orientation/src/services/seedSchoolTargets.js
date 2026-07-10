const { SCHOOL_TARGET_SEEDS } = require('../config/schoolTargetSeeds');
const { MONGODB_DB } = require('../config/env');
const { upsertTargetsForMonth } = require('../models/targetModel');
const { mongo } = require('./mongo');

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Insert default targets for seeded schools when missing for the given month.
 * Does not overwrite targets Sales Admin has already saved.
 */
async function seedSchoolTargetsForMonth(month = currentMonthKey()) {
  if (!mongo.client || !mongo.ready) return { month, inserted: 0 };

  const coll = mongo.client.db(MONGODB_DB).collection('school_targets');
  const toInsert = [];

  for (const row of SCHOOL_TARGET_SEEDS) {
    const id = `${month}:${row.region}:${row.branch}`;
    const existing = await coll.findOne({ _id: id });
    if (existing) continue;
    toInsert.push({
      month,
      region: row.region,
      branch: row.branch,
      target_scheduled: 0,
      target_completed: row.target_completed,
    });
  }

  if (!toInsert.length) return { month, inserted: 0 };

  await upsertTargetsForMonth(month, toInsert);
  return { month, inserted: toInsert.length };
}

async function seedSchoolTargets() {
  try {
    const result = await seedSchoolTargetsForMonth();
    if (result.inserted > 0) {
      console.log(
        `[School targets] Seeded ${result.inserted} default target(s) for ${result.month}.`,
      );
    }
    return result;
  } catch (err) {
    console.error('[School targets] Seed failed:', err && err.message ? err.message : err);
    return { month: currentMonthKey(), inserted: 0, error: true };
  }
}

module.exports = { seedSchoolTargets, seedSchoolTargetsForMonth };
