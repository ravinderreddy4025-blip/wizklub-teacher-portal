const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { loadRootEnv } = require('../src/config/loadEnv');

loadRootEnv();

const User = require('../src/models/User');
const Division = require('../src/models/Division');
const School = require('../src/models/School');
const Kit = require('../src/models/Kit');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');

    await User.deleteMany();
    await Division.deleteMany();
    await School.deleteMany();
    await Kit.deleteMany();

    const division = await Division.create({ name: 'North Region', description: 'Northern schools division' });

    const kit1 = await Kit.create({ name: 'Robotics Kit Level 1', kitId: 'ROB-L1', type: 'Robotics' });
    const kit2 = await Kit.create({ name: 'IoT Kit', kitId: 'IOT-01', type: 'IoT' });

    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash('password123', salt);
    const { encryptSecret } = require('../src/utils/credentialSecret');
    const amPasswordEncrypted = encryptSecret('password123');

    const adminUser = await User.create({
      name: 'Super Admin',
      email: 'admin@wizklub.com',
      password,
      role: 'Admin'
    });

    const rmUser = await User.create({
      name: 'Account Manager',
      email: 'am@wizklub.com',
      password,
      passwordEncrypted: amPasswordEncrypted,
      role: 'AM',
      divisionId: division._id
    });

    division.regionalManagerId = rmUser._id;
    await division.save();

    const school = await School.create({
      name: 'Springfield High',
      code: 'SHS001',
      divisionId: division._id,
      address: '123 Main St',
      contactEmail: 'school@wizklub.com',
      rmId: rmUser._id,
    });

    const schoolUser = await User.create({
      name: 'John Doe',
      email: 'school@wizklub.com',
      password,
      role: 'School',
      schoolId: school._id
    });

    const dispatchUser = await User.create({
      name: 'Dispatch Team',
      email: 'dispatch@wizklub.com',
      password,
      role: 'Dispatch'
    });

    console.log('Data successfully seeded!');
    process.exit();
  })
  .catch((error) => {
    console.error('Error seeding data:', error.message);
    process.exit(1);
  });
