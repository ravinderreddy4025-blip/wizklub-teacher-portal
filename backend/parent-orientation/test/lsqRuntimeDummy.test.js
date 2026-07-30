/**
 * Runtime CRM sync tests with dummy session data + mocked CRM fetch.
 * Does not require a live MongoDB or real CRM endpoint.
 */
process.env.LSQ_WEBHOOK_DISABLED = '0';
process.env.WIZKLUB_PARENTS_SESSION_WEBHOOK_URL = 'https://crm.test/wizklub_parents_session_webhook';
process.env.LSQ_WEBHOOK_MAX_ATTEMPTS = '3';
process.env.LSQ_WEBHOOK_BATCH_SIZE = '25';

const assert = require('assert');
const { createMemorySessions } = require('./memorySessions');
const {
  attachLsqWebhookFields,
  payloadFingerprint,
  webhookPayload,
  lsqPendingUpdate,
} = require('../src/domain/lsqSync');
const {
  processDueLsqWebhooks,
  postWebhook,
  __setLsqWebhookTestHooks,
  __resetLsqWebhookTestHooks,
} = require('../src/services/lsqWebhook');

function test(name, fn) {
  const out = fn();
  if (out && typeof out.then === 'function') {
    return out
      .then(() => console.log(`ok — ${name}`))
      .catch((err) => {
        console.error(`fail — ${name}`);
        throw err;
      });
  }
  console.log(`ok — ${name}`);
  return Promise.resolve();
}

const DUMMY = {
  planned: {
    id: '11111111-1111-4111-8111-111111111111',
    _id: '11111111-1111-4111-8111-111111111111',
    status: 'Planned',
    scheduled_date: '2026-07-20',
    scheduled_end_time: '17:00',
    venue: 'Online Zoom',
    teacher: 'Demo Teacher',
    student_ids: ['SCSDTEST32328372837'],
  },
  completed: {
    id: '22222222-2222-4222-8222-222222222222',
    _id: '22222222-2222-4222-8222-222222222222',
    status: 'Completed',
    scheduled_date: '2026-07-18',
    scheduled_end_time: '16:00',
    venue: 'School Hall',
    teacher: 'Speaker One',
    student_ids: ['SCSDTEST111', 'SCSDTEST222'],
  },
  noStudents: {
    id: '33333333-3333-4333-8333-333333333333',
    _id: '33333333-3333-4333-8333-333333333333',
    status: 'Planned',
    scheduled_date: '2026-07-21',
    venue: 'Room A',
    teacher: 'Teacher B',
    student_ids: [],
  },
  cancelled: {
    id: '44444444-4444-4444-8444-444444444444',
    _id: '44444444-4444-4444-8444-444444444444',
    status: 'Cancelled',
    scheduled_date: '2026-07-19',
    venue: 'Online',
    teacher: 'Teacher C',
    student_ids: ['SCSDCANCEL99'],
  },
};

function seedPending(row) {
  const doc = attachLsqWebhookFields({ ...row, student_ids: [...row.student_ids] }, null);
  return doc;
}

async function run() {
  await test('payload for Planned dummy includes status + student_ids', () => {
    const p = webhookPayload(DUMMY.planned);
    assert.strictEqual(p.status, 'Planned');
    assert.deepStrictEqual(p.student_ids, ['SCSDTEST32328372837']);
    assert.strictEqual(p.id, DUMMY.planned.id);
  });

  await test('attach: Planned + Completed + Cancelled with students become pending; empty skips', () => {
    const p = seedPending(DUMMY.planned);
    const c = seedPending(DUMMY.completed);
    const x = seedPending(DUMMY.cancelled);
    const n = seedPending(DUMMY.noStudents);

    assert(p.lsq_webhook_due_at instanceof Date);
    assert(c.lsq_webhook_due_at instanceof Date);
    assert(x.lsq_webhook_due_at instanceof Date);
    assert.strictEqual(n.lsq_webhook_due_at, undefined);
  });

  await test('postWebhook posts exact dummy payload on 200', async () => {
    const calls = [];
    __setLsqWebhookTestHooks({
      fetchFn: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 200, text: async () => 'ok' };
      },
    });
    try {
      const result = await postWebhook(DUMMY.planned);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, process.env.WIZKLUB_PARENTS_SESSION_WEBHOOK_URL);
      assert.deepStrictEqual(calls[0].body, {
        id: DUMMY.planned.id,
        status: 'Planned',
        scheduled_date: '2026-07-20',
        venue: 'Online Zoom',
        teacher: 'Demo Teacher',
        student_ids: ['SCSDTEST32328372837'],
      });
      assert.strictEqual(result.fingerprint, payloadFingerprint(DUMMY.planned));
    } finally {
      __resetLsqWebhookTestHooks();
    }
  });

  await test('postWebhook rejects missing student_ids', async () => {
    const result = await postWebhook(DUMMY.noStudents);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_student_ids');
  });

  await test('scheduler sends Planned + Completed + Cancelled; skips no-students', async () => {
    const mem = createMemorySessions(
      [
        seedPending(DUMMY.planned),
        seedPending(DUMMY.completed),
        seedPending(DUMMY.noStudents),
        seedPending(DUMMY.cancelled),
      ],
      { maxAttempts: 3 }
    );
    const posted = [];
    __setLsqWebhookTestHooks({
      getCollection: () => mem,
      fetchFn: async (_url, init) => {
        posted.push(JSON.parse(init.body));
        return { ok: true, status: 200, text: async () => 'ok' };
      },
    });
    try {
      const summary = await processDueLsqWebhooks();
      assert.strictEqual(summary.sent, 3);
      assert.strictEqual(summary.failed, 0);
      assert.strictEqual(posted.length, 3);

      const ids = posted.map((p) => p.id).sort();
      assert.deepStrictEqual(ids, [DUMMY.planned.id, DUMMY.completed.id, DUMMY.cancelled.id].sort());

      const plannedPost = posted.find((p) => p.id === DUMMY.planned.id);
      assert.strictEqual(plannedPost.status, 'Planned');
      assert.deepStrictEqual(plannedPost.student_ids, ['SCSDTEST32328372837']);

      const plannedDoc = mem.docs.find((d) => d._id === DUMMY.planned.id);
      assert(plannedDoc.lsq_webhook_sent_at instanceof Date);
      assert.strictEqual(plannedDoc.lsq_webhook_payload_fp, payloadFingerprint(DUMMY.planned));
      assert.strictEqual(plannedDoc.lsq_webhook_due_at, undefined);
    } finally {
      __resetLsqWebhookTestHooks();
    }
  });

  await test('second run is no-op after successful sync (fingerprint de-dupe)', async () => {
    const mem = createMemorySessions([seedPending(DUMMY.planned)], { maxAttempts: 3 });
    let posts = 0;
    __setLsqWebhookTestHooks({
      getCollection: () => mem,
      fetchFn: async () => {
        posts += 1;
        return { ok: true, status: 200, text: async () => 'ok' };
      },
    });
    try {
      await processDueLsqWebhooks();
      const again = await processDueLsqWebhooks();
      assert.strictEqual(posts, 1);
      assert.strictEqual(again.processed, 0);
      assert.strictEqual(again.sent, 0);

      // Re-save same payload → still not pending
      const existing = mem.docs[0];
      const reattached = attachLsqWebhookFields({ ...DUMMY.planned }, existing);
      assert.strictEqual(reattached.lsq_webhook_due_at, undefined);
      assert(reattached.lsq_webhook_sent_at instanceof Date);
    } finally {
      __resetLsqWebhookTestHooks();
    }
  });

  await test('student append changes fingerprint and re-pends sync', async () => {
    const existing = {
      ...seedPending(DUMMY.planned),
      lsq_webhook_sent_at: new Date(),
      lsq_webhook_payload_fp: payloadFingerprint(DUMMY.planned),
    };
    delete existing.lsq_webhook_due_at;

    const next = {
      ...DUMMY.planned,
      student_ids: ['SCSDTEST32328372837', 'SCSDNEW999'],
    };
    const pending = lsqPendingUpdate(next, existing);
    assert(pending, 'expected pending update after new student id');
    assert(pending.$set.lsq_webhook_due_at instanceof Date);

    const mem = createMemorySessions(
      [
        {
          ...existing,
          student_ids: next.student_ids,
          lsq_webhook_due_at: pending.$set.lsq_webhook_due_at,
          lsq_webhook_sent_at: undefined,
        },
      ],
      { maxAttempts: 3 }
    );
    delete mem.docs[0].lsq_webhook_sent_at;

    const posted = [];
    __setLsqWebhookTestHooks({
      getCollection: () => mem,
      fetchFn: async (_url, init) => {
        posted.push(JSON.parse(init.body));
        return { ok: true, status: 200, text: async () => 'ok' };
      },
    });
    try {
      const summary = await processDueLsqWebhooks();
      assert.strictEqual(summary.sent, 1);
      assert.deepStrictEqual(posted[0].student_ids, ['SCSDTEST32328372837', 'SCSDNEW999']);
    } finally {
      __resetLsqWebhookTestHooks();
    }
  });

  await test('CRM 500 fails attempt; abandons after maxAttempts', async () => {
    const mem = createMemorySessions([seedPending(DUMMY.planned)], { maxAttempts: 3 });
    __setLsqWebhookTestHooks({
      getCollection: () => mem,
      fetchFn: async () => ({ ok: false, status: 500, text: async () => 'crm down' }),
    });
    try {
      await processDueLsqWebhooks();
      await processDueLsqWebhooks();
      await processDueLsqWebhooks();
      const doc = mem.docs[0];
      assert.strictEqual(doc.lsq_webhook_attempts, 3);
      assert(doc.lsq_webhook_failed_at instanceof Date);
      assert.match(String(doc.lsq_webhook_last_error), /http_500/);

      const after = await processDueLsqWebhooks();
      assert.strictEqual(after.processed, 0);
    } finally {
      __resetLsqWebhookTestHooks();
    }
  });

  console.log('\nAll runtime dummy CRM sync tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
