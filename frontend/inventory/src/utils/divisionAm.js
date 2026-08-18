export function resolveAssignedAm(school, divisions = [], ams = []) {
  const divisionId = school?.divisionId?._id || school?.divisionId;
  if (!divisionId) return null;

  const div = divisions.find((d) => String(d._id) === String(divisionId));
  if (div?.regionalManagerId) {
    const manager = div.regionalManagerId;
    if (typeof manager === 'object' && manager?._id) return manager;
    return ams.find((am) => String(am._id) === String(manager)) || null;
  }

  return ams.find((am) => String(am.divisionId?._id || am.divisionId) === String(divisionId)) || null;
}
