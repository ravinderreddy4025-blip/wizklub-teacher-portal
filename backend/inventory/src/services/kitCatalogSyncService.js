const fs = require('fs');
const path = require('path');
const Kit = require('../models/Kit');

const CATALOG_PATH = path.join(__dirname, '../../data/component-kits.json');

function loadCatalogRows() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.warn('[kitCatalogSync] component-kits.json not found at', CATALOG_PATH);
    return [];
  }

  try {
    const rows = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('[kitCatalogSync] Failed to parse component-kits.json:', err.message);
    return [];
  }
}

function catalogKitIds(rows) {
  return rows
    .map((row) => String(row.kitId || '').trim().toUpperCase())
    .filter(Boolean);
}

function needsMetadataUpdate(existing, name, type, description) {
  return (
    existing.name !== name
    || existing.type !== type
    || (existing.description && existing.description.toLowerCase().includes('auto-created'))
    || (existing.name && /^Kit\s+[A-Z0-9]+$/i.test(existing.name))
    || (description !== undefined && existing.description !== description)
  );
}

/**
 * Sync Kit collection with backend/inventory/data/component-kits.json.
 * - Upserts official kit names/IDs/types
 * - Creates missing kits with warehouseQuantity 0
 * - Removes kits not present in the catalog (legacy seed cleanup)
 * - Does not reset warehouse stock on existing kits after initial create
 */
async function syncKitCatalog(options = {}) {
  const { prune = true } = options;
  const rows = loadCatalogRows();
  if (!rows.length) {
    return { synced: 0, created: 0, updated: 0, removed: 0 };
  }

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const name = String(row.name || '').trim();
    const kitId = String(row.kitId || '').trim().toUpperCase();
    const type = String(row.type || 'General').trim();
    const description = row.description !== undefined ? String(row.description || '').trim() : '';
    const warehouseQuantity = Math.max(0, Number(row.warehouseQuantity) || 0);

    if (!name || !kitId) continue;

    const existing = await Kit.findOne({
      kitId: { $regex: new RegExp(`^${kitId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existing) {
      if (needsMetadataUpdate(existing, name, type, description)) {
        existing.name = name;
        existing.type = type;
        existing.description = description;
        await existing.save();
        updated += 1;
      }
      continue;
    }

    await Kit.create({
      name,
      kitId,
      type,
      description,
      warehouseQuantity,
    });
    created += 1;
  }

  let removed = 0;
  if (prune) {
    const keepIds = catalogKitIds(rows);
    const result = await Kit.deleteMany({ kitId: { $nin: keepIds } });
    removed = result.deletedCount || 0;
  }

  if (created > 0 || updated > 0 || removed > 0) {
    console.log(
      `[kitCatalogSync] Catalog sync: ${created} created, ${updated} updated, ${removed} removed (${rows.length} catalog kits).`,
    );
  }

  return { synced: rows.length, created, updated, removed };
}

module.exports = { syncKitCatalog, loadCatalogRows, CATALOG_PATH };
