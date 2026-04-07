/**
 * One-off: remove every session from Mongo and clear legacy app_state.sessions
 * so startup migration does not re-insert old rows. Run: node scripts/clear-all-sessions.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');

const MONGODB_DB = process.env.MONGODB_DB || 'parent_orientation';
const STATE_DOC_ID = 'tracker_sessions';

async function main() {
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    console.error('MONGODB_URI is not set in .env');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(MONGODB_DB);
  const del = await db.collection('sessions').deleteMany({});
  const up = await db.collection('app_state').updateOne({ _id: STATE_DOC_ID }, { $set: { sessions: [] } });
  console.log('sessions collection: deleted', del.deletedCount, 'document(s)');
  console.log('app_state', STATE_DOC_ID + ':', 'matched', up.matchedCount, 'modified', up.modifiedCount);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
