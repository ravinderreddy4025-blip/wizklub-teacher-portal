const {
  sessionsCollection,
  toSessionDocument,
  sessionDocToClient,
  readAllSessionsFromDb,
  writePmoSessionsReplaceAll,
  writeSpeakerMergedSessions,
  attachLsqWebhookFields,
  kickLsqWebhookSync,
} = require('../services/mongo');
const { addStudentId } = require('../domain/studentIds');
const { lsqPendingUpdate } = require('../domain/lsqSync');

async function readAllSessions() {
  return readAllSessionsFromDb();
}

async function findSessionById(id) {
  const doc = await sessionsCollection().findOne({ _id: id });
  if (!doc) return null;
  return sessionDocToClient(doc);
}

async function insertSession(item) {
  const doc = attachLsqWebhookFields(toSessionDocument(item), null);
  const result = await sessionsCollection().insertOne(doc);
  kickLsqWebhookSync();
  return result;
}

async function upsertSessionById(id, item) {
  const existing = await sessionsCollection().findOne({ _id: id });
  const doc = attachLsqWebhookFields(toSessionDocument(item), existing);
  const result = await sessionsCollection().replaceOne({ _id: id }, doc, { upsert: true });
  kickLsqWebhookSync();
  return result;
}

async function deleteSessionById(id) {
  return sessionsCollection().deleteOne({ _id: id });
}

async function replaceAllByPmo(list) {
  return writePmoSessionsReplaceAll(list);
}

async function replaceAllBySpeakerMerged(list) {
  return writeSpeakerMergedSessions(list);
}

async function appendStudentIdToSession(id, studentIdRaw) {
  const doc = await sessionsCollection().findOne({ _id: id });
  if (!doc) return { ok: false, status: 404, msg: 'Session not found.' };
  const merged = addStudentId(doc.student_ids, studentIdRaw);
  if (!merged.ok) return { ok: false, status: 400, msg: merged.msg };

  const pending = lsqPendingUpdate(
    { ...sessionDocToClient(doc), student_ids: merged.student_ids },
    doc
  );
  const update = {
    $set: {
      student_ids: merged.student_ids,
      updatedAt: new Date(),
      ...(pending?.$set || {}),
    },
  };
  if (pending?.$unset) update.$unset = pending.$unset;

  await sessionsCollection().updateOne({ _id: id }, update);
  kickLsqWebhookSync();
  return { ok: true, student_ids: merged.student_ids };
}

module.exports = {
  readAllSessions,
  findSessionById,
  insertSession,
  upsertSessionById,
  deleteSessionById,
  replaceAllByPmo,
  replaceAllBySpeakerMerged,
  appendStudentIdToSession,
};
