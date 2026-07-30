/**
 * Default completion targets for newly added schools.
 * Applied once per month when no target row exists yet in MongoDB.
 * Sales Admin can override via Targets & schools.
 */
const SCHOOL_TARGET_SEEDS = [
  { region: 'West Bengal', branch: 'Sri Chaitanya-Rishra', target_completed: 10 },
  { region: 'Bengaluru', branch: 'Sri Chaitanya-Rampura', target_completed: 10 },
  { region: 'Haryana', branch: 'Sri Chaitanya-Sirsa', target_completed: 10 },
];

module.exports = { SCHOOL_TARGET_SEEDS };
