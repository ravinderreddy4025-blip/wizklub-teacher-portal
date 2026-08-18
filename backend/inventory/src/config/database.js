const mongoose = require('mongoose');

const env = require('./env');



async function syncUserEmailIndex() {

  const User = require('../models/User');

  try {

    const indexes = await User.collection.indexes();

    const legacyEmailIndex = indexes.find(

      (idx) => idx.name === 'email_1' && idx.unique && !idx.partialFilterExpression

    );

    if (legacyEmailIndex) {

      await User.collection.dropIndex('email_1');

      console.log('Dropped legacy unique email index (schools may share contact emails)');

    }

  } catch (error) {

    if (error.codeName !== 'IndexNotFound') {

      console.warn('Could not update User email index:', error.message);

    }

  }

  await User.syncIndexes();

}



async function migrateRmToAm() {

  const User = require('../models/User');

  const ReplacementRequest = require('../models/ReplacementRequest');



  const rmUsers = await User.updateMany({ role: 'RM' }, { $set: { role: 'AM' } });

  if (rmUsers.modifiedCount) {

    console.log(`Migrated ${rmUsers.modifiedCount} RM user(s) to AM`);

  }



  const replStatus = await ReplacementRequest.updateMany(

    { status: 'Pending RM Approval' },

    { $set: { status: 'Pending AM Approval' } }

  );

  if (replStatus.modifiedCount) {

    console.log(`Migrated ${replStatus.modifiedCount} replacement request(s) to Pending AM Approval`);

  }



  const withRmNotes = await ReplacementRequest.countDocuments({ rmNotes: { $exists: true } });

  if (withRmNotes > 0) {

    await ReplacementRequest.collection.updateMany(

      { rmNotes: { $exists: true } },

      { $rename: { rmNotes: 'amNotes' } }

    );

    console.log(`Renamed rmNotes to amNotes on ${withRmNotes} replacement request(s)`);

  }

}



async function syncDispatchIndexes() {

  const Dispatch = require('../models/Dispatch');

  try {

    const indexes = await Dispatch.collection.indexes();

    const compoundIndex = indexes.find(

      (idx) => idx.key?.dispatchId === 1 && idx.key?.kit === 1 && idx.unique,

    );

    if (compoundIndex) {

      await Dispatch.collection.dropIndex(compoundIndex.name);

      console.log('Dropped compound dispatchId+kit index (restoring unique dispatchId per line)');

    }

  } catch (error) {

    if (error.codeName !== 'IndexNotFound') {

      console.warn('Could not drop compound Dispatch index:', error.message);

    }

  }

  await Dispatch.syncIndexes();

}



async function dedupeDuplicateConsignmentKitLines() {

  const { dedupeDuplicateConsignmentKitLines: dedupe } = require('../services/dispatchConsignmentService');

  const removed = await dedupe();

  if (removed > 0) {

    console.log(`Removed ${removed} duplicate kit line(s) on the same consignment`);

  }

}



async function splitSharedDispatchIdsPerKitLine() {

  const Dispatch = require('../models/Dispatch');

  const { generateUniqueDispatchId } = require('../utils/dispatchId');



  const groups = await Dispatch.aggregate([

    { $group: { _id: '$dispatchId', count: { $sum: 1 }, docIds: { $push: '$_id' } } },

    { $match: { count: { $gt: 1 } } },

  ]);



  let updated = 0;

  for (const group of groups) {

  // eslint-disable-next-line no-await-in-loop

    const docs = await Dispatch.find({ _id: { $in: group.docIds } }).sort({ createdAt: 1 });

    for (let i = 1; i < docs.length; i += 1) {

      // eslint-disable-next-line no-await-in-loop

      docs[i].dispatchId = await generateUniqueDispatchId();

      // eslint-disable-next-line no-await-in-loop

      await docs[i].save();

      updated += 1;

    }

  }

  if (updated > 0) {

    console.log(`Split ${updated} kit line(s) back to unique dispatch IDs`);

  }

}



const connectDatabase = async () => {

  if (!env.mongoUri) {

    throw new Error('MONGODB_URI is required to connect to the database');

  }



  await mongoose.connect(env.mongoUri);

  await migrateRmToAm();

  await syncUserEmailIndex();

  await splitSharedDispatchIdsPerKitLine();

  await dedupeDuplicateConsignmentKitLines();

  await syncDispatchIndexes();

  console.log('Connected to MongoDB');

};



module.exports = connectDatabase;

