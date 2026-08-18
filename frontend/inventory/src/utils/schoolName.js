export const SCHOOL_NAME_PREFIX = 'SHREE CHAITANYA';

export function normalizeBranchName(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  const prefix = `${SCHOOL_NAME_PREFIX} `;
  if (trimmed.toUpperCase().startsWith(prefix.toUpperCase())) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
}

/** Strip WizKlub catalog prefixes (e.g. "Sri Chaitanya-Banaswadi") to branch-only. */
export function wizklubSchoolNameToBranch(name) {
  if (!name) return '';
  const stripped = String(name).trim().replace(/^sri chaitanya[\s-]*/i, '').trim();
  return normalizeBranchName(stripped) || stripped;
}

export function formatSchoolDisplayName(branchName) {
  const branch = normalizeBranchName(branchName);
  if (!branch) return SCHOOL_NAME_PREFIX;
  return `${SCHOOL_NAME_PREFIX} ${branch}`;
}
