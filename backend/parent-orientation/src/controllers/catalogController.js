const { buildRegionsCatalog } = require('../models/schoolCatalogModel');
const catalogSeed = require('../config/schoolCatalogSeed');
const { mongo, mongoPingOk } = require('../services/mongo');

async function getRegionsCatalog(req, res) {
  if (mongo.client && (!mongo.ready ? await mongoPingOk() : mongo.ready)) {
    try {
      const catalog = await buildRegionsCatalog();
      if (catalog.regions && catalog.regions.length > 0) {
        return res.json(catalog);
      }
    } catch (e) {
      console.error('[catalog]', e && e.message ? e.message : e);
    }
  }
  const regions = Object.entries(catalogSeed.regions || {}).map(([name, branches]) => {
    const coord = (catalogSeed.mapCoords || []).find((c) => c.name === name) || {};
    return {
      name,
      branches: [...new Set(branches.map((b) => String(b).trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      ),
      mapCoords: { left: coord.left ?? 50, top: coord.top ?? 50, short: coord.short || name },
    };
  });
  return res.json({ regions });
}

module.exports = { getRegionsCatalog };
