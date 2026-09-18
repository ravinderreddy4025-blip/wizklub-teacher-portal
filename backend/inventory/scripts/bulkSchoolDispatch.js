/**
 * Bulk School Verification & Kit Dispatch Script
 *
 * Usage:
 *   node scripts/bulkSchoolDispatch.js            # dry-run (read-only)
 *   node scripts/bulkSchoolDispatch.js --commit    # actually write to DB
 *
 * What it does:
 *   1. Checks which schools from the spreadsheet are registered (by code, fallback by name)
 *   2. Updates joiningYear on matched schools
 *   3. Ensures all catalog kit types exist in the Kit collection
 *   4. Creates Dispatch + SchoolInventory records (qty 12 per kit per school)
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { loadRootEnv, resolveInventoryMongoUri } = require('../src/config/loadEnv');

loadRootEnv();

const School = require('../src/models/School');
const Kit = require('../src/models/Kit');
const Dispatch = require('../src/models/Dispatch');
const SchoolInventory = require('../src/models/SchoolInventory');
const Division = require('../src/models/Division');
const User = require('../src/models/User');
const { formatComponentId } = require('../src/utils/componentId');
const { generateUniqueDispatchIds } = require('../src/utils/dispatchId');
const dispatchCycle = require('../src/utils/dispatchCycle');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const COMMIT = process.argv.includes('--commit');
const QUANTITY_PER_KIT = 12;

const COMPONENT_KITS_PATH = path.join(__dirname, '../data/component-kits.json');
let componentKitsCatalog = [];
try {
  componentKitsCatalog = JSON.parse(fs.readFileSync(COMPONENT_KITS_PATH, 'utf8'));
} catch (_) {}
const COMPONENT_KIT_MAP = new Map(
  componentKitsCatalog.map((k) => [String(k.kitId || '').trim().toUpperCase(), k])
);

// Official kit IDs from component-kits.json
const ALL_KIT_IDS = componentKitsCatalog
  .map((k) => String(k.kitId || '').trim().toUpperCase())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Spreadsheet data (147 rows; Madhurawada 5 skipped — no School ID)
// ---------------------------------------------------------------------------
const SCHOOL_DATA = [
  { state: 'Andhra Pradesh', branch: 'Asilmetta 3', am: 'Sandeep Kumar', schoolId: 'SC-098/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Eluru Cbse', am: 'Sandeep Kumar', schoolId: 'SC-031/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Ganapavaram', am: 'Sandeep Kumar', schoolId: 'SC-089/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Guntur Res', am: 'Sandeep Kumar', schoolId: 'SC-002/25', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'International School', am: 'Sandeep Kumar', schoolId: 'SC-031/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'International School Whitehouse', am: 'Sandeep Kumar', schoolId: 'SC-060/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Intl Bezawada', am: 'Sandeep Kumar', schoolId: 'SC-027/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Kakinada 3', am: 'Sandeep Kumar', schoolId: 'SC-080/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Kurmannapalem', am: 'Sandeep Kumar', schoolId: 'SC-018/23', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Madhurawada', am: 'Sandeep Kumar', schoolId: 'SC-099/22', amEmail: 'sandeep.kumar@wizklub.in' },
  // Madhurawada 5 — SKIPPED (no School ID)
  { state: 'Andhra Pradesh', branch: 'Palakol 2', am: 'Sandeep Kumar', schoolId: 'SC-090/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Rajahmundry 1', am: 'Sandeep Kumar', schoolId: 'SC-007/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Reddypalem DS', am: 'Sandeep Kumar', schoolId: 'SC-003/25', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'Tadepalligudem Cbse', am: 'Sandeep Kumar', schoolId: 'SC-011/23', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Andhra Pradesh', branch: 'TSN Puram', am: 'Sandeep Kumar', schoolId: 'SC-094/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Bengaluru', branch: 'Banaswadi', am: 'Aditi Ashok Katti', schoolId: 'SC-009/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Bannerghatta Road', am: 'Aditi Ashok Katti', schoolId: 'SC-024/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Basavanagudi', am: 'Aditi Ashok Katti', schoolId: 'SC-045/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Electronic City International', am: 'Aditi Ashok Katti', schoolId: 'SC-018/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Hebbal', am: 'Aditi Ashok Katti', schoolId: 'SC-032/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Hsr Layout', am: 'Aditi Ashok Katti', schoolId: 'SC-001/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'JP Nagar', am: 'Aditi Ashok Katti', schoolId: 'SC-006/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Kaggadasapura', am: 'Aditi Ashok Katti', schoolId: 'SC-063/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Kaggadasapura Sanskriti', am: 'Aditi Ashok Katti', schoolId: 'SC-009/23', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Kaggadsapura 3', am: 'Aditi Ashok Katti', schoolId: 'SC-002/23', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Kanakapura Road', am: 'Aditi Ashok Katti', schoolId: 'SC-013/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'KR Puram', am: 'Aditi Ashok Katti', schoolId: 'SC-010/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Kudlu', am: 'Aditi Ashok Katti', schoolId: 'SC-061/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Kudlu 2', am: 'Aditi Ashok Katti', schoolId: 'SC-053/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'M S Palya', am: 'Aditi Ashok Katti', schoolId: 'SC-036/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Mahalakshmi Layout', am: 'Aditi Ashok Katti', schoolId: 'SC-007/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Marthahally', am: 'Aditi Ashok Katti', schoolId: 'SC-040/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Marthahally 2', am: 'Aditi Ashok Katti', schoolId: 'SC-011/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Nagarbhavi', am: 'Aditi Ashok Katti', schoolId: 'SC-064/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Peenya Dasarahalli', am: 'Aditi Ashok Katti', schoolId: 'SC-056/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Rajaji Nagar', am: 'Aditi Ashok Katti', schoolId: 'SC-016/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Ram Murthy Nagar', am: 'Aditi Ashok Katti', schoolId: 'SC-065/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Ram Murthy Nagar 3', am: 'Aditi Ashok Katti', schoolId: 'SC-026/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Ram Murthy Nagar 4', am: 'Aditi Ashok Katti', schoolId: 'SC-001/23', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Seshadripuram', am: 'Aditi Ashok Katti', schoolId: 'SC-012/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Ullal', am: 'Aditi Ashok Katti', schoolId: 'SC-003/23', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Uttarahalli', am: 'Aditi Ashok Katti', schoolId: 'SC-017/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Varthur', am: 'Aditi Ashok Katti', schoolId: 'SC-010/24', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Vidyaranyapura', am: 'Aditi Ashok Katti', schoolId: 'SC-023/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Whitefield', am: 'Aditi Ashok Katti', schoolId: 'SC-008/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Yellahanka', am: 'Aditi Ashok Katti', schoolId: 'SC-037/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Bengaluru', branch: 'Yeshwanthpur', am: 'Aditi Ashok Katti', schoolId: 'SC-066/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Chennai', branch: 'Iyyapanthangal', am: 'John Emmanuel', schoolId: 'SC-022/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Keelkattalai', am: 'John Emmanuel', schoolId: 'SC-019/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'KK Nagar', am: 'John Emmanuel', schoolId: 'SC-005/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Madhavaram', am: 'John Emmanuel', schoolId: 'SC-067/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Manapakkam', am: 'John Emmanuel', schoolId: 'SC-003/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Moolakadai', am: 'John Emmanuel', schoolId: 'SC-068/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Mylapore', am: 'John Emmanuel', schoolId: 'SC-043/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Nolambur', am: 'John Emmanuel', schoolId: 'SC-029/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Palavakkam', am: 'John Emmanuel', schoolId: 'SC-054/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Pallavaram', am: 'John Emmanuel', schoolId: 'SC-069/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Pallavaram 2', am: 'John Emmanuel', schoolId: 'SC-039/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Perumbakkam', am: 'John Emmanuel', schoolId: 'SC-070/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Perungudi', am: 'John Emmanuel', schoolId: 'SC-071/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Poonamallee International School', am: 'John Emmanuel', schoolId: 'SC-072/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Ramapuram', am: 'John Emmanuel', schoolId: 'SC-042/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Royapuram', am: 'John Emmanuel', schoolId: 'SC-020/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Selaiyur', am: 'John Emmanuel', schoolId: 'SC-011/24', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Tambaram', am: 'John Emmanuel', schoolId: 'SC-073/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Thoraipakkam', am: 'John Emmanuel', schoolId: 'SC-028/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Chennai', branch: 'Velachery', am: 'John Emmanuel', schoolId: 'SC-074/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Maharashtra', branch: 'Aurangabad', am: 'Aditi Ashok Katti', schoolId: 'SC-006/23', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Maharashtra', branch: 'Aurangabad 2', am: 'Aditi Ashok Katti', schoolId: 'SC-023/24', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Maharashtra', branch: 'Bavadhan', am: 'Aditi Ashok Katti', schoolId: 'SC-049/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Maharashtra', branch: 'Dombivali', am: 'Aditi Ashok Katti', schoolId: 'SC-003/24', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Maharashtra', branch: 'Nanded', am: 'Aditi Ashok Katti', schoolId: 'SC-010/23', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Maharashtra', branch: 'Nashik', am: 'Aditi Ashok Katti', schoolId: 'SC-004/25', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Maharashtra', branch: 'Nashik 2', am: 'Aditi Ashok Katti', schoolId: 'SC-005/25', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Maharashtra', branch: 'Ulhasnagar', am: 'Aditi Ashok Katti', schoolId: 'SC-087/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Maharashtra', branch: 'Wagholi', am: 'Aditi Ashok Katti', schoolId: 'SC-044/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of India', branch: 'Faridabad', am: 'Himanshu Verma', schoolId: 'SC-008/23', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Faridabad 2', am: 'Himanshu Verma', schoolId: 'SC-016/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Ghaziabad', am: 'Himanshu Verma', schoolId: 'SC-034/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Ghaziabad 2', am: 'Himanshu Verma', schoolId: 'SC-035/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Gurugram 1', am: 'Himanshu Verma', schoolId: 'SC-059/22', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Gurugram 2', am: 'Himanshu Verma', schoolId: 'SC-047/22', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Gurugram 3', am: 'Himanshu Verma', schoolId: 'SC-012/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Gurugram 4', am: 'Himanshu Verma', schoolId: 'SC-058/22', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Gurugram 6', am: 'Himanshu Verma', schoolId: 'SC-017/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Gurugram 9', am: 'Himanshu Verma', schoolId: 'SC-018/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Noida 1', am: 'Himanshu Verma', schoolId: 'SC-005/23', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Noida 2', am: 'Himanshu Verma', schoolId: 'SC-005/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Noida 3', am: 'Himanshu Verma', schoolId: 'SC-002/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Ambala', am: 'Himanshu Verma', schoolId: 'SC-015/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Karnal', am: 'Himanshu Verma', schoolId: 'SC-006/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Panipat', am: 'Himanshu Verma', schoolId: 'SC-019/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Dhuri 2', am: 'Himanshu Verma', schoolId: 'SC-026/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Hathan', am: 'Himanshu Verma', schoolId: 'SC-027/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Jalandhar', am: 'Himanshu Verma', schoolId: 'SC-028/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Malsian', am: 'Himanshu Verma', schoolId: 'SC-029/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Sunam', am: 'Himanshu Verma', schoolId: 'SC-030/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Bikaner', am: 'Himanshu Verma', schoolId: 'SC-012/23', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Jaipur 1', am: 'Himanshu Verma', schoolId: 'SC-057/22', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Jaipur 2', am: 'Himanshu Verma', schoolId: 'SC-007/23', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Jaipur 3', am: 'Himanshu Verma', schoolId: 'SC-004/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Jaipur 4', am: 'Himanshu Verma', schoolId: 'SC-032/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Jodhpur', am: 'Himanshu Verma', schoolId: 'SC-013/23', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Agra', am: 'Himanshu Verma', schoolId: 'SC-095/22', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Lucknow 1', am: 'Himanshu Verma', schoolId: 'SC-096/22', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Muzaffarnagar', am: 'Himanshu Verma', schoolId: 'SC-097/22', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Shamli', am: 'Himanshu Verma', schoolId: 'SC-017/23', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of India', branch: 'Dehradun', am: 'Himanshu Verma', schoolId: 'SC-036/24', amEmail: 'himanshu.verma@infinitylearn.com' },
  { state: 'Rest of Karnataka', branch: 'Ballari School', am: 'Aditi Ashok Katti', schoolId: 'SC-030/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Davanagere', am: 'Aditi Ashok Katti', schoolId: 'SC-051/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Dr.B.S Rao Vidya Soudha Mysore', am: 'Aditi Ashok Katti', schoolId: 'SC-001/25', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Gangavathi', am: 'Aditi Ashok Katti', schoolId: 'SC-046/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Hospet', am: 'Aditi Ashok Katti', schoolId: 'SC-048/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Hubli', am: 'Aditi Ashok Katti', schoolId: 'SC-038/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Mandya', am: 'Aditi Ashok Katti', schoolId: 'SC-081/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Mangalore', am: 'Aditi Ashok Katti', schoolId: 'SC-015/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Raichur-3', am: 'Aditi Ashok Katti', schoolId: 'SC-082/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Sindhanur', am: 'Aditi Ashok Katti', schoolId: 'SC-083/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Tumkur', am: 'Aditi Ashok Katti', schoolId: 'SC-025/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Karnataka', branch: 'Tumkur 3', am: 'Aditi Ashok Katti', schoolId: 'SC-014/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Coimbatore', am: 'John Emmanuel', schoolId: 'SC-002/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Coimbatore 2', am: 'John Emmanuel', schoolId: 'SC-035/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Coimbatore 4', am: 'John Emmanuel', schoolId: 'SC-052/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Coimbatore 6', am: 'John Emmanuel', schoolId: 'SC-008/25', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Dindigul', am: 'John Emmanuel', schoolId: 'SC-009/25', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Erode', am: 'John Emmanuel', schoolId: 'SC-034/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Hosur', am: 'John Emmanuel', schoolId: 'SC-021/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Hosur 2', am: 'John Emmanuel', schoolId: 'SC-041/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Hosur 3', am: 'John Emmanuel', schoolId: 'SC-004/23', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Karur', am: 'John Emmanuel', schoolId: 'SC-091/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Krishnagiri', am: 'John Emmanuel', schoolId: 'SC-015/23', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Namakkal', am: 'John Emmanuel', schoolId: 'SC-092/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Salem', am: 'John Emmanuel', schoolId: 'SC-004/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Thiruvanamalai', am: 'John Emmanuel', schoolId: 'SC-016/23', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Tiruppur', am: 'John Emmanuel', schoolId: 'SC-093/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Tiruppur 2', am: 'John Emmanuel', schoolId: 'SC-010/25', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Rest of Tamil Nadu', branch: 'Trichy', am: 'John Emmanuel', schoolId: 'SC-055/22', amEmail: 'john.emmanuel@wizklub.in' },
  { state: 'Telangana', branch: 'Adibatla', am: 'Sandeep Kumar', schoolId: 'SC-013/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Chaitanyapuri Cbse', am: 'Sandeep Kumar', schoolId: 'SC-075/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Ecil 3', am: 'Sandeep Kumar', schoolId: 'SC-085/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Gundla Pochampally Cbse', am: 'Sandeep Kumar', schoolId: 'SC-021/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Hasmathpet', am: 'Sandeep Kumar', schoolId: 'SC-086/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Himayatnagar', am: 'Sandeep Kumar', schoolId: 'SC-006/25', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Jubilee Hills', am: 'Sandeep Kumar', schoolId: 'SC-062/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Khalsa', am: 'Sandeep Kumar', schoolId: 'SC-076/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Kompally 2', am: 'Sandeep Kumar', schoolId: 'SC-024/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Kompally 5', am: 'Sandeep Kumar', schoolId: 'SC-084/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Manikonda', am: 'Sandeep Kumar', schoolId: 'SC-008/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Mehdipatnam', am: 'Sandeep Kumar', schoolId: 'SC-024/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Nacharam', am: 'Sandeep Kumar', schoolId: 'SC-088/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Nagole', am: 'Sandeep Kumar', schoolId: 'SC-014/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Nallagandla', am: 'Sandeep Kumar', schoolId: 'SC-033/22', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Nallakunta', am: 'Sandeep Kumar', schoolId: 'SC-007/25', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'NTPC Ramagundam', am: 'Sandeep Kumar', schoolId: 'SC-033/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Ramagundam', am: 'Sandeep Kumar', schoolId: 'SC-014/23', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'Telangana', branch: 'Sr Nagar', am: 'Sandeep Kumar', schoolId: 'SC-009/24', amEmail: 'sandeep.kumar@wizklub.in' },
  { state: 'West Bengal', branch: 'Bada Bazar', am: 'Aditi Ashok Katti', schoolId: 'SC-077/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'West Bengal', branch: 'Dunlop', am: 'Aditi Ashok Katti', schoolId: 'SC-050/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'West Bengal', branch: 'Howrah', am: 'Aditi Ashok Katti', schoolId: 'SC-020/24', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'West Bengal', branch: 'New Town', am: 'Aditi Ashok Katti', schoolId: 'SC-078/22', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'West Bengal', branch: 'New Town 2', am: 'Aditi Ashok Katti', schoolId: 'SC-001/24', amEmail: 'aditi.katti@wizklub.in' },
  { state: 'West Bengal', branch: 'Serampore', am: 'Aditi Ashok Katti', schoolId: 'SC-079/22', amEmail: 'aditi.katti@wizklub.in' },
];

// Explicit aliases for spreadsheet branches that have slight name differences in the DB
const BRANCH_ALIASES = {
  'intl bezawada': 'Sri Chaitanya-International Bezawada',
  'tadepalligudem cbse': 'Sri Chaitanya-Tadepalligudem',
  'kaggadsapura 3': 'Sri Chaitanya-Kaggadasapura 3',
  'yellahanka': 'Sri Chaitanya-Yelahanka',
  'ballari school': 'Sri Chaitanya-Ballari',
  'raichur-3': 'Sri Chaitanya-Raichur 3',
  'thiruvanamalai': 'Sri Chaitanya-Tiruvannamalai',
  'new town': 'Sri Chaitanya-New Town 1',
  'new town 2': 'Sri Chaitanya-New Town\t2',
};

const STATE_TO_DIVISION = {
  'andhra pradesh': 'Andhra Pradesh',
  'bengaluru': 'Bengaluru',
  'chennai': 'Tamil Nadu',
  'maharashtra': 'Maharashtra',
  'rest of india': 'Delhi NCR',
  'rest of karnataka': 'Karnataka',
  'rest of tamil nadu': 'Tamil Nadu',
  'telangana': 'Telangana',
  'west bengal': 'West Bengal',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse /YY from school code → full year (e.g. /22 → 2022) */
function parseJoiningYear(schoolId) {
  const m = String(schoolId || '').match(/\/(\d{2})$/);
  if (!m) return null;
  return 2000 + Number(m[1]);
}

/** Case-insensitive name match — tries substring match and aliases */
function findSchoolByName(allSchools, branchName) {
  const clean = (str) => String(str || '').replace(/\s+/g, ' ').toLowerCase().trim();
  const lower = branchName.toLowerCase().trim();

  // 1. Direct alias check
  if (BRANCH_ALIASES[lower]) {
    const target = clean(BRANCH_ALIASES[lower]);
    const m = allSchools.find((s) => clean(s.name) === target);
    if (m) return m;
  }

  // 2. Exact match (with whitespace normalization)
  const normBranch = clean(branchName);
  let match = allSchools.find((s) => clean(s.name) === normBranch);
  if (match) return match;

  // 3. Match with "Sri Chaitanya-" prefix
  const scPrefix = `sri chaitanya-${normBranch}`;
  match = allSchools.find((s) => clean(s.name) === scPrefix);
  if (match) return match;

  // 4. Substring contains
  match = allSchools.find((s) => clean(s.name).includes(normBranch));
  if (match) return match;

  // 5. Reverse contains
  match = allSchools.find((s) => normBranch.includes(clean(s.name)));
  if (match) return match;

  return null;
}

function log(msg) {
  console.log(msg);
}

function section(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(70)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const mongoUri = resolveInventoryMongoUri();
  if (!mongoUri) {
    console.error('No MONGODB_URI / MONGO_URI found. Check your .env file.');
    process.exit(1);
  }

  log(`Connecting to: ${mongoUri.replace(/\/\/[^@]+@/, '//<credentials>@')}`);
  await mongoose.connect(mongoUri);
  log('Connected to MongoDB\n');
  log(`Mode: ${COMMIT ? '🔴 COMMIT (writes enabled)' : '🟢 DRY-RUN (read-only)'}`);

  // =========================================================================
  // PHASE 1: Check school registration
  // =========================================================================
  section('PHASE 1: School Registration Check');

  const allSchoolCodes = SCHOOL_DATA.map((r) => r.schoolId);
  const existingByCode = await School.find({ code: { $in: allSchoolCodes } });
  const codeMap = new Map(existingByCode.map((s) => [s.code, s]));

  // For schools not found by code, try name match
  const allSchoolDocs = await School.find({});

  const registered = [];
  const unregistered = [];
  const nameMatched = [];

  for (const row of SCHOOL_DATA) {
    let schoolDoc = codeMap.get(row.schoolId);
    if (schoolDoc) {
      registered.push({ ...row, schoolDoc, matchedBy: 'code' });
    } else {
      // Fallback: match by branch name
      schoolDoc = findSchoolByName(allSchoolDocs, row.branch);
      if (schoolDoc) {
        nameMatched.push({ ...row, schoolDoc, matchedBy: 'name', oldCode: schoolDoc.code });
        registered.push({ ...row, schoolDoc, matchedBy: 'name', oldCode: schoolDoc.code });
      } else {
        unregistered.push(row);
      }
    }
  }

  log(`\nTotal schools in data: ${SCHOOL_DATA.length}`);
  log(`  ✅ Matched by code:  ${registered.length - nameMatched.length}`);
  log(`  🔄 Matched by name:  ${nameMatched.length} (code will be updated)`);
  log(`  ❌ NOT registered:   ${unregistered.length}`);

  if (nameMatched.length > 0) {
    log('\n--- Schools matched by NAME (code will be updated) ---');
    for (const r of nameMatched) {
      log(`  ${r.state} / ${r.branch}  |  DB name: "${r.schoolDoc.name}"  |  old code: ${r.oldCode} → new code: ${r.schoolId}`);
    }
  }

  if (unregistered.length > 0) {
    log('\n--- UNREGISTERED schools (to be created in DB) ---');
    for (const r of unregistered) {
      log(`  ${r.state} / ${r.branch}  |  School ID: ${r.schoolId}  |  AM: ${r.am}`);
    }
  }

  // =========================================================================
  // PHASE 1.5: Register / Create Unregistered Schools in DB
  // =========================================================================
  section('PHASE 1.5: Register Unregistered Schools');

  const divisions = await Division.find({});
  const divisionMap = new Map(divisions.map((d) => [d.name.toLowerCase().trim(), d]));
  const newlyCreated = [];

  if (unregistered.length > 0) {
    log(`  Registering ${unregistered.length} missing school(s) into database:`);
    for (const row of unregistered) {
      const divName = STATE_TO_DIVISION[row.state.toLowerCase().trim()] || row.state;
      const divDoc = divisionMap.get(divName.toLowerCase().trim()) || divisions[0];
      const joiningYear = parseJoiningYear(row.schoolId);
      const schoolName = `Sri Chaitanya-${row.branch}`;

      if (COMMIT) {
        let createdSchool = await School.findOne({ $or: [{ code: row.schoolId }, { name: schoolName }] });
        if (!createdSchool) {
          createdSchool = await School.create({
            name: schoolName,
            code: row.schoolId,
            joiningYear,
            divisionId: divDoc._id,
            contactEmail: row.amEmail,
            address: `${row.branch}, ${row.state}`,
            wizklubSchoolId: row.schoolId,
          });
          log(`    ✅ Created in DB: "${schoolName}" | Code: ${row.schoolId} | Year: ${joiningYear} | Division: ${divDoc.name}`);
        } else {
          log(`    ℹ️  School already exists in DB: "${createdSchool.name}" (${createdSchool.code})`);
        }
        registered.push({ ...row, schoolDoc: createdSchool, matchedBy: 'created' });
        newlyCreated.push({ ...row, schoolDoc: createdSchool });
      } else {
        const mockSchool = {
          _id: new mongoose.Types.ObjectId(),
          name: schoolName,
          code: row.schoolId,
          joiningYear,
          divisionId: divDoc._id,
        };
        registered.push({ ...row, schoolDoc: mockSchool, matchedBy: 'created' });
        newlyCreated.push({ ...row, schoolDoc: mockSchool });
        log(`    [dry-run] Would create in DB: "${schoolName}" | Code: ${row.schoolId} | Year: ${joiningYear} | Division: ${divDoc.name}`);
      }
    }
  } else {
    log('  All schools are already registered in the DB!');
  }

  // =========================================================================
  // PHASE 2: Update school code + joiningYear
  // =========================================================================
  section('PHASE 2: Update School Code & Joining Year');

  let codeUpdates = 0;
  let yearUpdates = 0;

  for (const r of registered) {
    if (r.matchedBy === 'created') continue; // already created with new code & year
    const school = r.schoolDoc;
    const joiningYear = parseJoiningYear(r.schoolId);
    const updates = {};

    // Update code if matched by name
    if (r.matchedBy === 'name' && school.code !== r.schoolId) {
      let targetCode = r.schoolId;
      if (COMMIT) {
        const inUse = await School.findOne({ code: targetCode, _id: { $ne: school._id } });
        if (inUse) {
          targetCode = `${r.schoolId}-1`;
          log(`    ⚠️  Code "${r.schoolId}" already in use by "${inUse.name}". Using "${targetCode}" for "${school.name}".`);
          r.schoolId = targetCode;
        }
      }
      updates.code = targetCode;
      codeUpdates++;
    }

    // Update joiningYear
    if (joiningYear && school.joiningYear !== joiningYear) {
      updates.joiningYear = joiningYear;
      yearUpdates++;
    }

    if (Object.keys(updates).length > 0) {
      log(`  ${r.branch} (${school.code}): ${JSON.stringify(updates)}`);
      if (COMMIT) {
        await School.updateOne({ _id: school._id }, { $set: updates });
      }
    }
  }

  log(`\nCode updates: ${codeUpdates} | Joining year updates: ${yearUpdates}`);

  // =========================================================================
  // PHASE 3: Ensure all kit types exist
  // =========================================================================
  section('PHASE 3: Ensure Kit Types Exist');

  const existingKits = await Kit.find({});
  const existingKitIds = new Set(existingKits.map((k) => k.kitId));
  const kitDocMap = new Map(existingKits.map((k) => [k.kitId, k]));

  const missingKits = ALL_KIT_IDS.filter((id) => !existingKitIds.has(id));
  const presentKits = ALL_KIT_IDS.filter((id) => existingKitIds.has(id));

  log(`  Already in DB: ${presentKits.length} (${presentKits.join(', ')})`);
  log(`  Missing:       ${missingKits.length} (${missingKits.join(', ')})`);

  if (missingKits.length > 0 && COMMIT) {
    for (const kitId of missingKits) {
      const catalogItem = COMPONENT_KIT_MAP.get(kitId);
      const newKit = await Kit.create({
        name: catalogItem?.name || `Kit ${kitId}`,
        kitId,
        type: catalogItem?.type || 'General',
        description: catalogItem?.description || '',
        warehouseQuantity: 0,
      });
      kitDocMap.set(kitId, newKit);
      log(`    Created kit: ${kitId} (${newKit._id})`);
    }
  } else if (missingKits.length > 0) {
    log('    (will be created on --commit)');
    // Add placeholder entries for dry-run reporting
    for (const kitId of missingKits) {
      const catalogItem = COMPONENT_KIT_MAP.get(kitId);
      kitDocMap.set(kitId, { _id: `<new-${kitId}>`, kitId, name: catalogItem?.name || `Kit ${kitId}` });
    }
  }

  // =========================================================================
  // PHASE 4: Create Dispatches
  // =========================================================================
  section('PHASE 4: Create Dispatches for Registered Schools');

  if (registered.length === 0) {
    log('  No registered schools to process.');
  }

  // Find an Admin user to use as createdBy
  let adminUser = await User.findOne({ role: 'Admin' });
  if (!adminUser) {
    log('  ⚠️  No Admin user found in DB. Will use first user as createdBy.');
    adminUser = await User.findOne({});
  }
  if (!adminUser) {
    log('  ❌ No users in DB at all. Cannot create dispatches.');
    await printSummary(registered, unregistered, nameMatched, 0, 0);
    await mongoose.disconnect();
    return;
  }
  log(`  Using admin user: ${adminUser.name} (${adminUser._id}) as createdBy`);

  let totalDispatchesCreated = 0;
  let totalInventoryUpdated = 0;
  let skippedExisting = 0;

  if (COMMIT) {
    const updatedPending = await Dispatch.updateMany(
      { category: 'New Dispatch', status: 'Dispatched' },
      {
        $set: {
          status: 'Completed',
          quantityAcknowledged: QUANTITY_PER_KIT,
          outstandingQuantity: 0,
        },
      }
    );
    if (updatedPending.modifiedCount > 0) {
      log(`  Marked ${updatedPending.modifiedCount} dispatches as Completed with 0 outstanding.`);
    }
  }

  for (const r of registered) {
    const school = r.schoolDoc;
    const joiningYear = parseJoiningYear(r.schoolId) || school.joiningYear;

    log(`\n  📍 ${r.branch} (${r.schoolId}):`);

    for (const kitId of ALL_KIT_IDS) {
      const kitDoc = kitDocMap.get(kitId);
      if (!kitDoc || !kitDoc._id) {
        log(`    ⚠️  Kit ${kitId} not found — skipping`);
        continue;
      }

      const componentId = formatComponentId({
        schoolCode: r.schoolId,
        joiningYear,
        kitId,
        quantity: QUANTITY_PER_KIT,
      });

      // Check if dispatch already exists for this school + kit combination
      if (COMMIT) {
        const existing = await Dispatch.findOne({
          school: school._id,
          kit: kitDoc._id,
          componentId,
        });
        if (existing) {
          skippedExisting++;
          continue;
        }
      }

      if (COMMIT) {
        const [dispatchId] = await generateUniqueDispatchIds(1);
        const now = new Date();

        const record = await Dispatch.create({
          kit: kitDoc._id,
          quantity: QUANTITY_PER_KIT,
          school: school._id,
          reportingManager: school.rmId || null,
          componentId,
          kitId: componentId,
          consignmentNo: '',
          category: 'New Dispatch',
          status: 'Completed',
          dispatchedAt: now,
          dispatchedBy: adminUser._id,
          dispatchId,
          createdBy: adminUser._id,
          quantityReceived: QUANTITY_PER_KIT,
          quantityInitial: QUANTITY_PER_KIT,
          quantityDispatched: QUANTITY_PER_KIT,
          quantityAcknowledged: QUANTITY_PER_KIT,
        });

        // Add initial cycle
        dispatchCycle.ensureInitialCycle(record, {
          quantity: QUANTITY_PER_KIT,
          kitId: componentId,
          consignmentNo: '',
          category: 'New Dispatch',
          dispatchedAt: now,
          dispatchedBy: adminUser._id,
        });
        // Mark cycle as acknowledged
        if (record.cycles && record.cycles.length > 0) {
          const cycle = record.cycles[record.cycles.length - 1];
          cycle.status = 'ACKNOWLEDGED';
          cycle.quantityAcknowledged = QUANTITY_PER_KIT;
          cycle.acknowledgedAt = now;
        }
        record.status = 'Completed';
        record.quantityAcknowledged = QUANTITY_PER_KIT;
        record.outstandingQuantity = 0;
        record.receivedAt = now;
        await record.save();

        // Upsert SchoolInventory
        await SchoolInventory.findOneAndUpdate(
          { school: school._id, kit: kitDoc._id },
          { $inc: { quantity: QUANTITY_PER_KIT } },
          { upsert: true, new: true }
        );

        totalDispatchesCreated++;
        totalInventoryUpdated++;
      } else {
        log(`    [dry-run] Would create dispatch: ${componentId}  (kit: ${kitId}, qty: ${QUANTITY_PER_KIT})`);
        totalDispatchesCreated++;
        totalInventoryUpdated++;
      }
    }
  }

  // =========================================================================
  // Summary
  // =========================================================================
  await printSummary(registered, unregistered, nameMatched, newlyCreated, totalDispatchesCreated, totalInventoryUpdated, skippedExisting);

  await mongoose.disconnect();
  log('\nDisconnected from MongoDB.');
}

async function printSummary(registered, unregistered, nameMatched, newlyCreated, dispatches, inventory, skipped = 0) {
  section('SUMMARY');
  log(`  Total schools in spreadsheet:     ${SCHOOL_DATA.length}`);
  log(`  Total schools active for dispatch:${registered.length}`);
  log(`    - matched by code:              ${registered.filter((r) => r.matchedBy === 'code').length}`);
  log(`    - matched by name:              ${nameMatched.length}`);
  log(`    - newly created in DB:          ${newlyCreated.length}`);
  log(`  Kit types:                        ${ALL_KIT_IDS.length}`);
  log(`  Dispatches created/planned:       ${dispatches}`);
  log(`  SchoolInventory updates:          ${inventory}`);
  if (skipped > 0) {
    log(`  Skipped (already existing):       ${skipped}`);
  }
  log(`  Quantity per kit per school:       ${QUANTITY_PER_KIT}`);
  log(`  Mode:                             ${COMMIT ? '🔴 COMMITTED' : '🟢 DRY-RUN (use --commit to write)'}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
