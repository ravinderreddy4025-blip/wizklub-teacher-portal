const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = [path.join(__dirname, '..', 'src'), path.join(__dirname, '..', 'test')];
const files = [path.join(__dirname, '..', 'server.js')];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name.endsWith('.js')) files.push(full);
  }
}

for (const root of roots) walk(root);

let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed += 1;
    process.stderr.write(r.stderr || r.stdout || `check failed: ${file}\n`);
  }
}

if (failed) {
  console.error(`lint: ${failed} file(s) failed syntax check`);
  process.exit(1);
}
console.log(`lint: ${files.length} files syntax-ok`);
