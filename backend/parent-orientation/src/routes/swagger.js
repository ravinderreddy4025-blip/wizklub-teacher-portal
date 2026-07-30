const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const { isProd } = require('../config/env');

/** True when Swagger UI and /openapi.json should not be mounted. */
function swaggerUiDisabled() {
  const v = process.env.SWAGGER_UI;
  const raw = v == null ? '' : String(v).trim();
  const s = raw.toLowerCase();

  if (isProd) {
    // Production: locked by default (omit SWAGGER_UI → off). Enable only on purpose.
    if (raw === '') return true;
    const enabled = s === '1' || s === 'true' || s === 'yes' || s === 'on';
    return !enabled;
  }

  // Development / test: on unless explicitly turned off
  if (raw === '') return false;
  return s === '0' || s === 'false' || s === 'off' || s === 'no';
}

/**
 * Interactive OpenAPI docs at /api-docs and raw spec at /openapi.json.
 * Development: omit SWAGGER_UI for docs on; set SWAGGER_UI=0 (or false/off/no) to hide.
 * Production: omit SWAGGER_UI for docs off; set SWAGGER_UI=1 (or true/yes/on) to enable.
 */
function mountSwagger(app) {
  if (swaggerUiDisabled()) {
    if (isProd) {
      console.log(
        '[INFO] OpenAPI/Swagger not mounted: /api-docs and /openapi.json disabled (production). Do not set SWAGGER_UI on public deployments.'
      );
    }
    return;
  }
  if (isProd) {
    console.warn(
      '[WARN] Swagger UI is enabled (SWAGGER_UI). Use only on a private host; never expose /api-docs on the public internet.'
    );
  }
  const specPath = path.join(__dirname, '..', 'openapi.json');
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    console.warn('[WARN] Swagger UI not mounted:', e.message);
    return;
  }

  app.get('/openapi.json', (req, res) => {
    res.type('application/json; charset=utf-8');
    res.send(spec);
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Parent Orientation Tracker API' }));
}

module.exports = { mountSwagger };
