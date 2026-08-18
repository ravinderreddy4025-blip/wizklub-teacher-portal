const fs = require('fs');
const path = require('path');

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

/** Default AM by spreadsheet State column (operational list). */
const OPERATIONAL_AM_BY_STATE = {
  'andhra pradesh': { name: 'Sandeep Kumar', email: 'sandeep.kumar@wizklub.in' },
  bengaluru: { name: 'Aditi Ashok Katti', email: 'aditi.katti@wizklub.in' },
  chennai: { name: 'John Emmanuel', email: 'john.emmanuel@wizklub.in' },
  maharashtra: { name: 'Aditi Ashok Katti', email: 'aditi.katti@wizklub.in' },
  'rest of india': { name: 'Himanshu Verma', email: 'himanshu.verma@infinitylearn.com' },
  'rest of karnataka': { name: 'Aditi Ashok Katti', email: 'aditi.katti@wizklub.in' },
  'rest of tamil nadu': { name: 'John Emmanuel', email: 'john.emmanuel@wizklub.in' },
  telangana: { name: 'Sandeep Kumar', email: 'sandeep.kumar@wizklub.in' },
  'west bengal': { name: 'Aditi Ashok Katti', email: 'aditi.katti@wizklub.in' },
};

/** WizKlub region → operational AM (when state differs from region name). */
const OPERATIONAL_AM_BY_REGION = {
  'andhra pradesh': OPERATIONAL_AM_BY_STATE['andhra pradesh'],
  bengaluru: OPERATIONAL_AM_BY_STATE.bengaluru,
  'tamil nadu': OPERATIONAL_AM_BY_STATE.chennai,
  maharashtra: OPERATIONAL_AM_BY_STATE.maharashtra,
  'delhi ncr': OPERATIONAL_AM_BY_STATE['rest of india'],
  rajasthan: OPERATIONAL_AM_BY_STATE['rest of india'],
  'uttar pradesh': OPERATIONAL_AM_BY_STATE['rest of india'],
  punjab: OPERATIONAL_AM_BY_STATE['rest of india'],
  haryana: OPERATIONAL_AM_BY_STATE['rest of india'],
  uttarakhand: OPERATIONAL_AM_BY_STATE['rest of india'],
  karnataka: OPERATIONAL_AM_BY_STATE['rest of karnataka'],
  telangana: OPERATIONAL_AM_BY_STATE.telangana,
  'west bengal': OPERATIONAL_AM_BY_STATE['west bengal'],
};

function getOperationalAmHint({ state, region } = {}) {
  const stateKey = norm(state);
  if (OPERATIONAL_AM_BY_STATE[stateKey]) return OPERATIONAL_AM_BY_STATE[stateKey];
  const regionKey = norm(region);
  if (OPERATIONAL_AM_BY_REGION[regionKey]) return OPERATIONAL_AM_BY_REGION[regionKey];
  return null;
}

function loadOperationalVerification() {
  const verifyPath = path.resolve(__dirname, '../../../spreadsheet-wizklub-verification.json');
  if (!fs.existsSync(verifyPath)) {
    return { summary: null, byWizklubId: new Map(), byBranchRegion: new Map(), bySchoolId: new Map(), rows: [] };
  }

  const { summary, results } = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
  const byWizklubId = new Map();
  const byBranchRegion = new Map();
  const bySchoolId = new Map();

  (results || []).forEach((row) => {
    const entry = {
      state: row.state,
      branch: row.branch,
      schoolId: row.schoolId,
      am: row.am,
      amEmail: row.amEmail,
      status: row.status,
      wizklubId: row.wizklubId,
      wizklubName: row.wizklubName,
      wizklubRegion: row.wizklubRegion,
    };
    if (row.wizklubId) byWizklubId.set(String(row.wizklubId).toLowerCase(), entry);
    if (row.schoolId) bySchoolId.set(String(row.schoolId).trim().toLowerCase(), entry);
    const brKey = `${norm(row.branch)}|${norm(row.state)}`;
    if (brKey !== '|') byBranchRegion.set(brKey, entry);
  });

  return { summary, byWizklubId, byBranchRegion, bySchoolId, rows: results || [] };
}

function matchOperationalRow(school, lookup) {
  if (!lookup || !school) return null;
  const idKey = String(school.id || school.code || '').toLowerCase();
  if (lookup.byWizklubId.has(idKey)) return lookup.byWizklubId.get(idKey);

  const wizklubName = String(school.name || '').replace(/^sri chaitanya[\s-]*/i, '').trim();
  for (const row of lookup.rows) {
    if (!row.wizklubId) continue;
    if (String(row.wizklubId).toLowerCase() === idKey) return row;
    if (row.wizklubName && norm(row.wizklubName).includes(norm(wizklubName))) return row;
  }

  return null;
}

module.exports = {
  getOperationalAmHint,
  loadOperationalVerification,
  matchOperationalRow,
  OPERATIONAL_AM_BY_STATE,
};
