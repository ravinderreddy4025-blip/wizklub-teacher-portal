/**
 * Upsert WizIoT / Futurz component kits into inventory warehouse (qty 0 by default).
 *
 * Usage (from repo root, with .env present):
 *   node backend/inventory/scripts/seedComponentKits.js
 *
 * Inside Docker backend container:
 *   node backend/inventory/scripts/seedComponentKits.js
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');

loadRootEnv();

const Kit = require('../src/models/Kit');

const DATA_PATH = path.join(__dirname, '../data/component-kits.json');

async function main() {
  const uri = resolveInventoryMongoUri();
  if (!uri) {
    console.error('Set MONGO_URI (+ INVENTORY_MONGO_DB_NAME) or INVENTORY_MONGODB_URI in repo-root .env');
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  if (!Array.isArray(rows) || !rows.length) {
    console.error('No kit rows in component-kits.json');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const name = String(row.name || '').trim();
    const kitId = String(row.kitId || '').trim().toUpperCase();
    const type = String(row.type || 'General').trim();
    const warehouseQuantity = Math.max(0, Number(row.warehouseQuantity) || 0);

    if (!name || !kitId) {
      console.warn('Skipping invalid row:', row);
      continue;
    }

    const existing = await Kit.findOne({ kitId });
    if (existing) {
      existing.name = name;
      existing.type = type;
      if (row.description !== undefined) {
        existing.description = String(row.description || '').trim();
      } else if (existing.description && existing.description.toLowerCase().includes('auto-created')) {
        existing.description = '';
      }
      if (row.warehouseQuantity !== undefined) {
        existing.warehouseQuantity = warehouseQuantity;
      }
      await existing.save();
      updated += 1;
      console.log(`Updated ${kitId} — ${name}`);
    } else {
      await Kit.create({
        name,
        kitId,
        type,
        description: row.description ? String(row.description).trim() : '',
        warehouseQuantity,
      });
      created += 1;
      console.log(`Created ${kitId} — ${name}`);
    }
  }

  console.log(`Done: ${created} created, ${updated} updated (${rows.length} catalog rows).`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
