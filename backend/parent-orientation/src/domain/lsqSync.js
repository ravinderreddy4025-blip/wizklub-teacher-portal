const { normalizeStudentIds } = require('./studentIds');

const LSQ_INTERNAL_FIELDS = [
  'lsq_webhook_sent_at',
  'lsq_webhook_due_at',
  'lsq_webhook_claimed_at',
  'lsq_webhook_attempts',
  'lsq_webhook_last_error',
  'lsq_webhook_last_attempt_at',
  'lsq_webhook_failed_at',
  'lsq_webhook_payload_fp',
];

function webhookPayload(row) {
  return {
    id: String(row?.id || '').trim(),
    status: String(row?.status || '').trim(),
    scheduled_date: String(row?.scheduled_date || '').trim(),
    venue: String(row?.venue || '').trim(),
    teacher: String(row?.teacher || '').trim(),
    student_ids: normalizeStudentIds(row?.student_ids),
  };
}

function payloadFingerprint(row) {
  return JSON.stringify(webhookPayload(row));
}

function clearLsqFields(doc) {
  for (const key of LSQ_INTERNAL_FIELDS) delete doc[key];
  return doc;
}

/** Attach LSQ sync fields: pending when student_ids present and payload fingerprint changed. */
function attachLsqWebhookFields(doc, existing) {
  const student_ids = Array.isArray(doc.student_ids) ? doc.student_ids : [];
  if (!student_ids.length) return clearLsqFields(doc);

  const fp = payloadFingerprint(doc);
  delete doc.lsq_webhook_claimed_at;

  if (existing?.lsq_webhook_payload_fp === fp && existing?.lsq_webhook_sent_at) {
    doc.lsq_webhook_payload_fp = fp;
    doc.lsq_webhook_sent_at = existing.lsq_webhook_sent_at;
    delete doc.lsq_webhook_due_at;
    delete doc.lsq_webhook_attempts;
    delete doc.lsq_webhook_last_error;
    delete doc.lsq_webhook_last_attempt_at;
    delete doc.lsq_webhook_failed_at;
    return doc;
  }

  doc.lsq_webhook_due_at = new Date();
  delete doc.lsq_webhook_sent_at;

  if (existing?.lsq_webhook_payload_fp === fp) {
    if (existing.lsq_webhook_attempts != null) doc.lsq_webhook_attempts = existing.lsq_webhook_attempts;
    if (existing.lsq_webhook_last_error) doc.lsq_webhook_last_error = existing.lsq_webhook_last_error;
    if (existing.lsq_webhook_last_attempt_at) {
      doc.lsq_webhook_last_attempt_at = existing.lsq_webhook_last_attempt_at;
    }
    if (existing.lsq_webhook_failed_at) {
      doc.lsq_webhook_failed_at = existing.lsq_webhook_failed_at;
      delete doc.lsq_webhook_due_at;
    }
  } else {
    delete doc.lsq_webhook_attempts;
    delete doc.lsq_webhook_last_error;
    delete doc.lsq_webhook_last_attempt_at;
    delete doc.lsq_webhook_failed_at;
  }

  return doc;
}

/** Mongo update for append-student (and similar partial writes). */
function lsqPendingUpdate(row, existing) {
  const student_ids = normalizeStudentIds(row?.student_ids);
  if (!student_ids.length) {
    const unset = {};
    for (const key of LSQ_INTERNAL_FIELDS) unset[key] = '';
    return { $unset: unset };
  }

  const fp = payloadFingerprint({ ...row, student_ids });
  if (existing?.lsq_webhook_payload_fp === fp && existing?.lsq_webhook_sent_at) {
    return null;
  }

  const update = {
    $set: { lsq_webhook_due_at: new Date() },
    $unset: {
      lsq_webhook_sent_at: '',
      lsq_webhook_claimed_at: '',
    },
  };

  if (existing?.lsq_webhook_payload_fp !== fp) {
    update.$unset.lsq_webhook_attempts = '';
    update.$unset.lsq_webhook_last_error = '';
    update.$unset.lsq_webhook_last_attempt_at = '';
    update.$unset.lsq_webhook_failed_at = '';
  }

  return update;
}

module.exports = {
  LSQ_INTERNAL_FIELDS,
  webhookPayload,
  payloadFingerprint,
  attachLsqWebhookFields,
  lsqPendingUpdate,
  clearLsqFields,
};
