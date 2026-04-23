'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const { signStudentLink } = require('../lib/studentLink');
const { app } = require('../server');

const makeToken = (overrides = {}) => jwt.sign(
  { username: 'admin', role: 'admin', ...overrides },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const expFuture = () => Date.now() + 7 * 24 * 60 * 60 * 1000;

function linkPath(studentId, expMs) {
  const sig = signStudentLink(studentId, expMs, process.env.STUDENT_FORM_SECRET);
  return `/api/submissions/by-link/${encodeURIComponent(studentId)}/${expMs}/${sig}`;
}

const VALID_BODY = {
  name: 'Aarav Sharma',
  grade: '5',
  schoolName: 'Delhi Public School',
  projectTitle: 'Smart Water Monitor',
  idea: 'IoT device',
  problemStatement: 'Water scarcity',
  solution: 'Monitoring',
  techUsed: 'Arduino',
  impact: 'Saves water',
  videoUrl: 'https://example.com/video.mp4',
  documentUrl: '',
  finalized: true,
};

describe('GET/PUT /api/submissions/by-link/...', () => {

  test('✅ PUT creates submission with valid signed link', async () => {
    const exp = expFuture();
    const path = linkPath('STU_BYLINK_1', exp);
    const res = await request(app).put(path).send(VALID_BODY);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.studentId).toBe('STU_BYLINK_1');
    expect(res.body.data.name).toBe('Aarav Sharma');
    expect(res.body.meta.canEdit).toBe(true);
  });

  test('✅ GET returns saved data for same link', async () => {
    const exp = expFuture();
    const sid = 'STU_BYLINK_2';
    const path = linkPath(sid, exp);
    await request(app).put(path).send({ ...VALID_BODY, projectTitle: 'P2' });
    const res = await request(app).get(path);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.projectTitle).toBe('P2');
    expect(res.body.meta.studentId).toBe(sid);
  });

  test('✅ GET keeps saved project fields even when roster profile is locked', async () => {
    const sid = 'STU_LOCKED_PREFILL_1';
    const token = makeToken();
    const createRoster = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        validDays: 5,
        students: [{
          username: sid,
          name: 'Locked Name',
          schoolName: 'Locked School',
          grade: '6',
        }],
      });
    expect(createRoster.statusCode).toBe(200);

    const exp = expFuture();
    const path = linkPath(sid, exp);
    const put = await request(app).put(path).send({ ...VALID_BODY, projectTitle: 'Locked Project Title' });
    expect(put.statusCode).toBe(200);

    const res = await request(app).get(path);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.projectTitle).toBe('Locked Project Title');
    expect(res.body.data.idea).toBe(VALID_BODY.idea);
    expect(res.body.data.solution).toBe(VALID_BODY.solution);
    expect(res.body.data.name).toBe('Locked Name');
    expect(res.body.data.schoolName).toBe('Locked School');
    expect(res.body.data.grade).toBe('6');
  });

  test('❌ 403 when signature is wrong', async () => {
    const exp = expFuture();
    const sid = 'STU_BADSIG';
    const sig = signStudentLink(sid, exp, process.env.STUDENT_FORM_SECRET);
    const badSig = sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a');
    const path = `/api/submissions/by-link/${encodeURIComponent(sid)}/${exp}/${badSig}`;
    const res = await request(app).put(path).send(VALID_BODY);
    expect(res.statusCode).toBe(403);
  });

  test('❌ 403 when link is expired', async () => {
    const exp = Date.now() - 60_000;
    const path = linkPath('STU_EXPIRED', exp);
    const res = await request(app).get(path);
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('❌ 400 when finalized without required fields', async () => {
    const exp = expFuture();
    const path = linkPath('STU_INCOMPLETE', exp);
    const res = await request(app).put(path).send({ name: 'X', finalized: true });
    expect(res.statusCode).toBe(400);
  });

});

describe('GET /api/submissions (admin)', () => {

  test('❌ returns 401 with NO token', async () => {
    const res = await request(app).get('/api/submissions');
    expect(res.statusCode).toBe(401);
  });

  test('✅ returns 200 with valid token', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/api/submissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

});

describe('POST /api/admin/student-links', () => {

  test('❌ 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/student-links')
      .send({ studentId: 'X', validDays: 3 });
    expect(res.statusCode).toBe(401);
  });

  test('❌ rejects username-only payload; full student details are required', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentIds: ['STU_ADMIN_1', 'STU_ADMIN_2'], validDays: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || '')).toMatch(/full details|required/i);
  });

  test('✅ students body upserts roster, persists link, visible on roster', async () => {
    const token = makeToken();
    const username = 'STU_FORM_CREATE_1';
    const res = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        validDays: 5,
        publicBaseUrl: 'http://localhost:5173',
        students: [{
          username,
          name: 'Form Create Student',
          schoolName: 'Roster High School',
          grade: '6',
          admissionNumber: 'ADM-777',
        }],
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].studentId).toBe(username);
    expect(res.body.data[0].persisted).toBe(true);
    expect(res.body.data[0].url).toMatch(/\/submit\//);

    const roster = await request(app)
      .get('/api/admin/roster')
      .set('Authorization', `Bearer ${token}`)
      .query({ publicBaseUrl: 'http://localhost:5173' });
    expect(roster.statusCode).toBe(200);
    const row = roster.body.data.find((r) => r.studentId === username);
    expect(row).toBeDefined();
    expect(row.name).toBe('Form Create Student');
    expect(row.schoolName).toBe('Roster High School');
    expect(row.grade).toBe('6');
    expect(row.admissionNumber).toBe('ADM-777');
    expect(row.shareUrl).toBeTruthy();
  });

  test('❌ 400 when students row missing required field', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        validDays: 3,
        students: [{ username: 'X', name: '', schoolName: 'S', grade: '5' }],
      });
    expect(res.statusCode).toBe(400);
  });

  test('✅ uses publicBaseUrl from body when valid', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        students: [{
          username: 'STU_BASE',
          name: 'Base Url Student',
          schoolName: 'School Base',
          grade: '6',
        }],
        validDays: 3,
        publicBaseUrl: 'https://technathon.example.com',
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].url).toMatch(/^https:\/\/technathon\.example\.com\/submit\//);
  });

  test('✅ de-duplicates repeated usernames in a single batch and reports generatedCount', async () => {
    const token = makeToken();
    const sid = 'STU_DUP_BATCH_1';
    const res = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        validDays: 4,
        students: [
          {
            username: sid,
            name: 'Original Name',
            schoolName: 'Original School',
            grade: '6',
          },
          {
            username: sid,
            name: 'Duplicate Name',
            schoolName: 'Duplicate School',
            grade: '6',
          },
        ],
      });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.requestedRows).toBe(2);
    expect(res.body.summary.uniqueRowsProcessed).toBe(1);
    expect(res.body.summary.duplicateRowsSkipped).toBe(1);
    expect(res.body.summary.generatedCount).toBe(1);
  });

  test('❌ 400 when validDays out of range', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: 'X', validDays: 400 });
    expect(res.statusCode).toBe(400);
  });

  test('❌ 409 when link already generated; roster profile remains unchanged', async () => {
    const sid = 'STU_REUSE_TEST';
    const studentPayload = {
      username: sid,
      name: 'Reuse Test',
      schoolName: 'Test School',
      grade: '5',
    };
    const token = makeToken();
    const first = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ students: [studentPayload], validDays: 5 });
    expect(first.statusCode).toBe(200);

    const second = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        students: [{
          ...studentPayload,
          name: 'Tampered Name',
          schoolName: 'Tampered School',
        }],
        validDays: 1,
      });
    expect(second.statusCode).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.blockedStudentIds).toEqual([sid]);
    expect(String(second.body.message || '')).toMatch(/already generated/i);

    const roster = await request(app)
      .get('/api/admin/roster')
      .set('Authorization', `Bearer ${token}`)
      .query({ publicBaseUrl: 'http://localhost:5173' });
    expect(roster.statusCode).toBe(200);
    const row = roster.body.data.find((r) => r.studentId === sid);
    expect(row).toBeDefined();
    expect(row.name).toBe('Reuse Test');
    expect(row.schoolName).toBe('Test School');
  });

  test('❌ 409 when generating link after student finalized submission', async () => {
    const sid = 'STU_BLOCK_REGEN';
    const studentPayload = {
      username: sid,
      name: 'Block Regen',
      schoolName: 'Test School',
      grade: '4',
    };
    const token = makeToken();
    const first = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ students: [studentPayload], validDays: 5, publicBaseUrl: 'http://localhost:5173' });
    expect(first.statusCode).toBe(200);
    const spaPath = first.body.data[0].submitPath;
    const m = String(spaPath || '').match(/\/(\d+)\/([0-9a-f]+)$/i);
    expect(m).toBeTruthy();
    const expMs = Number(m[1]);
    const sig = m[2];
    const apiPath = `/api/submissions/by-link/${encodeURIComponent(sid)}/${expMs}/${sig}`;
    const put = await request(app).put(apiPath).send(VALID_BODY);
    expect(put.statusCode).toBe(200);

    const again = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ students: [studentPayload], validDays: 3, publicBaseUrl: 'http://localhost:5173' });
    expect(again.statusCode).toBe(409);
    expect(again.body.success).toBe(false);
    expect(again.body.blockedStudentIds).toEqual([sid]);
    expect(String(again.body.message || '')).toMatch(/already generated|already submitted/i);
  });

});

describe('GET /api/admin/roster', () => {

  test('❌ 401 without token', async () => {
    const res = await request(app).get('/api/admin/roster');
    expect(res.statusCode).toBe(401);
  });

  test('✅ returns rows + analytics with token', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/api/admin/roster')
      .set('Authorization', `Bearer ${token}`)
      .query({ publicBaseUrl: 'http://localhost:5173' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.analytics).toBeDefined();
    expect(typeof res.body.analytics.linksGenerated).toBe('number');
    expect(typeof res.body.analytics.formsFilled).toBe('number');
  });

});

describe('GET /api/submissions/export', () => {

  test('❌ returns 401 with no token', async () => {
    const res = await request(app).get('/api/submissions/export');
    expect(res.statusCode).toBe(401);
  });

  test('✅ returns Excel file with valid token', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/api/submissions/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  test('✅ export includes submission link and link expiry columns', async () => {
    const token = makeToken();
    const sid = 'STU_EXPORT_LINK_1';
    const linkRes = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        validDays: 5,
        publicBaseUrl: 'http://localhost:5173',
        students: [{
          username: sid,
          name: 'Export Link Student',
          schoolName: 'Export School',
          grade: '7',
          admissionNumber: 'EXP-1',
        }],
      });
    expect(linkRes.statusCode).toBe(200);
    const generatedLink = linkRes.body.data?.[0]?.url;
    expect(typeof generatedLink).toBe('string');

    const path = linkPath(sid, expFuture());
    const put = await request(app).put(path).send({
      ...VALID_BODY,
      projectTitle: 'Export Link Project',
      name: 'Should be replaced by roster lock',
    });
    expect(put.statusCode).toBe(200);

    const res = await request(app)
      .get('/api/submissions/export')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res2, cb) => {
        const chunks = [];
        res2.on('data', (chunk) => chunks.push(chunk));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.statusCode).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    const header = ws.getRow(1).values;
    const submissionLinkCol = header.indexOf('Submission Link');
    const linkExpiryCol = header.indexOf('Link Expiry');
    const studentIdCol = header.indexOf('Student ID');
    expect(submissionLinkCol).toBeGreaterThan(0);
    expect(linkExpiryCol).toBeGreaterThan(0);
    expect(studentIdCol).toBeGreaterThan(0);

    let matched = null;
    for (let r = 2; r <= ws.actualRowCount; r += 1) {
      const row = ws.getRow(r);
      const id = String(row.getCell(studentIdCol).value || '');
      if (id === sid) {
        matched = row;
        break;
      }
    }
    expect(matched).toBeTruthy();
    const exportedLink = String(matched.getCell(submissionLinkCol).value || '');
    const exportedExpiry = String(matched.getCell(linkExpiryCol).value || '');
    expect(exportedLink).toBe(generatedLink);
    expect(exportedExpiry.length).toBeGreaterThan(0);
  });

  test('✅ export includes link-generated roster rows even without submission', async () => {
    const token = makeToken();
    const sid = 'STU_EXPORT_ROSTER_ONLY_1';
    const linkRes = await request(app)
      .post('/api/admin/student-links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        validDays: 5,
        publicBaseUrl: 'http://localhost:5173',
        students: [{
          username: sid,
          name: 'Roster Only Student',
          schoolName: 'Roster Export School',
          grade: '8',
          admissionNumber: 'RO-1',
        }],
      });
    expect(linkRes.statusCode).toBe(200);
    const generatedLink = String(linkRes.body.data?.[0]?.url || '');
    expect(generatedLink).toMatch(/\/submit\//);

    const res = await request(app)
      .get('/api/submissions/export')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res2, cb) => {
        const chunks = [];
        res2.on('data', (chunk) => chunks.push(chunk));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.statusCode).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    const header = ws.getRow(1).values;
    const studentIdCol = header.indexOf('Student ID');
    const submissionLinkCol = header.indexOf('Submission Link');
    const projectTitleCol = header.indexOf('Project Title');
    expect(studentIdCol).toBeGreaterThan(0);
    expect(submissionLinkCol).toBeGreaterThan(0);
    expect(projectTitleCol).toBeGreaterThan(0);

    let matched = null;
    for (let r = 2; r <= ws.actualRowCount; r += 1) {
      const row = ws.getRow(r);
      const id = String(row.getCell(studentIdCol).value || '');
      if (id === sid) {
        matched = row;
        break;
      }
    }
    expect(matched).toBeTruthy();
    expect(String(matched.getCell(submissionLinkCol).value || '')).toBe(generatedLink);
    expect(String(matched.getCell(projectTitleCol).value || '')).toBe('');
  });

});
