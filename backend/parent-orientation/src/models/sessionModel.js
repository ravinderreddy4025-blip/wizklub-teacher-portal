const {
  sessionsCollection,
  toSessionDocument,
  readAllSessionsFromDb,
  writePmoSessionsReplaceAll,
  writeSpeakerMergedSessions,
} = require('../services/mongo');

async function readAllSessions() {
  return readAllSessionsFromDb();
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

module.exports = {
  readAllSessions,
  insertSession,
  upsertSessionById,
  deleteSessionById,
  replaceAllByPmo,
  replaceAllBySpeakerMerged,
};

