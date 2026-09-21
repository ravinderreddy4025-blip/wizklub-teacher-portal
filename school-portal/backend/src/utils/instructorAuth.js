const jwt = require('jsonwebtoken');

const INSTRUCTOR_SESSION_TTL = '2h';

function generateInstructorSession(payload) {
  return jwt.sign(
    {
      type: 'instructor',
      schoolIds: payload.schoolIds || [],
      wizklubToken: payload.wizklubToken || null,
      instructorName: payload.instructorName || '',
      username: payload.username || '',
    },
    process.env.JWT_SECRET,
    { expiresIn: INSTRUCTOR_SESSION_TTL },
  );
}

function verifyInstructorSession(token) {
  if (!token) {
    const err = new Error('Instructor session expired. Please sign in again.');
    err.status = 401;
    throw err;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'instructor' || !Array.isArray(decoded.schoolIds)) {
      const err = new Error('Invalid instructor session');
      err.status = 401;
      throw err;
    }
    return decoded;
  } catch (error) {
    const err = new Error('Instructor session expired. Please sign in again.');
    err.status = 401;
    throw err;
  }
}

function readInstructorToken(req) {
  const header = req.headers['x-instructor-token'];
  if (header) return header;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.split(' ')[1];
    try {
      const decoded = jwt.decode(token);
      if (decoded?.type === 'instructor') return token;
    } catch {
      // fall through
    }
  }
  return req.body?.instructorToken || null;
}

function schoolIdAllowed(decoded, schoolCode) {
  const normalized = String(schoolCode || '').trim().toLowerCase();
  if (!normalized) return false;
  return (decoded?.schoolIds || []).some((id) => String(id).trim().toLowerCase() === normalized);
}

module.exports = {
  generateInstructorSession,
  verifyInstructorSession,
  readInstructorToken,
  schoolIdAllowed,
};
