const catalogSeed = require('../config/schoolCatalogSeed');
const { seedCatalogFromStatic } = require('../models/schoolCatalogModel');

async function seedSchoolCatalog() {
  return seedCatalogFromStatic(catalogSeed, 'catalog_seed');
}

module.exports = { seedSchoolCatalog };
