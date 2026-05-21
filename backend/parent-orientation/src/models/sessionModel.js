const {
  sessionsCollection,
  toSessionDocument,
  sessionDocToClient,
  readAllSessionsFromDb,
  writePmoSessionsReplaceAll,
  writeSpeakerMergedSessions,
} = require('../services/mongo');
const { addStudentId } = require('../domain/studentIds');

async function readAllSessions() {
  return readAllSessionsFromDb();
}

async function findSessionById(id) {
  const doc = await sessionsCollection().findOne({ _id: id });
  if (!doc) return null;
  return sessionDocToClient(doc);
}

async function insertSession(item) {
  return sessionsCollection().insertOne(toSessionDocument(item));
}

async function upsertSessionById(id, item) {
  return sessionsCollection().replaceOne({ _id: id }, toSessionDocument(item), { upsert: true });
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
  await sessionsCollection().updateOne(
    { _id: id },
    { $set: { student_ids: merged.student_ids, updatedAt: new Date() } }
  );
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

