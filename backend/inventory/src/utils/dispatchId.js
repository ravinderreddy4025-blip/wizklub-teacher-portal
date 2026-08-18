const crypto = require('crypto');
const Dispatch = require('../models/Dispatch');

function generateDispatchIdCandidate(extraBytes = 4) {
  const shortRandom = crypto.randomBytes(extraBytes).toString('hex').toUpperCase();
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `DSP-${datePart}-${shortRandom}`;
}

async function generateUniqueDispatchId() {
  const [id] = await generateUniqueDispatchIds(1);
  return id;
}

/** Generate N unique dispatch IDs with minimal DB round-trips. */
async function generateUniqueDispatchIds(count) {
  if (count <= 0) return [];

  const result = [];
  const blocked = new Set();
  let safety = 0;
  const maxAttempts = Math.max(count * 25, 50);

  while (result.length < count) {
    if (safety >= maxAttempts) {
      throw new Error('Unable to generate unique dispatch IDs');
    }
    safety += 1;

    const need = count - result.length;
    const batchSet = new Set();
    const candidates = [];

    let batchGuard = 0;
    while (candidates.length < need && batchGuard < need * 20) {
      batchGuard += 1;
      const candidate = generateDispatchIdCandidate();
      if (blocked.has(candidate) || batchSet.has(candidate)) continue;
      batchSet.add(candidate);
      candidates.push(candidate);
    }

    if (candidates.length < need) continue;

    // eslint-disable-next-line no-await-in-loop
    const existing = await Dispatch.find({ dispatchId: { $in: candidates } }).distinct('dispatchId');
    for (const id of existing) blocked.add(id);

    for (const candidate of candidates) {
      if (blocked.has(candidate)) continue;
      result.push(candidate);
      blocked.add(candidate);
      if (result.length >= count) break;
    }
  }

  return result;
}

module.exports = { generateUniqueDispatchId, generateUniqueDispatchIds };
