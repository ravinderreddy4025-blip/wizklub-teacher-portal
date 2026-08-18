const Kit = require('../models/Kit');
const XLSX = require('xlsx');
const fs = require('fs');

const createKit = async (req, res) => {
  try {
    const { name, type, kitId, description, warehouseQuantity } = req.body;

    if (!name?.trim() || !type?.trim() || !kitId?.trim()) {
      return res.status(400).json({ message: 'Kit name, type, and kit ID are required' });
    }

    const existing = await Kit.findOne({ kitId: kitId.trim().toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: 'A kit with this kit ID already exists' });
    }

    const kit = await Kit.create({
      name: name.trim(),
      type: type.trim(),
      kitId: kitId.trim().toUpperCase(),
      description: description?.trim() || '',
      warehouseQuantity: Math.max(0, Number(warehouseQuantity) || 0),
    });

    res.status(201).json(kit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateKit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, kitId, description, warehouseQuantity } = req.body;

    const kit = await Kit.findById(id);
    if (!kit) return res.status(404).json({ message: 'Kit not found' });

    if (kitId?.trim() && kitId.trim().toUpperCase() !== kit.kitId) {
      const taken = await Kit.findOne({ kitId: kitId.trim().toUpperCase(), _id: { $ne: id } });
      if (taken) return res.status(400).json({ message: 'Kit ID already in use' });
      kit.kitId = kitId.trim().toUpperCase();
    }

    if (name?.trim()) kit.name = name.trim();
    if (type?.trim()) kit.type = type.trim();
    if (description !== undefined) kit.description = description?.trim() || '';
    if (warehouseQuantity !== undefined) {
      kit.warehouseQuantity = Math.max(0, Number(warehouseQuantity) || 0);
    }

    await kit.save();
    res.json(kit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteKit = async (req, res) => {
  try {
    const kit = await Kit.findByIdAndDelete(req.params.id);
    if (!kit) return res.status(404).json({ message: 'Kit not found' });
    res.json({ message: 'Kit deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWarehouse = async (req, res) => {
  try {
    const kits = await Kit.find().sort({ type: 1, name: 1 });
    const totalUnits = kits.reduce((sum, k) => sum + (k.warehouseQuantity || 0), 0);
    res.json({ kits, totalUnits, kitTypes: [...new Set(kits.map((k) => k.type))] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const bulkUploadKits = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel file is required' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Excel file is empty' });
    }

    const created = [];
    const updated = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row.name || row.Name || row['Kit Name'] || row.kitName || '').trim();
      const type = String(row.type || row.Type || row['Kit Type'] || row.kitType || '').trim();
      const kitId = String(row.kitId || row['Kit ID'] || row.KitID || row.id || '').trim().toUpperCase();
      const description = String(row.description || row.Description || '').trim();
      const warehouseQuantity = Math.max(0, Number(row.warehouseQuantity || row.Quantity || row.quantity || row.stock || 0) || 0);

      if (!name || !type || !kitId) {
        errors.push({ row: i + 2, message: 'Missing name, type, or kit ID' });
        continue;
      }

      try {
        const existing = await Kit.findOne({ kitId });
        if (existing) {
          existing.name = name;
          existing.type = type;
          existing.description = description || existing.description;
          if (warehouseQuantity > 0) existing.warehouseQuantity = warehouseQuantity;
          await existing.save();
          updated.push(existing);
        } else {
          const kit = await Kit.create({ name, type, kitId, description, warehouseQuantity });
          created.push(kit);
        }
      } catch (err) {
        errors.push({ row: i + 2, message: err.message });
      }
    }

    fs.unlinkSync(req.file.path);

    res.json({
      message: `Bulk upload complete: ${created.length} created, ${updated.length} updated`,
      created: created.length,
      updated: updated.length,
      errors,
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createKit, updateKit, deleteKit, getWarehouse, bulkUploadKits };
