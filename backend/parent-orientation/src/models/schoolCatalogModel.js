const { ObjectId } = require('mongodb');
const { SCHOOL_CATALOG_COLLECTION } = require('../config/constants');
const { MONGODB_DB } = require('../config/env');
const { mongo } = require('../services/mongo');

function catalogCollection() {
  return mongo.client.db(MONGODB_DB).collection(SCHOOL_CATALOG_COLLECTION);
}

function schoolToClient(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    region: doc.region,
    branch: doc.branch,
    map_left: doc.map_left ?? null,
    map_top: doc.map_top ?? null,
    map_short: doc.map_short ?? null,
    is_active: doc.is_active !== false,
    created_at: doc.created_at || null,
    updated_at: doc.updated_at || null,
    updated_by: doc.updated_by || null,
  };
}

async function listSchools({ region, search, includeInactive = false } = {}) {
  const q = {};
  if (!includeInactive) q.is_active = { $ne: false };
  if (region) q.region = String(region).trim();
  if (search) {
    const re = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ region: re }, { branch: re }];
  }
  const docs = await catalogCollection().find(q).sort({ region: 1, branch: 1 }).toArray();
  return docs.map(schoolToClient);
}

async function findSchoolById(id) {
  if (!ObjectId.isValid(id)) return null;
  return catalogCollection().findOne({ _id: new ObjectId(id) });
}

async function findSchoolByRegionBranch(region, branch) {
  return catalogCollection().findOne({
    region: String(region || '').trim(),
    branch: String(branch || '').trim(),
  });
}

async function createSchool({ region, branch, mapLeft, mapTop, mapShort, updatedBy }) {
  const r = String(region || '').trim();
  const b = String(branch || '').trim();
  if (!r || !b) throw new Error('Region and branch are required');
  const now = new Date();
  const doc = {
    region: r,
    branch: b,
    map_left: mapLeft != null ? Number(mapLeft) : null,
    map_top: mapTop != null ? Number(mapTop) : null,
    map_short: mapShort ? String(mapShort) : null,
    is_active: true,
    created_at: now,
    updated_at: now,
    updated_by: updatedBy || null,
  };
  const result = await catalogCollection().insertOne(doc);
  return schoolToClient({ ...doc, _id: result.insertedId });
}

async function updateSchool(id, patch) {
  const existing = await findSchoolById(id);
  if (!existing) return null;
  const set = { updated_at: new Date() };
  if (patch.region != null) set.region = String(patch.region).trim();
  if (patch.branch != null) set.branch = String(patch.branch).trim();
  if (patch.map_left != null) set.map_left = Number(patch.map_left);
  if (patch.map_top != null) set.map_top = Number(patch.map_top);
  if (patch.map_short != null) set.map_short = String(patch.map_short);
  if (patch.is_active != null) set.is_active = Boolean(patch.is_active);
  if (patch.updatedBy) set.updated_by = patch.updatedBy;
  await catalogCollection().updateOne({ _id: existing._id }, { $set: set });
  return schoolToClient(await findSchoolById(id));
}

async function buildRegionsCatalog() {
  const schools = await listSchools();
  const regionMap = Object.create(null);
  for (const s of schools) {
    if (!regionMap[s.region]) {
      regionMap[s.region] = {
        name: s.region,
        branches: [],
        mapCoords: {
          left: s.map_left,
          top: s.map_top,
          short: s.map_short || s.region,
        },
      };
    }
    regionMap[s.region].branches.push(s.branch);
    if (s.map_left != null && regionMap[s.region].mapCoords.left == null) {
      regionMap[s.region].mapCoords.left = s.map_left;
      regionMap[s.region].mapCoords.top = s.map_top;
      regionMap[s.region].mapCoords.short = s.map_short || s.region;
    }
  }
  const regions = Object.values(regionMap)
    .map((r) => ({
      name: r.name,
      branches: [...new Set(r.branches)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      mapCoords: r.mapCoords,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { regions };
}

async function ensureCatalogIndexes() {
  const col = catalogCollection();
  await col.createIndex({ region: 1, branch: 1 }, { unique: true });
  await col.createIndex({ region: 1 });
}

async function seedCatalogFromStatic(seed, updatedBy = 'seed') {
  const count = await catalogCollection().countDocuments({});
  if (count > 0) return { seeded: 0 };
  const coordsByName = Object.fromEntries((seed.mapCoords || []).map((c) => [c.name, c]));
  let seeded = 0;
  for (const [region, branches] of Object.entries(seed.regions || {})) {
    const coord = coordsByName[region] || {};
    for (const branch of branches || []) {
      const b = String(branch).replace(/\s+/g, ' ').trim();
      if (!b) continue;
      try {
        await createSchool({
          region,
          branch: b,
          mapLeft: coord.left,
          mapTop: coord.top,
          mapShort: coord.short,
          updatedBy,
        });
        seeded += 1;
      } catch (e) {
        if (!/duplicate|E11000/i.test(String(e.message))) throw e;
      }
    }
  }
  return { seeded };
}

module.exports = {
  schoolToClient,
  listSchools,
  findSchoolById,
  findSchoolByRegionBranch,
  createSchool,
  updateSchool,
  buildRegionsCatalog,
  ensureCatalogIndexes,
  seedCatalogFromStatic,
};
