'use strict';

const { signStudentLink, buildStudentSubmitPath, buildStudentSubmitUrl } = require('../lib/studentLink');

describe('studentLink', () => {
  const secret = 'test_secret_32_bytes_minimum_ok__';

  test('sign is stable for same inputs', () => {
    const s = signStudentLink('STU001', 1710000000000, secret);
    expect(s).toBe(signStudentLink('STU001', 1710000000000, secret));
    expect(s).not.toBe(signStudentLink('STU002', 1710000000000, secret));
  });

  test('buildStudentSubmitUrl joins base without double slash', () => {
    const u = buildStudentSubmitUrl('https://example.com', 'STU1', 1710000000000, secret);
    expect(u).toMatch(/^https:\/\/example\.com\/submit\//);
  });

  test('path encodes student id', () => {
    const p = buildStudentSubmitPath('A/B', 1710000000000, secret);
    expect(p).toContain(encodeURIComponent('A/B'));
  });
});
