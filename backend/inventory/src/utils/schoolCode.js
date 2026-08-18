/** Keep school login ID exactly as entered in the admin form. */
function preserveSchoolLoginId(code) {
  if (code === null || code === undefined) return '';
  return String(code);
}

module.exports = { preserveSchoolLoginId };
