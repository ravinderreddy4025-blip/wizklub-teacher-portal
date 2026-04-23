'use strict';

/**
 * Roster + signed link helpers for admin. Doc: ../../../docs/file-notes/server/services/adminRosterService.js.md
 */
const { buildStudentSubmitUrl, buildStudentSubmitPath } = require('../lib/studentLink');

/**
 * @type {{
 *   useMongo: boolean,
 *   Submission: import('mongoose').Model | null,
 *   RosterStudent: import('mongoose').Model | null,
 *   mockSubmissions: object[],
 *   mockRoster: object[],
 * }}
 */
let cfg = {
  useMongo: false,
  Submission: null,
  RosterStudent: null,
  mockSubmissions: [],
  mockRoster: [],
};

function configure(next) {
  cfg = { ...cfg, ...next };
}

function shortLinkLabel(studentId, submitPath) {
  const sid = String(studentId);
  const enc = encodeURIComponent(sid);
  return `/submit/${sid.length > 12 ? `${enc.slice(0, 10)}…` : enc}/…`;
}

/**
 * Mint a signed URL. If a roster row exists for this studentId (Username), persist shareUrl + linkExpMs.
 * When a non-expired link is already stored on that roster row, return it (reused: true).
 */
async function getOrCreateLink(studentId, validDays, baseUrl, secret) {
  const id = String(studentId).trim();
  const dayMs = validDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let row = null;
  if (cfg.useMongo && cfg.RosterStudent) {
    row = await cfg.RosterStudent.findOne({ studentId: id }).lean();
  } else {
    row = cfg.mockRoster.find((x) => x.studentId === id) || null;
  }

  if (row && row.shareUrl && row.linkExpMs != null && Number(row.linkExpMs) > now) {
    const expMs = Number(row.linkExpMs);
    const submitPath = buildStudentSubmitPath(id, expMs, secret);
    const msLeft = expMs - now;
    const approxDays = Math.max(1, Math.ceil(msLeft / dayMs));
    return {
      studentId: id,
      url: row.shareUrl,
      submitPath,
      shortLabel: shortLinkLabel(id, submitPath),
      expiresAt: new Date(expMs).toISOString(),
      validDays: approxDays,
      reused: true,
      persisted: true,
    };
  }

  const expMs = now + dayMs;
  const base = String(baseUrl).replace(/\/+$/, '');
  const url = buildStudentSubmitUrl(base, id, expMs, secret);
  const submitPath = buildStudentSubmitPath(id, expMs, secret);

  let persisted = false;
  if (cfg.useMongo && cfg.RosterStudent) {
    const res = await cfg.RosterStudent.updateOne(
      { studentId: id },
      {
        $set: {
          shareUrl: url,
          linkExpMs: expMs,
          linkGeneratedAt: new Date(),
        },
      },
    );
    persisted = res.matchedCount > 0;
  } else {
    const m = cfg.mockRoster.find((x) => x.studentId === id);
    if (m) {
      m.shareUrl = url;
      m.linkExpMs = expMs;
      m.linkGeneratedAt = new Date();
      persisted = true;
    }
  }

  return {
    studentId: id,
    url,
    submitPath,
    shortLabel: shortLinkLabel(id, submitPath),
    expiresAt: new Date(expMs).toISOString(),
    validDays,
    reused: false,
    persisted,
  };
}

/**
 * Student IDs that already have a generated link persisted on roster.
 * Used to freeze roster identity fields once link generation is done.
 * @param {string[]} studentIds
 * @returns {Promise<string[]>}
 */
async function findLinkGeneratedStudentIds(studentIds) {
  const ids = [...new Set(studentIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  if (cfg.useMongo && cfg.RosterStudent) {
    const docs = await cfg.RosterStudent.find({
      studentId: { $in: ids },
      shareUrl: { $exists: true, $ne: '' },
    })
      .select({ studentId: 1 })
      .lean();
    return docs.map((d) => d.studentId).filter(Boolean);
  }

  const blocked = [];
  for (const id of ids) {
    const r = (cfg.mockRoster || []).find((m) => m.studentId === id);
    if (r?.shareUrl) blocked.push(id);
  }
  return blocked;
}

/**
 * Student IDs that already have a finalized submission (firstSubmittedAt set).
 * Used to block minting / refreshing signed form links for those accounts.
 * @param {string[]} studentIds
 * @returns {Promise<string[]>}
 */
async function findSubmittedStudentIds(studentIds) {
  const ids = [...new Set(studentIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  if (cfg.useMongo && cfg.Submission) {
    const docs = await cfg.Submission.find({
      studentId: { $in: ids },
      // $ne:null would also match docs where the field is absent; require a real Date.
      firstSubmittedAt: { $type: 'date' },
    })
      .select({ studentId: 1 })
      .lean();
    return docs.map((d) => d.studentId).filter(Boolean);
  }

  const blocked = [];
  for (const id of ids) {
    const s = (cfg.mockSubmissions || []).find((m) => m.studentId === id);
    if (s?.firstSubmittedAt) blocked.push(id);
  }
  return blocked;
}

async function importRosterRows(rows) {
  const errors = [];
  let upserted = 0;
  for (const row of rows) {
    const id = String(row.studentId || row.username || '').trim();
    if (!id) continue;
    try {
      const doc = {
        studentId: id,
        username: String(row.username || id).trim(),
        name: String(row.name || '').trim(),
        schoolName: String(row.schoolName || '').trim(),
        grade: String(row.grade || '').trim(),
        admissionNumber:
          row.admissionNumber != null && String(row.admissionNumber).trim()
            ? String(row.admissionNumber).trim()
            : '',
      };

      if (cfg.useMongo && cfg.RosterStudent) {
        await cfg.RosterStudent.updateOne(
          { studentId: id },
          { $set: doc },
          { upsert: true },
        );
      } else {
        const i = cfg.mockRoster.findIndex((x) => x.studentId === id);
        if (i >= 0) cfg.mockRoster[i] = { ...cfg.mockRoster[i], ...doc, updatedAt: new Date() };
        else cfg.mockRoster.push({ ...doc, createdAt: new Date(), updatedAt: new Date() });
      }
      upserted += 1;
    } catch (e) {
      errors.push(`${id}: ${e.message || String(e)}`);
    }
  }
  return { upserted, errors };
}

/**
 * Roster rows from Excel + merged submission + stored share link when valid.
 */
async function buildRoster(_baseUrl, _secret, _opts = {}) {
  let roster = [];
  if (cfg.useMongo && cfg.RosterStudent) {
    roster = await cfg.RosterStudent.find().sort({ studentId: 1 }).lean();
  } else {
    roster = [...cfg.mockRoster].sort((a, b) => String(a.studentId).localeCompare(String(b.studentId)));
  }

  let submissions = [];
  if (cfg.useMongo && cfg.Submission) {
    submissions = await cfg.Submission.find().lean();
  } else {
    submissions = [...cfg.mockSubmissions];
  }
  const subById = new Map(submissions.map((s) => [s.studentId, s]));

  const now = Date.now();
  const rows = roster.map((r) => {
    const sub = subById.get(r.studentId) || null;
    const expMs = r.linkExpMs;
    const hasValid = Boolean(r.shareUrl && expMs && now <= expMs);
    const shareUrl = hasValid ? r.shareUrl : null;
    const submitPath = hasValid ? shareUrl.replace(/^https?:\/\/[^/]+/i, '') : null;

    return {
      studentId: r.studentId,
      username: r.username || r.studentId,
      admissionNumber: r.admissionNumber || '',
      name: r.name || sub?.name || '',
      grade: r.grade != null && r.grade !== '' ? r.grade : sub?.grade,
      schoolName: r.schoolName || sub?.schoolName || '',
      projectTitle: sub?.projectTitle || '',
      videoUrl: sub?.videoUrl,
      documentUrl: sub?.documentUrl,
      firstSubmittedAt: sub?.firstSubmittedAt,
      updatedAt: sub?.updatedAt,
      createdAt: sub?.createdAt,
      _id: sub?._id,
      hasLink: hasValid,
      linkExpiresAt: expMs ? new Date(expMs).toISOString() : null,
      linkActive: hasValid,
      submitPath,
      shareUrl,
      shortLabel: submitPath ? shortLinkLabel(r.studentId, submitPath) : null,
      formFilled: !!(sub && sub.firstSubmittedAt),
    };
  });

  const rosterIds = new Set(roster.map((x) => x.studentId));
  for (const sub of submissions) {
    if (rosterIds.has(sub.studentId)) continue;
    rows.push({
      studentId: sub.studentId,
      username: sub.username || sub.studentId,
      admissionNumber: sub.admissionNumber || '',
      name: sub.name || '',
      grade: sub.grade,
      schoolName: sub.schoolName || '',
      projectTitle: sub.projectTitle || '',
      videoUrl: sub.videoUrl,
      documentUrl: sub.documentUrl,
      firstSubmittedAt: sub.firstSubmittedAt,
      updatedAt: sub.updatedAt,
      createdAt: sub.createdAt,
      _id: sub._id,
      hasLink: false,
      linkExpiresAt: null,
      linkActive: false,
      submitPath: null,
      shareUrl: null,
      shortLabel: null,
      formFilled: !!sub.firstSubmittedAt,
    });
  }

  rows.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId)));

  const linksGenerated = rows.filter((x) => x.shareUrl).length;
  const formsFilled = rows.filter((r) => r.formFilled).length;

  return {
    rows,
    analytics: {
      linksGenerated,
      formsFilled,
      rosterRows: rows.length,
    },
  };
}

module.exports = {
  configure,
  getOrCreateLink,
  buildRoster,
  importRosterRows,
  findLinkGeneratedStudentIds,
  findSubmittedStudentIds,
};
