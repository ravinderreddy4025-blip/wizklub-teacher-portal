/**
 * One-time script to generate bcrypt hash for the admin password.
 * Run: node scripts/generate-hash.js <your-desired-password>
 * Then copy the output into your .env as ADMIN_PASSWORD_HASH=<hash>
 */
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/generate-hash.js <your-password>');
  process.exit(1);
}

const SALT_ROUNDS = 12;
const hash = bcrypt.hashSync(password, SALT_ROUNDS);
console.log('\n✅ Bcrypt Hash Generated:');
console.log(hash);
console.log('\n📋 Add this to your .env file:');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('\n⚠️  Never commit .env to version control!\n');
