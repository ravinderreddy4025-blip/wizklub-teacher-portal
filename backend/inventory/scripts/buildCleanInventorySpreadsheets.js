/**
 * Build cleaned inventory spreadsheets from Downloads source files:
 * - FINAL_DATA_CLEAN_176.xlsx (acknowledged)
 * - SC_WIZKLUB_Combined_CLEAN_36.xlsx (2026 pending ack)
 * - school_kits_distribution_CLEAN.xlsx (empty — merged elsewhere)
 * - INVENTORY_DATA_AUDIT.json
 *
 * Usage:
 *   node scripts/buildCleanInventorySpreadsheets.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DATA_DIR = process.env.INVENTORY_SOURCE_DIR
  || 'C:/Users/Chandrangshu/Downloads/final data';

const PATHS = {
  finalOrig: path.join(DATA_DIR, 'FINAL_DATA.xlsx'),
  final152: path.join(DATA_DIR, 'FINAL_DATA_CLEAN_152.xlsx'),
  dist: path.join(DATA_DIR, 'school_kits_distribution.xlsx'),
  combined: path.join(DATA_DIR, 'SC_WIZKLUB_Combined_Single_Sheet.xlsx'),
  catalog: path.join(__dirname, '../data/component-kits.json'),
  outFinal: path.join(DATA_DIR, 'FINAL_DATA_CLEAN_164.xlsx'),
  outCombined: path.join(DATA_DIR, 'SC_WIZKLUB_Combined_CLEAN_36.xlsx'),
  outDist: path.join(DATA_DIR, 'school_kits_distribution_CLEAN.xlsx'),
  outAudit: path.join(DATA_DIR, 'INVENTORY_DATA_AUDIT.json'),
};

const REMOVE_DIST_SC26_OVERLAP = new Set([
  'SC-024/26', 'SC-017/26', 'SC-015/26', 'SC-016/26', 'SC-002/26', 'SC-004/26',
  'SC-007/26', 'SC-010/26', 'SC-011/26', 'SC-005/26', 'SC-008/26', 'SC-018/26',
  'SC-006/26', 'SC-009/26', 'SC-012/26',
]);

const MOVE_DIST_TO_COMBINED = [
  { matchCode: 'SC-031/26', matchName: 'Agra 2', outCode: 'SC-031/26', outName: 'Agra 2' },
  { matchCode: 'SC-012/26', matchName: 'Valasaravakkam', outCode: 'SC-013/26', outName: 'Valasaravakkam' },
];

const KIT_COLUMN_ALIASES = {
  'pw & io connectors ypdp (bb-14, rb-10,bbb-2 =26)': 'PW & IO Connectors YPDP',
  'mic and amplifier with speaker': 'MICROPHONE',
};

const META_DIST = new Set(['School Code', 'School Name', 'Division']);

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function keyName(s) {
  return norm(s).toLowerCase();
}

function toFull26(id, year = '26') {
  const raw = norm(id);
  if (!raw) return raw;
  if (/\/\d{2}$/.test(raw)) return raw.toUpperCase();
  const m = raw.match(/^(NSC|SC)-(\d+)$/i);
  if (m) return `${m[1].toUpperCase()}-${m[2]}/${year}`;
  return raw.toUpperCase();
}

function resolveKitColumnName(columnName) {
  const k = keyName(columnName);
  return KIT_COLUMN_ALIASES[k] || norm(columnName);
}

function loadCatalog() {
  const catalog = JSON.parse(fs.readFileSync(PATHS.catalog, 'utf8'));
  const byName = new Map(catalog.map((k) => [keyName(k.name), k]));
  const byId = new Map(catalog.map((k) => [String(k.kitId).toUpperCase(), k]));
  return { catalog, byName, byId };
}

function parseDistWideRow(row) {
  const kits = [];
  Object.entries(row).forEach(([col, value]) => {
    if (META_DIST.has(col)) return;
    const qty = Math.max(0, Number(value) || 0);
    if (!qty) return;
    kits.push({ name: resolveKitColumnName(col), quantity: qty });
  });
  return {
    code: norm(row['School Code']),
    name: norm(row['School Name']),
    region: norm(row.Division),
    kits,
    totalQty: kits.reduce((s, k) => s + k.quantity, 0),
    kitTypes: kits.length,
  };
}

function kitsToFinalString(kits) {
  return kits.map((k) => `${k.name} (${k.quantity})`).join('; ');
}

function loadDistRows() {
  const wb = XLSX.readFile(PATHS.dist);
  const sheet = wb.SheetNames.find((n) => /school kits distribution/i.test(n)) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' }).map(parseDistWideRow).filter((r) => r.code);
}

function loadFinal152() {
  const wb = XLSX.readFile(PATHS.final152);
  const sheet = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
}

function loadCombinedRows() {
  const wb = XLSX.readFile(PATHS.combined);
  const sheet = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' }).map((row) => ({
    name: norm(row['School Name']),
    region: norm(row.Region),
    schoolId: norm(row['School ID']),
    joiningYear: norm(row['Joining Year']) || '2026',
    kitName: norm(row['Kit Name']),
    kitId: norm(row['Kit ID']),
    quantity: Math.max(0, Number(row.Quantity) || 0),
  })).filter((r) => r.schoolId || r.name);
}

function distRowToCombinedLines(school, { byName }) {
  const code = school.outCode;
  const name = school.outName;
  const region = school.region;
  const unresolved = [];
  const lines = school.kits.map((kit) => {
    const cat = byName.get(keyName(kit.name));
    if (!cat) unresolved.push(kit.name);
    return {
      'School Name': name,
      Region: region,
      'School ID': code.replace(/\/\d{2}$/, ''),
      'Joining Year': '2026',
      'Kit Name': cat ? cat.name : kit.name,
      'Kit ID': cat ? cat.kitId : '',
      Quantity: kit.quantity,
    };
  });
  return { lines, unresolved };
}

function build() {
  const audit = { irregularities: [], warnings: [], summary: {} };
  const { byName } = loadCatalog();

  if (!fs.existsSync(PATHS.final152)) {
    throw new Error(`Missing ${PATHS.final152} — run prior FINAL_DATA clean step first`);
  }

  const final152 = loadFinal152();
  const final152Codes = new Set(final152.map((r) => norm(r['School ID']).toUpperCase()));
  const distAll = loadDistRows();
  const combinedOrig = loadCombinedRows();

  // --- Partition distribution ---
  const distToCombinedSrc = [];
  const distToFinalSrc = [];
  const distRemovedOverlap = [];

  for (const row of distAll) {
    const moveSpec = MOVE_DIST_TO_COMBINED.find(
      (m) => row.code === m.matchCode && keyName(row.name) === keyName(m.matchName),
    );
    if (moveSpec) {
      distToCombinedSrc.push({ ...row, outCode: moveSpec.outCode, outName: moveSpec.outName });
      continue;
    }
    if (REMOVE_DIST_SC26_OVERLAP.has(row.code)) {
      distRemovedOverlap.push(row);
      continue;
    }
    if (row.code === 'SC-013/26' && keyName(row.name) === keyName('Gurugram 12')) {
      distRemovedOverlap.push({ ...row, note: 'Gurugram 12 — use combined SC-012/26' });
      continue;
    }
    if (!/\/26$/i.test(row.code)) {
      if (final152Codes.has(row.code.toUpperCase())) {
        distRemovedOverlap.push({ ...row, note: 'Already acknowledged in FINAL_DATA (alias row)' });
        continue;
      }
      distToFinalSrc.push(row);
      continue;
    }
    audit.irregularities.push({
      severity: 'high',
      type: 'unclassified_dist_row',
      message: `Distribution row not routed: ${row.code} ${row.name}`,
    });
  }

  // --- FINAL 176 ---
  const finalFromDist = distToFinalSrc.map((row, idx) => ({
    '#': final152.length + idx + 1,
    'School ID': row.code,
    'School Name': row.name,
    Region: row.region,
    'Account Manager': '',
    'No. of Kits (qty > 0)': row.kitTypes,
    'Total Kit Quantity': row.totalQty,
    'Kits Present (kit + max qty)': kitsToFinalString(row.kits),
  }));

  const final176 = [...final152, ...finalFromDist];
  const finalCodes = final176.map((r) => norm(r['School ID']));
  const finalDupCodes = finalCodes.filter((c, i) => finalCodes.indexOf(c) !== i);

  // --- COMBINED 36 ---
  const combinedOut = combinedOrig.map((row) => ({
    'School Name': row.name,
    Region: row.region,
    'School ID': row.schoolId,
    'Joining Year': row.joiningYear || '2026',
    'Kit Name': row.kitName,
    'Kit ID': row.kitId,
    Quantity: row.quantity,
  }));

  const combinedAdded = [];
  for (const school of distToCombinedSrc) {
    const { lines, unresolved } = distRowToCombinedLines(school, { byName });
    combinedOut.push(...lines);
    combinedAdded.push({
      code: school.outCode,
      name: school.outName,
      lines: lines.length,
      totalQty: school.totalQty,
      unresolvedKits: unresolved,
    });
    if (unresolved.length) {
      audit.warnings.push({
        type: 'unresolved_kit_names',
        school: `${school.outCode} ${school.outName}`,
        kits: unresolved,
      });
    }
  }

  // Normalize combined school codes in audit (unique schools)
  const combSchoolMap = new Map();
  combinedOut.forEach((row) => {
    const code = toFull26(row['School ID']);
    if (!combSchoolMap.has(code)) {
      combSchoolMap.set(code, {
        code,
        rawId: row['School ID'],
        name: row['School Name'],
        isSc: code.startsWith('SC-'),
        totalKits: 0,
        lines: 0,
      });
    }
    const s = combSchoolMap.get(code);
    s.totalKits += Number(row.Quantity) || 0;
    s.lines += 1;
  });
  const combSchools = [...combSchoolMap.values()];
  const scCount = combSchools.filter((s) => s.isSc).length;
  const nscCount = combSchools.filter((s) => !s.isSc).length;

  // --- Cross-sheet overlap checks ---
  const finalCodeSet = new Set(final176.map((r) => norm(r['School ID']).toUpperCase()));
  const combCodeSet = new Set(combSchools.map((s) => s.code));
  const overlapFinalComb = [...combCodeSet].filter((c) => finalCodeSet.has(c));
  if (overlapFinalComb.length) {
    audit.irregularities.push({
      severity: 'high',
      type: 'final_combined_code_overlap',
      codes: overlapFinalComb,
    });
  }

  // --- Write outputs ---
  const wbFinal = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbFinal, XLSX.utils.json_to_sheet(final176), `Acknowledged_${final176.length}`);
  XLSX.writeFile(wbFinal, PATHS.outFinal);

  const wbComb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbComb, XLSX.utils.json_to_sheet(combinedOut), 'School_Kit_Data');
  XLSX.writeFile(wbComb, PATHS.outCombined);

  const wbDist = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbDist,
    XLSX.utils.json_to_sheet([{
      Note: 'All schools merged — see FINAL_DATA_CLEAN_164 and SC_WIZKLUB_Combined_CLEAN_36',
    }]),
    'School Kits Distribution',
  );
  XLSX.writeFile(wbDist, PATHS.outDist);

  const finalTotalKits = final176.reduce((s, r) => s + Number(r['Total Kit Quantity'] || 0), 0);
  const combTotalKits = combSchools.reduce((s, r) => s + r.totalKits, 0);

  if (finalDupCodes.length) {
    audit.irregularities.push({ severity: 'high', type: 'duplicate_final_codes', codes: [...new Set(finalDupCodes)] });
  }
  if (combSchools.length !== 36) {
    audit.warnings.push({
      type: 'combined_school_count',
      expected: 36,
      actual: combSchools.length,
    });
  }
  if (scCount !== 24) {
    audit.warnings.push({ type: 'combined_sc_count', expected: 24, actual: scCount });
  }
  if (nscCount !== 12) {
    audit.warnings.push({ type: 'combined_nsc_count', expected: 12, actual: nscCount });
  }
  const aliasAlreadyInFinal = distRemovedOverlap.filter((r) => r.note === 'Already acknowledged in FINAL_DATA (alias row)');

  audit.summary = {
    generatedAt: new Date().toISOString(),
    outputs: {
      final176: PATHS.outFinal,
      combined36: PATHS.outCombined,
      distEmpty: PATHS.outDist,
    },
    finalData: {
      schools: final176.length,
      totalKits: finalTotalKits,
      fromClean152: final152.length,
      addedFromDistributionNewCodes: distToFinalSrc.length,
      distributionAliasAlreadyInFinal: aliasAlreadyInFinal.map((r) => ({
        code: r.code,
        name: r.name,
        matchedFinalName: final152.find((f) => norm(f['School ID']).toUpperCase() === r.code.toUpperCase())?.['School Name'],
      })),
    },
    combined2026Pending: {
      schools: combSchools.length,
      scSchools: scCount,
      nscSchools: nscCount,
      totalKits: combTotalKits,
      addedFromDistribution: combinedAdded,
      kitLines: combinedOut.length,
    },
    distributionMerged: {
      originalSchools: distAll.length,
      removedOrMerged: distRemovedOverlap.length,
      movedToFinalNewSchools: distToFinalSrc.length,
      movedToCombined: distToCombinedSrc.length,
      aliasAlreadyAcknowledged: aliasAlreadyInFinal.length,
      remainingInCleanDist: 0,
    },
    irregularityCount: audit.irregularities.length,
    warningCount: audit.warnings.length,
    status: audit.irregularities.length === 0 ? 'CLEAN' : 'HAS_ISSUES',
  };

  fs.writeFileSync(PATHS.outAudit, JSON.stringify(audit, null, 2));

  console.log(JSON.stringify(audit.summary, null, 2));
  if (audit.irregularities.length) {
    console.log('\nIRREGULARITIES:');
    audit.irregularities.forEach((i) => console.log('-', JSON.stringify(i)));
  }
  if (audit.warnings.length) {
    console.log('\nWARNINGS:');
    audit.warnings.forEach((w) => console.log('-', JSON.stringify(w)));
  }

  return audit;
}

build();
