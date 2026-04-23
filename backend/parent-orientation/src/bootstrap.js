const path = require('path');

const candidates = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
  path.join(__dirname, '..', '..', '..', 'env-example', 'parent-orientation', '.env'),
  path.join(__dirname, '..', '..', '..', 'env-example', 'parent-orientation-env', '.env'),
  path.join(__dirname, '..', '..', 'parent-orientation-env-examples', '.env'),
];
for (const p of candidates) {
  require('dotenv').config({ path: p, override: false });
}
