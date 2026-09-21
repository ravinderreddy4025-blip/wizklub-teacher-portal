/**
 * One-off: build school-portal-code-snapshot.json from cached Mongo export.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = process.argv[2]
  || path.join(__dirname, '../../../../.cursor/projects/c-wizklub-web-apps/agent-tools/4a7adc2a-9a90-4789-b750-da5028e885c8.txt');
const OUT = path.join(__dirname, '../data/school-portal-code-snapshot.json');

const raw = fs.readFileSync(SOURCE, 'utf8');
const line = raw.split(/\r?\n/).find((l) => l.startsWith('{"divisionCount"'));
if (!line) throw new Error('Could not find JSON export line in source file');

const data = JSON.parse(line);
const out = (data.schools || []).map((s) => ({
  id: String(s._id),
  name: s.name,
  code: s.code,
}));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`Wrote ${out.length} schools to ${OUT}`);
