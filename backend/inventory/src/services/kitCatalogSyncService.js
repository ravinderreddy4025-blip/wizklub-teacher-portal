const fs = require('fs');
const path = require('path');
const Kit = require('../models/Kit');

const CATALOG_PATH = path.join(__dirname, '../../data/component-kits.json');

/**
 * Automatically syncs the Kit collection with the official catalog in component-kits.json.
 * Updates any existing kits that have placeholder names (e.g. "Kit AR", "Kit WS")
 * or "Auto-created" descriptions, and inserts any missing catalog kits.
 * Runs on backend startup so production requires zero manual scripts.
 */
async function syncKitCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.warn('[kitCatalogSync] component-kits.json not found at', CATALOG_PATH);
    return { synced: 0, updated: 0, created: 0 };
  }

  let rows = [];
  try {
    rows = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch (err) {
    console.error('[kitCatalogSync] Failed to parse component-kits.json:', err.message);
    return { synced: 0, updated: 0, created: 0 };
  }

  if (!Array.isArray(rows) || !rows.length) return { synced: 0, updated: 0, created: 0 };

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const name = String(row.name || '').trim();
    const kitId = String(row.kitId || '').trim().toUpperCase();
    const type = String(row.type || 'General').trim();
    const warehouseQuantity = Math.max(0, Number(row.warehouseQuantity) || 0);

    if (!name || !kitId) continue;

    const existing = await Kit.findOne({
      kitId: { $regex: new RegExp(`^${kitId}$`, 'i') },
    });

    if (existing) {
      const needsUpdate =
        existing.name !== name ||
        existing.type !== type ||
        (existing.description && existing.description.toLowerCase().includes('auto-created')) ||
        (existing.name && /^Kit\s+[A-Z0-9]+$/i.test(existing.name));

      if (needsUpdate) {
        existing.name = name;
        existing.type = type;
        existing.description = row.description ? String(row.description).trim() : '';
        await existing.save();
        updated += 1;
      }
    } else {
      await Kit.create({
        name,
        kitId,
        type,
        description: row.description ? String(row.description).trim() : '',
        warehouseQuantity,
      });
      created += 1;
    }
  }

  if (created > 0 || updated > 0) {
    console.log(`[kitCatalogSync] Kit catalog auto-sync complete: ${created} created, ${updated} updated to official names.`);
  }

  return { synced: rows.length, created, updated };
}

module.exports = { syncKitCatalog };
