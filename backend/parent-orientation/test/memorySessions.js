/** Minimal Mongo-like sessions collection for LSQ webhook tests. */

function isPending(doc, now = new Date(), { claimTtlMs = 5 * 60_000, maxAttempts = 10 } = {}) {
  if (!Array.isArray(doc.student_ids) || doc.student_ids.length === 0) return false;
  if (!(doc.lsq_webhook_due_at instanceof Date) || doc.lsq_webhook_due_at.getTime() > now.getTime()) return false;
  if (doc.lsq_webhook_sent_at != null) return false;
  if (doc.lsq_webhook_failed_at != null) return false;
  const claimExpiry = new Date(now.getTime() - claimTtlMs);
  if (doc.lsq_webhook_claimed_at instanceof Date && !(doc.lsq_webhook_claimed_at < claimExpiry)) return false;
  if (doc.lsq_webhook_attempts != null && doc.lsq_webhook_attempts >= maxAttempts) return false;
  return true;
}

function applyUpdate(doc, update) {
  if (update.$set) Object.assign(doc, update.$set);
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      doc[k] = (Number(doc[k]) || 0) + v;
    }
  }
  if (update.$unset) {
    for (const k of Object.keys(update.$unset)) delete doc[k];
  }
}

function createMemorySessions(seedDocs = [], opts = {}) {
  const docs = seedDocs.map((d) => ({
    ...d,
    student_ids: Array.isArray(d.student_ids) ? [...d.student_ids] : [],
  }));

  function findById(id) {
    return docs.find((d) => d._id === id) || null;
  }

  return {
    docs,
    find() {
      const chain = {
        _limit: Infinity,
        sort() {
          return chain;
        },
        limit(n) {
          chain._limit = n;
          return chain;
        },
        project() {
          return chain;
        },
        async toArray() {
          const now = new Date();
          return docs
            .filter((d) => isPending(d, now, opts))
            .sort((a, b) => a.lsq_webhook_due_at - b.lsq_webhook_due_at)
            .slice(0, chain._limit)
            .map((d) => ({ _id: d._id }));
        },
      };
      return chain;
    },
    async findOneAndUpdate(filter, update) {
      const doc = findById(filter._id);
      if (!doc || !isPending(doc, filter.lsq_webhook_due_at?.$lte || new Date(), opts)) return null;
      applyUpdate(doc, update);
      return { ...doc, student_ids: [...doc.student_ids] };
    },
    async updateOne(filter, update) {
      const doc = findById(filter._id);
      if (!doc) return { matchedCount: 0 };
      applyUpdate(doc, update);
      return { matchedCount: 1 };
    },
    async countDocuments() {
      return docs.filter((d) => isPending(d, new Date(), opts)).length;
    },
  };
}

module.exports = { createMemorySessions, isPending };
