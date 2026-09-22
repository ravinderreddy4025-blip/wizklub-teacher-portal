#!/usr/bin/env node
/**
 * DEV ONLY — writes a realistic, deterministic school-health snapshot (HEALTH_CONTRACT.md v1) into a
 * *_dev database so the PMO "School health" screens can be built without the real snapshot job.
 *
 *   MONGODB_URI='mongodb://127.0.0.1:27018/?directConnection=true' \
 *   HEALTH_MONGO_DB_NAME=wizklub_health_dev node scripts/seedHealthFixture.js
 *
 * Refuses to write to a database whose name does not end in `_dev` (the real `wizklub_health` is owned
 * by the snapshot job). Replaces the fixture run each time.
 */
const { MongoClient } = require('mongodb');

const URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27018/?directConnection=true';
const DB = process.env.HEALTH_MONGO_DB_NAME || 'wizklub_health_dev';
if (!/_dev$/.test(DB)) {
  console.error(`Refusing to write fixture into "${DB}" — use a *_dev database.`);
  process.exit(1);
}

/* Health model v1 — single thresholds object (mirrors the contract). */
const THRESHOLDS = {
  delivery: { G: 90, A: 70 },
  participation: { G: 60, A: 40, min_lab_sessions: 2 },
  outcomes: { G: 60, A: 40, assessment_weight: 0.5, code_run_weight: 0.5 },
  attendance: { G: 80, A: 60, min_held: 3 },
  aggregate: { G: 60, A: 40 },
};

const RUN_ID = 'fixture-2026-09-19';
const DATA_AS_OF = '2026-09-18';
const AS_OF = new Date(`${DATA_AS_OF}T23:59:59+05:30`);

/* deterministic PRNG */
let seed = 20260919;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const iso = (d) => d.toISOString().slice(0, 10);
function gauss(mean, sd) {
  const u = rnd() || 1e-9;
  const v = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function band3(v, t) {
  if (v == null) return 'N';
  if (v >= t.G) return 'G';
  if (v >= t.A) return 'A';
  return 'R';
}
function worst(...bands) {
  const real = bands.filter((b) => b && b !== 'N');
  if (!real.length) return 'N';
  if (real.includes('R')) return 'R';
  if (real.includes('A')) return 'A';
  return 'G';
}
function aggBand(c) {
  const denom = 3 * (c.G + c.A + c.R);
  if (!denom) return { score: null, band: 'N' };
  const score = Math.round(((3 * c.G + c.A) / denom) * 1000) / 10;
  return { score, band: band3(score, THRESHOLDS.aggregate) };
}
function overallGroup(d, p, o) {
  const reds = [d, p, o].filter((b) => b === 'R').length;
  if (d === 'R' || reds >= 2) return 'R';
  if (d === 'G' && p === 'G' && o === 'G') return 'G';
  if (p === 'N' && o === 'N') return 'N'; // nothing measurable at student level yet — never Red
  return 'A';
}

const FIRST = ['Aarav', 'Vihaan', 'Aditya', 'Ishaan', 'Reyansh', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Myra', 'Kabir', 'Arjun', 'Riya', 'Meera', 'Advait', 'Anika', 'Krish', 'Tara', 'Neel', 'Zara', 'Rohan', 'Kiara', 'Vivaan', 'Pari', 'Dhruv', 'Ira', 'Yash', 'Navya', 'Atharv', 'Siya'];
const LAST = ['Sharma', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Patel', 'Rao', 'Menon', 'Das', 'Khan', 'Singh', 'Joshi', 'Kulkarni', 'Bose', 'Pillai', 'Verma', 'Shetty', 'Mehta'];
const TEACHERS = ['Priya Nair', 'Rahul Menon', 'Sneha Kulkarni', 'Arun Kumar', 'Deepa Iyer', 'Vikram Rao', 'Farah Khan', 'Kiran Shetty', 'Pooja Verma', 'Sanjay Das', 'Lakshmi Pillai', 'Manoj Joshi', 'Nisha Bose', 'Harish Reddy'];

/** [name, region, batches, avg batch size, delivery rate, student quality mean, never-logged share] */
const SCHOOLS = [
  ['Sri Chaitanya Techno School, Madhapur', 'Hyderabad', 8, 34, 0.95, 0.7, 0.03],
  ['Sri Chaitanya School, Kukatpally', 'Hyderabad', 7, 33, 0.78, 0.45, 0.12],
  ['Sri Chaitanya School, Dilsukhnagar', 'Hyderabad', 6, 30, 0.62, 0.35, 0.3],
  ['Sri Chaitanya Techno School, Gachibowli', 'Hyderabad', 5, 32, 0.92, 0.55, 0.06],
  ['Sri Chaitanya School, Marathahalli', 'Bangalore', 7, 31, 0.93, 0.62, 0.05],
  ['Sri Chaitanya School, Electronic City', 'Bangalore', 6, 29, 0.85, 0.5, 0.1],
  ['Sri Chaitanya School, Yelahanka', 'Bangalore', 4, 28, 0.97, 0.8, 0.02],
  ['Sri Chaitanya School, Whitefield', 'Bangalore', 3, 26, 0.9, 0.38, 0.22],
  ['Sri Chaitanya Techno School, Velachery', 'Chennai', 6, 30, 0.88, 0.58, 0.08],
  ['Sri Chaitanya School, Anna Nagar', 'Chennai', 5, 27, 0.6, 0.4, 0.2],
  ['Sri Chaitanya School, Tambaram', 'Chennai', 3, 24, 0.95, 0.78, 0.02],
  ['Sri Chaitanya School, Kharghar', 'Mumbai', 5, 30, 0.9, 0.52, 0.09],
  ['Sri Chaitanya School, Thane West', 'Mumbai', 4, 28, 0.74, 0.44, 0.15],
  ['Sri Chaitanya School, Wakad', 'Pune', 4, 27, 0.91, 0.6, 0.05],
  ['Sri Chaitanya School, Hadapsar', 'Pune', 2, 25, 0.8, 0.3, 0.35],
  ['Sri Chaitanya School, Dwarka', 'Delhi NCR', 4, 29, 0.96, 0.68, 0.03],
  ['Sri Chaitanya School, Noida Sec 62', 'Delhi NCR', 3, 26, 0.7, 0.42, 0.18],
  ['Sri Chaitanya School, Salt Lake', 'Kolkata', 2, 22, 0.95, 0.74, 0.03],
  ['Sri Chaitanya School, Vijayawada Benz Circle', 'Andhra Pradesh', 6, 33, 0.83, 0.48, 0.14],
  ['Sri Chaitanya School, Guntur', 'Andhra Pradesh', 4, 30, 0.66, 0.36, 0.25],
  ['Sri Chaitanya School, Visakhapatnam MVP', 'Andhra Pradesh', 5, 31, 0.92, 0.64, 0.05],
  ['Sri Chaitanya School, Nellore', 'Andhra Pradesh', 2, 12, 0.9, 0.5, 0.1, 'new'],
  ['Sri Chaitanya School, Tirupati', 'Andhra Pradesh', 1, 18, 1, 0.5, 0.4, 'fresh'],
];

const LAB_WORKOUTS = 3;
const CLASS_KINDS_CYCLE = ['lecture', 'lab', 'lab', 'lecture', 'lab', 'lab'];
const ASSESSMENT_AT = [7, 15, 23]; // class index (1-based) where assessments fall

function buildBatchSchedule(startDate, weekly) {
  const classes = [];
  const d = new Date(startDate);
  let idx = 0;
  while (d <= AS_OF) {
    idx += 1;
    const kind = ASSESSMENT_AT.includes(idx)
      ? 'assessment'
      : CLASS_KINDS_CYCLE[(idx - 1) % CLASS_KINDS_CYCLE.length];
    const aNo = ASSESSMENT_AT.indexOf(idx) + 1;
    classes.push({
      date: iso(d),
      session_id: `S${String(idx).padStart(3, '0')}`,
      session_name:
        kind === 'assessment' ? `Assessment ${aNo}` : kind === 'lab' ? `Lab ${idx}: ${pick(['Loops', 'Sensors', 'Smart light', 'Seven segment', 'Variables', 'Conditions', 'Motors', 'Patterns'])}` : `Concept ${idx}`,
      kind,
    });
    d.setDate(d.getDate() + (weekly === 2 ? (idx % 2 ? 3 : 4) : 7));
  }
  return classes;
}

async function main() {
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(DB);
  for (const c of ['health_runs', 'health_schools', 'health_batches', 'health_students', 'health_student_details']) {
    await db.collection(c).deleteMany({});
  }

  const schools = [];
  const batches = [];
  const students = [];
  const details = [];
  let schoolSeq = 4100;
  let batchSeq = 91000;
  let teacherIdx = 0;

  for (const [school_name, region, nBatches, avgSize, deliveryRate, qMean, neverShare, special] of SCHOOLS) {
    const school_id = String(schoolSeq++);
    const schoolTeachers = new Map();
    const schoolBatches = [];
    for (let bi = 0; bi < nBatches; bi += 1) {
      const grade = 3 + (bi % 6);
      const tName = TEACHERS[teacherIdx++ % TEACHERS.length];
      const teacher = { username: tName.toLowerCase().replace(/\s+/g, '.'), name: tName };
      schoolTeachers.set(teacher.username, teacher);
      const batch_id = String(batchSeq++);
      const start =
        special === 'fresh' ? new Date('2026-09-15') : special === 'new' ? new Date('2026-08-20') : new Date(`2026-06-${String(10 + (bi % 10)).padStart(2, '0')}`);
      const schedule = buildBatchSchedule(start, bi % 3 === 0 ? 2 : 1);
      const bDelivery = clamp(deliveryRate + gauss(0, 0.06), 0.3, 1);
      // mark held/not held; the last few scheduled are the ones most often missed
      const held = schedule.map((c, i) => {
        const isHeld = rnd() < bDelivery || i < 2;
        return { ...c, status: isHeld ? (rnd() < 0.08 ? 'PARTIAL' : 'COMPLETED') : pick(['CANCELLED', 'NOT_CONDUCTED', 'SCHEDULED']) };
      });
      const heldClasses = held.filter((c) => c.status === 'COMPLETED' || c.status === 'PARTIAL');
      const labsHeld = heldClasses.filter((c) => c.kind === 'lab');
      const assessmentsHeld = heldClasses.filter((c) => c.kind === 'assessment');
      const size = Math.max(8, Math.round(gauss(avgSize, 4)));
      const bQual = clamp(qMean + gauss(0, 0.08), 0.05, 0.95);
      const batchStudents = [];
      for (let si = 0; si < size; si += 1) {
        const username = `wk${batch_id}${String(si + 1).padStart(2, '0')}`;
        const name = `${pick(FIRST)} ${pick(LAST)}`;
        const never = rnd() < neverShare;
        const q = never ? 0 : clamp(gauss(bQual, 0.2), 0, 1);
        const attendP = never ? clamp(gauss(0.55, 0.15), 0.1, 0.9) : clamp(0.6 + q * 0.4 + gauss(0, 0.08), 0.2, 1);
        const lazy = !never && rnd() < 0.06; // logs in, attends, but never submits workouts
        const classes = [];
        let present = 0;
        let done = 0;
        let due = 0;
        const assessments = [];
        for (const c of held) {
          const isHeld = c.status === 'COMPLETED' || c.status === 'PARTIAL';
          const p = isHeld && rnd() < attendP;
          if (p) present += 1;
          let wd = null;
          let wt = null;
          if (c.kind === 'lab' && isHeld) {
            wt = LAB_WORKOUTS;
            due += LAB_WORKOUTS;
            wd =
              never || lazy
                ? 0
                : p
                  ? Math.round(clamp(q + 0.25 + gauss(0, 0.15), 0, 1) * LAB_WORKOUTS)
                  : rnd() < q * 0.6
                    ? Math.round(clamp(q + gauss(0, 0.2), 0, 1) * LAB_WORKOUTS)
                    : 0;
            done += wd;
          }
          if (c.kind === 'assessment' && isHeld && p && !never) {
            const max = 20;
            const score = Math.round(clamp(q * 0.9 + 0.1 + gauss(0, 0.12), 0.05, 1) * max);
            assessments.push({ session_id: c.session_id, name: c.session_name, date: c.date, score, max, pct: pct(score, max) });
          }
          classes.push({ date: c.date, session_id: c.session_id, session_name: c.session_name, kind: c.kind, status: c.status, present: isHeld ? p : null, workouts_done: wd, workouts_total: wt });
        }
        const heldN = heldClasses.length;
        const attPct = pct(present, heldN);
        const attendance = { present, held: heldN, pct: attPct, band: heldN < THRESHOLDS.attendance.min_held ? 'N' : band3(attPct, THRESHOLDS.attendance) };
        const labN = labsHeld.length;
        const notStarted = labN >= THRESHOLDS.participation.min_lab_sessions && done === 0;
        const partPct = pct(done, due);
        const participation = {
          done,
          due,
          pct: labN < THRESHOLDS.participation.min_lab_sessions ? null : partPct,
          band: labN < THRESHOLDS.participation.min_lab_sessions ? 'N' : notStarted ? 'R' : band3(partPct, THRESHOLDS.participation),
          not_started: notStarted,
          lab_sessions_held: labN,
        };
        const codeTotal = never || labsHeld.length < 2 ? 0 : Math.round(clamp(gauss(done * 2.2, 4), 0, 200));
        const codeOk = Math.round(codeTotal * clamp(q * 0.8 + 0.15 + gauss(0, 0.1), 0, 1));
        const avgA = assessments.length ? Math.round((assessments.reduce((s, a) => s + a.pct, 0) / assessments.length) * 10) / 10 : null;
        const codePct = codeTotal ? pct(codeOk, codeTotal) : null;
        const oScore = avgA != null && codePct != null ? Math.round((avgA * 0.5 + codePct * 0.5) * 10) / 10 : avgA != null ? avgA : codePct;
        const outcomes = {
          assessments,
          avg_assessment_pct: avgA,
          assessments_taken: assessments.length,
          code_runs_ok: codeOk,
          code_runs_total: codeTotal,
          code_run_pct: codePct,
          score: oScore,
          band: oScore == null ? 'N' : band3(oScore, THRESHOLDS.outcomes),
        };
        const lastLogin = never ? null : new Date(AS_OF.getTime() - Math.floor(rnd() * (q > 0.3 ? 10 : 45)) * 86400000);
        const activity = [];
        if (!never) {
          for (let dd = 0; dd < 90; dd += 1) {
            if (rnd() < q * 0.45) {
              activity.push({ date: iso(new Date(AS_OF.getTime() - dd * 86400000)), events: 1 + Math.floor(rnd() * (3 + q * 12)) });
            }
          }
        }
        const active30 = activity.filter((a) => new Date(a.date) >= new Date(AS_OF.getTime() - 30 * 86400000)).length;
        const reasons = [];
        if (!lastLogin) reasons.push('Has never logged in this year');
        if (participation.not_started) reasons.push(`Not started lab workouts — 0 of ${due} done in ${labN} lab sessions`);
        else if (participation.band === 'R') reasons.push(`Lab workouts ${partPct}% — ${done} of ${due} done`);
        else if (participation.band === 'A') reasons.push(`Lab workouts ${partPct}% (${done} of ${due})`);
        if (outcomes.band === 'R') reasons.push(`Outcome score ${oScore}% (assessments ${avgA != null ? avgA + '%' : 'none taken'}, code runs ${codePct != null ? codePct + '%' : 'none'})`);
        const missed = assessmentsHeld.length - assessments.length;
        if (missed > 0) reasons.push(`Missed ${missed} of ${assessmentsHeld.length} assessments`);
        if (attendance.band === 'R') reasons.push(`Attendance ${attPct}% — ${present} of ${heldN} classes`);
        if (!reasons.length && participation.band === 'N' && outcomes.band === 'N') reasons.push('Not enough classes yet to measure');
        if (!reasons.length) reasons.push('On track on workouts and outcomes');
        const st = {
          run_id: RUN_ID,
          batch_id,
          school_id,
          username,
          name,
          grade: `G${grade}`,
          overall_band: worst(participation.band, outcomes.band),
          reasons,
          attendance,
          participation,
          outcomes,
          login: { ever_logged_in: Boolean(lastLogin), last_login_at: lastLogin },
          active_days_30: active30,
          last_active_at: activity.length ? new Date(activity[0].date) : null,
        };
        batchStudents.push(st);
        const prodigy =
          rnd() < 0.35
            ? Object.fromEntries(['A', 'C', 'I', 'L', 'M', 'S'].map((k) => [k, Math.round(clamp(q * 90 + gauss(0, 12), 5, 100))]))
            : null;
        details.push({ run_id: RUN_ID, batch_id, username, classes, activity, prodigy });
      }

      const scheduledN = schedule.length;
      const heldN = heldClasses.length;
      const dPct = pct(heldN, scheduledN);
      const delivery = { scheduled: scheduledN, held: heldN, pct: dPct, band: scheduledN ? band3(dPct, THRESHOLDS.delivery) : 'N' };
      const counts = (key) => {
        const c = { G: 0, A: 0, R: 0, N: 0 };
        batchStudents.forEach((s) => (c[s[key].band] += 1));
        return c;
      };
      const pc = counts('participation');
      const oc = counts('outcomes');
      const pAgg = aggBand(pc);
      const oAgg = aggBand(oc);
      const notStarted = batchStudents.filter((s) => s.participation.not_started).length;
      const sumDone = batchStudents.reduce((s, x) => s + x.participation.done, 0);
      const sumDue = batchStudents.reduce((s, x) => s + x.participation.due, 0);
      const avgOf = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
      const participation = { ...pc, not_started: notStarted, completion_pct: pct(sumDone, sumDue), score: pAgg.score, band: pAgg.band };
      const outcomes = {
        ...oc,
        avg_assessment_pct: avgOf(batchStudents.map((s) => s.outcomes.avg_assessment_pct).filter((v) => v != null)),
        code_run_pct: avgOf(batchStudents.map((s) => s.outcomes.code_run_pct).filter((v) => v != null)),
        score: oAgg.score,
        band: oAgg.band,
      };
      const attPresent = batchStudents.reduce((s, x) => s + x.attendance.present, 0);
      const attHeld = batchStudents.reduce((s, x) => s + x.attendance.held, 0);
      const attPct = pct(attPresent, attHeld);
      const attendance = { pct: heldN < 3 ? null : attPct, band: heldN < 3 ? 'N' : band3(attPct, THRESHOLDS.attendance) };
      const reasons = [];
      if (delivery.band !== 'G' && delivery.band !== 'N') reasons.push(`Delivery ${dPct}% — ${heldN} of ${scheduledN} classes held`);
      if (pc.R) reasons.push(`${pc.R} of ${size} students are Red on lab workouts${notStarted ? ` (${notStarted} not started)` : ''}`);
      if (oc.R) reasons.push(`${oc.R} of ${size} students are Red on outcomes`);
      const missedA = batchStudents.filter((s) => s.outcomes.assessments_taken < assessmentsHeld.length).length;
      if (assessmentsHeld.length && missedA) reasons.push(`${missedA} students missed at least one assessment`);
      if (!reasons.length) reasons.push(delivery.band === 'N' ? 'Batch has not started classes yet' : 'On track on delivery, workouts and outcomes');
      const b = {
        run_id: RUN_ID,
        batch_id,
        batch_name: `G${grade} ${pick(['Alpha', 'Beta', 'Gamma', 'Delta', 'Orion', 'Nova', 'Titan', 'Vega'])} ${String.fromCharCode(65 + bi)}`,
        grade: `G${grade}`,
        school_id,
        school_name,
        teacher,
        start_date: iso(start),
        batch_state: 'LIVE',
        students: size,
        delivery,
        participation,
        outcomes,
        attendance,
        overall_band: overallGroup(delivery.band, participation.band, outcomes.band),
        reasons,
        _att: { present: attPresent, held: attHeld },
      };
      schoolBatches.push(b);
      students.push(...batchStudents);
    }

    // school roll-up
    const sum = (f) => schoolBatches.reduce((s, b) => s + f(b), 0);
    const nStudents = sum((b) => b.students);
    const scheduled = sum((b) => b.delivery.scheduled);
    const heldN = sum((b) => b.delivery.held);
    const dPct = pct(heldN, scheduled);
    const delivery = { scheduled, held: heldN, pct: dPct, band: scheduled ? band3(dPct, THRESHOLDS.delivery) : 'N' };
    const pc = { G: sum((b) => b.participation.G), A: sum((b) => b.participation.A), R: sum((b) => b.participation.R), N: sum((b) => b.participation.N) };
    const oc = { G: sum((b) => b.outcomes.G), A: sum((b) => b.outcomes.A), R: sum((b) => b.outcomes.R), N: sum((b) => b.outcomes.N) };
    const pAgg = aggBand(pc);
    const oAgg = aggBand(oc);
    const notStarted = sum((b) => b.participation.not_started);
    const schoolStudents = students.filter((s) => s.school_id === school_id);
    const loggedIn = schoolStudents.filter((s) => s.login.ever_logged_in).length;
    const sDone = schoolStudents.reduce((s, x) => s + x.participation.done, 0);
    const sDue = schoolStudents.reduce((s, x) => s + x.participation.due, 0);
    const avgOf = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
    const attP = sum((b) => b._att.present);
    const attH = sum((b) => b._att.held);
    const attPct = pct(attP, attH);
    const participation = { ...pc, not_started: notStarted, completion_pct: pct(sDone, sDue), score: pAgg.score, band: pAgg.band };
    const outcomes = {
      ...oc,
      avg_assessment_pct: avgOf(schoolStudents.map((s) => s.outcomes.avg_assessment_pct).filter((v) => v != null)),
      code_run_pct: avgOf(schoolStudents.map((s) => s.outcomes.code_run_pct).filter((v) => v != null)),
      score: oAgg.score,
      band: oAgg.band,
    };
    const reasons = [];
    if (delivery.band === 'R' || delivery.band === 'A') reasons.push(`Delivery ${dPct}% — ${heldN} of ${scheduled} classes held`);
    if (pc.R) reasons.push(`${pc.R} of ${nStudents} students are Red on lab workouts${notStarted ? ` (${notStarted} not started)` : ''}`);
    if (oc.R) reasons.push(`${oc.R} of ${nStudents} students are Red on outcomes`);
    if (nStudents - loggedIn > 0) reasons.push(`${nStudents - loggedIn} students have never logged in`);
    const missedA1 = schoolStudents.filter((s) => s.outcomes.assessments_taken === 0 && s.participation.lab_sessions_held >= 4).length;
    if (missedA1) reasons.push(`${missedA1} students missed Assessment 1`);
    const overall = overallGroup(delivery.band, participation.band, outcomes.band);
    if (overall === 'N') reasons.unshift('Classes have only just started — not enough data to measure yet');
    schools.push({
      run_id: RUN_ID,
      school_id,
      school_name,
      region,
      batches: schoolBatches.length,
      students: nStudents,
      teachers: [...schoolTeachers.values()],
      onboarding: { enrolled: nStudents, logged_in: loggedIn, not_logged_in: nStudents - loggedIn },
      delivery,
      participation,
      outcomes,
      attendance: { pct: attPct, band: attH ? band3(attPct, THRESHOLDS.attendance) : 'N' },
      overall_band: overall,
      reasons,
      principal_feedback: rnd() < 0.4 ? { responses: 1 + Math.floor(rnd() * 4), not_satisfied: Math.floor(rnd() * 2) } : null,
    });
    batches.push(...schoolBatches.map(({ _att, ...b }) => b));
  }

  await db.collection('health_runs').insertOne({
    _id: RUN_ID,
    generated_at: new Date(),
    data_as_of: DATA_AS_OF,
    source: 'fixture',
    window: { from: '2026-04-01', to: DATA_AS_OF },
    thresholds: THRESHOLDS,
    is_latest: true,
    counts: { schools: schools.length, batches: batches.length, students: students.length },
  });
  await db.collection('health_schools').insertMany(schools);
  await db.collection('health_batches').insertMany(batches);
  await db.collection('health_students').insertMany(students);
  await db.collection('health_student_details').insertMany(details);
  await db.collection('health_schools').createIndex({ run_id: 1, school_id: 1 });
  await db.collection('health_batches').createIndex({ run_id: 1, batch_id: 1 });
  await db.collection('health_batches').createIndex({ run_id: 1, school_id: 1 });
  await db.collection('health_students').createIndex({ run_id: 1, batch_id: 1 });
  await db.collection('health_students').createIndex({ run_id: 1, username: 1 });
  await db.collection('health_students').createIndex({ run_id: 1, school_id: 1 });
  await db.collection('health_student_details').createIndex({ run_id: 1, batch_id: 1, username: 1 });
  const bandCount = schools.reduce((m, s) => ((m[s.overall_band] = (m[s.overall_band] || 0) + 1), m), {});
  console.log(`Fixture written to ${DB}: ${schools.length} schools ${JSON.stringify(bandCount)}, ${batches.length} batches, ${students.length} students.`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
