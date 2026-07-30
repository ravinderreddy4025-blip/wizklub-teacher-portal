const {
  validatePmoSessionsBody,
  validateSpeakerSessionsPayload,
  mergeSpeakerUpdates,
  speakerIncomingIdSet,
  validateCompletedAttendedVsInvited,
  validateSpeakerSessionBusinessRules,
  validateSessionId,
  pmoConflictingGrades,
  pmoScheduleConflictMessage,
  validatePmoSessionRecord,
} = require('../domain/sessions');

function validatePmoBulkPayload(body) {
  return validatePmoSessionsBody(body);
}

function validateSpeakerBulkPayload(body) {
  if (!validateSpeakerSessionsPayload(body)) {
    return { ok: false, status: 400, msg: 'Expected a JSON array of session objects.' };
  }
  return { ok: true };
}

function validateCreateOrUpdateItem(item, all, idForUpdate) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    return { ok: false, status: 400, msg: 'Expected a single session JSON object.' };
  }
  if (!validateSessionId(item.id)) {
    return { ok: false, status: 400, msg: 'Session must have a valid id.' };
  }
  if (idForUpdate != null && String(item.id) !== String(idForUpdate)) {
    return { ok: false, status: 400, msg: 'JSON body id must match the URL.' };
  }
  const fieldErr = validatePmoSessionRecord(item);
  if (fieldErr) {
    return { ok: false, status: 400, msg: `Session ${item.id}: ${fieldErr}` };
  }
  for (const o of all) {
    if (idForUpdate != null && String(o.id) === String(idForUpdate)) continue;
    const cg = pmoConflictingGrades(item, o);
    if (cg) return { ok: false, status: 400, msg: pmoScheduleConflictMessage(cg) };
  }
  return { ok: true };
}

function validateSpeakerMergedPayload(existing, incoming) {
  const merged = mergeSpeakerUpdates(existing, incoming);
  const speakerIds = speakerIncomingIdSet(incoming);
  const vAtt = validateCompletedAttendedVsInvited(merged, speakerIds);
  if (!vAtt.ok) return { ok: false, status: 400, msg: vAtt.msg };
  const vBiz = validateSpeakerSessionBusinessRules(merged, speakerIds);
  if (!vBiz.ok) return { ok: false, status: 400, msg: vBiz.msg };
  return { ok: true, merged };
}

module.exports = {
  validatePmoBulkPayload,
  validateSpeakerBulkPayload,
  validateCreateOrUpdateItem,
  validateSpeakerMergedPayload,
};

