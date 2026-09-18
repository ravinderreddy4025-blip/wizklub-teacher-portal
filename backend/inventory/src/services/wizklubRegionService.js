const Division = require('../models/Division');
const User = require('../models/User');
const { getOperationalAmHint, matchOperationalRow } = require('./operationalSchoolList');

function normalizeRegionKey(value) {
  return String(value || '').trim().toLowerCase();
}

function hasRegionAssignment(school) {
  const hasRegionId = school.region_id != null && school.region_id !== 0;
  const hasRegionName = Boolean(school.region && String(school.region).trim());
  return hasRegionId || hasRegionName;
}

function extractUniqueRegions(schools) {
  const byId = new Map();
  schools.forEach((school) => {
    if (!hasRegionAssignment(school)) return;
    const regionId = school.region_id;
    const regionName = String(school.region || '').trim();
    const key = regionId != null ? String(regionId) : normalizeRegionKey(regionName);
    if (!key) return;
    if (!byId.has(key)) {
      byId.set(key, {
        wizklubRegionId: regionId != null ? Number(regionId) : null,
        wizklubRegionName: regionName || `Region ${regionId}`,
        schoolCount: 0,
      });
    }
    byId.get(key).schoolCount += 1;
  });
  return [...byId.values()].sort((a, b) => a.wizklubRegionName.localeCompare(b.wizklubRegionName));
}

/**
 * Build lookup maps: WizKlub region_id and region name both resolve to the same division.
 * Region name matches division.name or division.wizklubRegionName (case-insensitive).
 */
async function buildDivisionLookup() {
  const divisions = await Division.find().lean();
  const byRegionId = new Map();
  const byRegionName = new Map();

  divisions.forEach((division) => {
    if (division.wizklubRegionId != null) {
      byRegionId.set(Number(division.wizklubRegionId), division);
    }
    const nameKey = normalizeRegionKey(division.wizklubRegionName || division.name);
    if (nameKey && !byRegionName.has(nameKey)) {
      byRegionName.set(nameKey, division);
    }
  });

  return { byRegionId, byRegionName };
}

/** @deprecated use buildDivisionLookup */
async function buildDivisionByRegionMap() {
  const { byRegionId } = await buildDivisionLookup();
  return byRegionId;
}

function resolveDivisionForSchool(school, lookup) {
  if (!school || !lookup) return null;
  if (school.region_id != null) {
    const byId = lookup.byRegionId.get(Number(school.region_id));
    if (byId) return byId;
  }
  const regionName = String(school.region || '').trim();
  if (regionName) {
    return lookup.byRegionName.get(normalizeRegionKey(regionName)) || null;
  }
  return null;
}

async function loadAmDivisionIds() {
  const amByDivisionId = await loadAmByDivisionId();
  return new Set([...amByDivisionId.keys()]);
}

async function loadAmByDivisionId() {
  const map = new Map();
  const divisions = await Division.find().populate('regionalManagerId', 'name email role').lean();
  divisions.forEach((division) => {
    const manager = division.regionalManagerId;
    if (manager?.name) {
      map.set(String(division._id), { name: manager.name, email: manager.email });
    }
  });

  const ams = await User.find({ role: 'AM' }).select('divisionId name email').lean();
  ams.forEach((am) => {
    if (am.divisionId && !map.has(String(am.divisionId))) {
      map.set(String(am.divisionId), { name: am.name, email: am.email });
    }
  });

  return map;
}

async function findDivisionByRegion(region) {
  if (region.wizklubRegionId != null) {
    const byId = await Division.findOne({ wizklubRegionId: region.wizklubRegionId });
    if (byId) return byId;
  }
  const regionName = String(region.wizklubRegionName || '').trim();
  if (regionName) {
    const escaped = regionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byName = await Division.findOne({
      $or: [
        { name: new RegExp(`^${escaped}$`, 'i') },
        { wizklubRegionName: new RegExp(`^${escaped}$`, 'i') },
      ],
    });
    if (byName) return byName;
  }
  return null;
}

async function linkDivisionToRegion(division, region) {
  const updates = {};
  if (region.wizklubRegionId != null && division.wizklubRegionId == null) {
    updates.wizklubRegionId = region.wizklubRegionId;
  }
  if (region.wizklubRegionName && !division.wizklubRegionName) {
    updates.wizklubRegionName = region.wizklubRegionName;
  }
  if (Object.keys(updates).length === 0) return division;
  return Division.findByIdAndUpdate(division._id, updates, { new: true });
}

/**
 * Create/link inventory divisions for WizKlub regions (name only — AM and details added later).
 */
async function syncRegionsFromSchools(schools) {
  const regions = extractUniqueRegions(schools);
  const created = [];
  const matched = [];

  for (const region of regions) {
    let division = await findDivisionByRegion(region);

    if (division) {
      division = await linkDivisionToRegion(division, region);
      matched.push({
        region,
        divisionId: division._id,
        divisionName: division.name,
      });
      continue;
    }

    const baseName = region.wizklubRegionName || `WizKlub Region ${region.wizklubRegionId}`;
    let name = baseName;
    let suffix = 1;
    while (await Division.findOne({ name })) {
      suffix += 1;
      name = `${baseName} (${suffix})`;
    }

    division = await Division.create({
      name,
      wizklubRegionId: region.wizklubRegionId,
      wizklubRegionName: region.wizklubRegionName,
    });
    created.push({
      divisionId: division._id,
      divisionName: division.name,
      wizklubRegionId: region.wizklubRegionId,
      wizklubRegionName: region.wizklubRegionName,
      schoolCount: region.schoolCount,
    });
  }

  return {
    regionsFound: regions.length,
    created,
    matched,
    divisions: await Division.find({
      $or: [
        { wizklubRegionId: { $ne: null } },
        { wizklubRegionName: { $ne: null } },
      ],
    })
      .populate('regionalManagerId', 'name email')
      .sort({ wizklubRegionName: 1, name: 1 })
      .lean(),
  };
}

async function ensureDivisionsFromSchools(schools) {
  return syncRegionsFromSchools(schools);
}

function enrichWizklubSchool(school, {
  divisionLookup,
  registeredCodes,
  registeredPortalIds,
  amDivisionIds,
  amByDivisionId,
  operationalLookup,
}) {
  const codeKey = String(school.code || school.id || '').trim().toLowerCase();
  const needsRegionAssignment = !hasRegionAssignment(school);
  const division = !needsRegionAssignment ? resolveDivisionForSchool(school, divisionLookup) : null;
  const regionLabel = String(school.region || '').trim() || null;
  const suggestedDivisionId = division?._id ? String(division._id) : null;
  const suggestedDivisionName = division?.name || regionLabel;
  const divisionAm = suggestedDivisionId && amByDivisionId
    ? amByDivisionId.get(suggestedDivisionId)
    : null;
  const divisionHasAm = suggestedDivisionId ? amDivisionIds.has(suggestedDivisionId) : false;
  const operationalRow = operationalLookup ? matchOperationalRow(school, operationalLookup) : null;
  const regionAmHint = getOperationalAmHint({
    state: operationalRow?.state,
    region: school.region || operationalRow?.wizklubRegion,
  });
  const operationalAm = operationalRow?.am
    ? { name: operationalRow.am, email: operationalRow.amEmail }
    : regionAmHint;
  const hasEmail = Boolean(school.email?.trim())
    || Boolean(process.env.WIZKLUB_SCHOOL_FALLBACK_EMAIL?.trim());
  const alreadyRegistered = registeredCodes.has(codeKey)
    || (registeredPortalIds && registeredPortalIds.has(codeKey));
  const divisionMapped = Boolean(division);
  const mappingStatus = alreadyRegistered
    ? 'registered'
    : (needsRegionAssignment || !divisionMapped ? 'not_mapped' : 'mapped');

  return {
    id: String(school.id || school.code),
    code: school.code || school.id,
    name: school.name,
    email: school.email || null,
    region_id: school.region_id ?? null,
    region: school.region ?? null,
    needsRegionAssignment,
    suggestedDivisionId,
    suggestedDivisionName,
    divisionMapped,
    divisionHasAm,
    divisionAmName: divisionAm?.name || null,
    divisionAmEmail: divisionAm?.email || null,
    suggestedAmName: divisionAm?.name || operationalAm?.name || null,
    suggestedAmEmail: divisionAm?.email || operationalAm?.email || null,
    inOperationalList: Boolean(operationalRow),
    operationalSchoolId: operationalRow?.schoolId || null,
    operationalStatus: operationalRow?.status || null,
    operationalState: operationalRow?.state || null,
    operationalBranch: operationalRow?.branch || null,
    missingEmail: !hasEmail,
    alreadyRegistered,
    mappingStatus,
    readyToRegister: mappingStatus === 'mapped',
  };
}

module.exports = {
  normalizeRegionKey,
  hasRegionAssignment,
  extractUniqueRegions,
  buildDivisionLookup,
  buildDivisionByRegionMap,
  resolveDivisionForSchool,
  loadAmDivisionIds,
  loadAmByDivisionId,
  syncRegionsFromSchools,
  ensureDivisionsFromSchools,
  enrichWizklubSchool,
};
