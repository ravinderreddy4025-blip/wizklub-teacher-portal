/**
 * Preload with: node -r ./test/setup-env.js --test test/
 * Runs before backend/server.js so dotenv does not override these (dotenv skips existing keys).
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = '';
process.env.COOKIE_SECRET = 'test-cookie-secret-32chars-min!!';
process.env.PMO_USER = 'test_pmo';
process.env.PMO_PASS = 'test-pmo-pass-12';
process.env.SPEAKER_USER = 'test_speaker';
process.env.SPEAKER_PASS = 'test-speaker-12';
process.env.COOKIE_SECURE = '0';
