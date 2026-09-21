# Inventory Spreadsheet Data — Problems & Resolution Log

**Project:** WizKlub Inventory bootstrap  
**Date:** September 2026  
**Source files:** `FINAL_DATA.xlsx`, `school_kits_distribution.xlsx`, `SC_WIZKLUB_Combined_Single_Sheet.xlsx`

This document records every significant data problem discovered while preparing inventory spreadsheets for MongoDB seeding, why each problem occurred, and how it was resolved (or what remains open).

Clean outputs live in the user's `Downloads/final data/` folder. Regenerate with:

```bash
node backend/inventory/scripts/buildCleanInventorySpreadsheets.js
```

---

## 1. Executive summary

| Area | Problem count | Status |
|------|---------------|--------|
| Startup crash (duplicate SC codes) | 2 critical | Fixed in clean data (4 schools excluded) |
| FINAL_DATA duplicate / alias rows | 14 codes | Fixed in clean data |
| Wrong sheet for pending schools | 41 + 36 schools | Fixed — split by ack status |
| Cross-sheet overlaps | 15 + 2 schools | Fixed — merged into combined |
| SC code conflicts (Gurugram / Valasaravakkam) | 1 pair | Fixed — codes reassigned |
| Schools missing from all clean sheets | 4 schools | **Open — needs new SC codes** |
| Flat kit counts in distribution | 41 schools | Noted — combined sheet preferred for /26 |

**Clean output files:** `FINAL_DATA_CLEAN_164.xlsx`, `SC_WIZKLUB_Combined_CLEAN_36.xlsx`, `school_kits_distribution_CLEAN.xlsx` (empty)

---

## 2. Problem: Docker startup crash (E11000 duplicate key)

### Symptom
Backend container crash-looped on startup with:
```
E11000 duplicate key error collection: wizklub-inventory.schools
index: code_1 dup key: { code: "SC-024/24" }
```

### Root cause
`syncFinalDataSpreadsheet.js` reads **every row** in `FINAL_DATA.xlsx` and calls `School.create()` when no match is found. The MongoDB `School` model requires **unique** `code` (SC code). Two rows shared the same code:

| SC Code | School 1 | School 2 |
|---------|----------|----------|
| SC-024/24 | Kompally 2 (196 kits) | Mehdipatnam (181 kits) |
| SC-028/22 | International school Vijayawada (239 kits) | Thoraipakkam (329 kits) |

### Where it failed
```
start-backends.sh
  → ensureExcelInventorySync.js
    → repairExcelInventoryTotals.js
      → syncFinalDataSpreadsheet.js  →  School.create()  💥
```

### Resolution
- Removed both rows for each broken code from acknowledged data (4 schools, 945 kits excluded until fixed).
- Clean FINAL_DATA has **no duplicate SC codes**.

### Still open
Assign **new unique SC codes** to Mehdipatnam and Thoraipakkam (and confirm Vijayawada vs Thoraipakkam split), then re-add to FINAL_DATA.

---

## 3. Problem: FINAL_DATA mixed acknowledged and pending schools

### Symptom
`FINAL_DATA.xlsx` had **197 rows** but only **156** had kit data. **41 rows** had empty / null kits.

### Root cause
FINAL_DATA was treated as “all schools” instead of **“sent and acknowledged only”**. The 41 no-kit schools were actually **pending acknowledgment** — their kit data lives in `school_kits_distribution.xlsx`.

### Resolution
- **FINAL_DATA** = only rows **with kits** (acknowledged).
- **41 no-kit schools** → sourced from `school_kits_distribution` or `SC_WIZKLUB_Combined` as pending.

---

## 4. Problem: 14 duplicate SC codes in FINAL_DATA

### Symptom
14 SC codes appeared **twice** in FINAL_DATA (28 rows).

### Two categories

#### A. Alias duplicates (12 codes) — naming variants, one empty
Same SC code, two spellings; one row had kits, one did not.

| SC Code | Empty row (pending) | Row with kits (ack) |
|---------|---------------------|---------------------|
| SC-002/22 | Coimbatore | coimbatore 1 |
| SC-002/23 | Kaggadsapura 3 | Kaggadasapura 3 |
| SC-004/25 | Nashik | Nashik 1 |
| SC-006/23 | Aurangabad | AURANGABAD 1 |
| SC-009/23 | Kaggadasapura Sanskriti | Kaggadasapura 2 |
| SC-010/24 | Varthur | Future Pathways Global School Varthur |
| SC-021/22 | Hosur | Hosur 1 |
| SC-025/22 | Tumkur | Tumkur 1 |
| SC-034/24 | Ghaziabad | Ghaziabad 1 |
| SC-040/22 | Marthahally | marthahally 1 |
| SC-065/22 | Ram Murthy Nagar | Ram Murthy Nagar 1 |
| SC-078/22 | New Town | New Town 1 |

**Risk:** Importing both rows creates duplicate schools or double-counted kits.

**Resolution:** Keep only the **with-kits** row in FINAL_DATA. Empty alias → pending in distribution (or already merged).

#### B. Broken duplicates (2 codes) — see Section 2
Both rows had kits; different real schools shared one code.

---

## 5. Problem: Three sheets with unclear roles

### Symptom
Same schools appeared in multiple files with different kit counts and statuses.

### Intended model (after cleanup)

| Sheet | Meaning | School count | Kit total |
|-------|---------|--------------|-----------|
| **FINAL_DATA** | Sent **and acknowledged** | 164 | 41,726 |
| **SC_WIZKLUB_Combined** | 2026 joined, sent, **not** ack | 36 (24 SC + 12 NSC) | 9,517 |
| **school_kits_distribution** | Was pending ack (older) | 0 (merged) | — |

### Root cause
Startup script loaded only `FINAL_DATA.xlsx` + old split not-ack files (`SC-SCHOOL-NOT_ACKNOWLEDGED.xlsx`, `WIZKLUB_NOT_ACKNOWLEDGED.xlsx`), not the user’s updated distribution / combined sheets.

---

## 6. Problem: 15 SC `/26` schools in both distribution and combined

### Symptom
After normalizing combined codes to `/26`, **15 schools** appeared in **both** `school_kits_distribution` and `SC_WIZKLUB_Combined`.

### Root cause
2026 schools were copied into distribution (flat 293 kits each) while also existing in the combined sheet with **detailed per-kit rows**.

### Risk
Double-loading pending dispatches for the same school.

### Resolution
- Remove all 15 from distribution.
- Use **combined sheet only** for those schools.

---

## 7. Problem: Gurugram 12 vs Valasaravakkam SC code conflict

### Symptom
Same SC code used for **different schools** across files:

| Sheet | SC-012/26 | SC-013/26 |
|-------|-----------|-----------|
| school_kits_distribution | Valasaravakkam | Gurugram 12 |
| SC_WIZKLUB_Combined | Gurugram 12 | — |

### Resolution (agreed mapping)
| School | Correct code | Source sheet |
|--------|--------------|--------------|
| Gurugram 12 | **SC-012/26** | Combined |
| Valasaravakkam | **SC-013/26** | Combined (moved from distribution) |

---

## 8. Problem: 24 distribution schools “move to acknowledged” — only 12 were new

### Symptom
Plan was: move all **24** non-`/26` schools from distribution to FINAL as acknowledged → expect **176** schools (152 + 24).

### Root cause
**12 of the 24** shared SC codes with schools **already in FINAL_DATA** under different names (alias pairs from Section 4A).

### Resolution
- **12 new schools** added to FINAL (Agra, Bikaner, Dehradun, etc.).
- **12 alias schools** marked “already acknowledged” — not duplicated.
- Final count: **164 schools**, not 176.

---

## 9. Problem: Flat 293 kit count in distribution

### Symptom
Almost every school in `school_kits_distribution.xlsx` showed exactly **293 kits**.

### Root cause
Wide-format placeholder export, not actual per-school totals.

### Impact
Combined sheet has accurate per-kit breakdown for 2026 schools. Agra 2 and Valasaravakkam still use 293-kit wide data from distribution.

---

## 10. Problem: Four schools excluded from all clean data

| School | SC Code | Kits | Issue |
|--------|---------|------|-------|
| Kompally 2 | SC-024/24 | 196 | Shares code with Mehdipatnam |
| Mehdipatnam | SC-024/24 | 181 | Shares code with Kompally 2 |
| International school Vijayawada | SC-028/22 | 239 | Shares code with Thoraipakkam |
| Thoraipakkam | SC-028/22 | 329 | Different region from Vijayawada |

**Total excluded kits: 945** — **action required** from operations.

---

## 11. Infrastructure issues (related)

| Issue | Workaround |
|-------|------------|
| `host.docker.internal` fails on Windows host | Run scripts inside Docker container or use `127.0.0.1` |
| Partial seed + restart loop | Drop DB before re-seed after data fixes |

---

## 12. Code / startup gaps

| Gap | Detail |
|-----|--------|
| Startup loads all FINAL rows | Should skip empty-kit rows |
| No dedup by SC code | Should keep one row per code |
| Old not-ack files in Docker image | vs user’s combined sheet |
| `school_kits_distribution` not in startup | Script exists but not wired in `start-backends.sh` |

---

## 13. Recommended next steps

1. Assign new SC codes for Mehdipatnam and Thoraipakkam.
2. Copy clean xlsx files into `backend/inventory/data/`.
3. Update startup scripts to use clean files and skip empty/duplicate rows.
4. Drop DB and rebuild containers.

---

*See also: `INVENTORY_DATA_AUDIT_REPORT.md` in Downloads, `scripts/buildCleanInventorySpreadsheets.js`*
