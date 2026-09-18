/** Returns true for dev/test divisions, schools, kits, or users that should be hidden in admin UI. */
export function isTestEntity(name = '') {
  const n = String(name).trim().toLowerCase();
  if (!n) return false;
  return (
    n === 'test' ||
    n === 'testna' ||
    n.startsWith('test_') ||
    n.startsWith('test-') ||
    n.startsWith('test ') ||
    /^test\d/.test(n)
  );
}

export function isTestUser(user) {
  if (!user) return false;
  const emailLocal = user.email?.split('@')[0] || '';
  return isTestEntity(user.name) || isTestEntity(emailLocal);
}

export function filterProductionDivisions(divisions = []) {
  return divisions.filter((d) => !isTestEntity(d.name));
}

export function filterProductionAms(ams = []) {
  return ams.filter((am) => !isTestUser(am));
}

export function filterProductionKits(kits = []) {
  return kits.filter((k) => !isTestEntity(k.name) && !isTestEntity(k.kitId));
}
