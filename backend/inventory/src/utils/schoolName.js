const SCHOOL_NAME_PREFIX = '';

function normalizeBranchName(name) {
  if (!name) return '';
  let result = String(name).trim();
  const pattern = /^(?:s[hr]+ee|sri)\s+chaitanya[\s-]*/i;
  while (pattern.test(result)) {
    result = result.replace(pattern, '').trim();
  }
  return result || String(name).trim();
}

/** Strip catalog prefixes (e.g. "Sri Chaitanya-Banaswadi") to branch-only. */
function wizklubSchoolNameToBranch(name) {
  return normalizeBranchName(name);
}

function formatSchoolDisplayName(branchName) {
  return normalizeBranchName(branchName);
}

module.exports = {
  SCHOOL_NAME_PREFIX,
  normalizeBranchName,
  formatSchoolDisplayName,
  wizklubSchoolNameToBranch,
};
