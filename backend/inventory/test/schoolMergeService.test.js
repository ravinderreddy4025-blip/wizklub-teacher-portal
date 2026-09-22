const test = require('node:test');
const assert = require('node:assert/strict');
const {
  previewSchoolMerge,
  mergeSchools,
} = require('../src/services/schoolMergeService');

function mergeAuditItems(primaryItems, secondaryItems) {
  const byKit = new Map();
  for (const item of primaryItems) {
    byKit.set(String(item.kit), { ...item });
  }
  for (const item of secondaryItems) {
    const key = String(item.kit);
    const existing = byKit.get(key);
    if (!existing) {
      byKit.set(key, { ...item });
      continue;
    }
    existing.availableQuantity = (existing.availableQuantity || 0) + (item.availableQuantity || 0);
    existing.lostQuantity = (existing.lostQuantity || 0) + (item.lostQuantity || 0);
  }
  return [...byKit.values()];
}

test('merge audit items sums quantities by kit', () => {
  const kitA = 'kit-a';
  const merged = mergeAuditItems(
    [{ kit: kitA, availableQuantity: 3, lostQuantity: 1 }],
    [{ kit: kitA, availableQuantity: 2, lostQuantity: 4 }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].availableQuantity, 5);
  assert.equal(merged[0].lostQuantity, 5);
});

test('previewSchoolMerge rejects same school id', async () => {
  await assert.rejects(
    () => previewSchoolMerge({ primarySchoolId: 'abc', secondarySchoolId: 'abc' }),
    (err) => err.status === 400,
  );
});

test('mergeSchools requires final division', async () => {
  try {
    await mergeSchools({
      primarySchoolId: '507f1f77bcf86cd799439011',
      secondarySchoolId: '507f1f77bcf86cd799439012',
      identitySource: 'primary',
      performedBy: '507f1f77bcf86cd799439013',
    });
    assert.fail('Expected mergeSchools to reject missing final division');
  } catch (err) {
    assert.equal(err.status, 400);
    assert.match(err.message, /final division/i);
  }
});
