import mongoose from 'mongoose';
import { connectDB, disconnectDB, getDatabaseStatus } from '../src/config/db.js';
import { User, Dataset, CleaningJob, CleaningRule, AuditLog } from '../src/models/index.js';

const runVerification = async () => {
  console.info('==========================================');
  console.info('🧪 Running DataSutra Database Verification');
  console.info('==========================================');

  // 1. Verify models registration
  console.info('1. Verifying models compilation...');
  const expectedModels = ['User', 'Dataset', 'CleaningJob', 'CleaningRule', 'AuditLog'];
  const registeredModels = Object.keys(mongoose.models);
  for (const m of expectedModels) {
    if (!registeredModels.includes(m)) {
      throw new Error(`Model ${m} is NOT registered!`);
    }
    console.info(`   ✔ Model ${m} is registered.`);
  }

  // 2. Test Connection
  console.info('\n2. Testing MongoDB connection...');
  await connectDB();
  const status = getDatabaseStatus();
  console.info(`   ✔ Mongoose readyState: ${status.readyState} (${status.state})`);
  if (status.state !== 'connected') {
    throw new Error(`Expected 'connected' state, got '${status.state}'`);
  }

  // 3. Test temporary read/write without persisting dummy data
  console.info('\n3. Testing temporary document lifecycle...');
  const testUser = new User({
    name: '__Test_Verifier__',
    email: `test_verifier_${Date.now()}@example.com`,
    passwordHash: 'dummy_hash_for_verification_only',
    role: 'viewer'
  });

  const savedUser = await testUser.save();
  console.info(`   ✔ Temporary test document written (ID: ${savedUser._id})`);

  const fetched = await User.findById(savedUser._id);
  if (!fetched || fetched.email !== savedUser.email) {
    throw new Error('Could not fetch saved test document');
  }
  console.info(`   ✔ Temporary test document verified.`);

  await User.deleteOne({ _id: savedUser._id });
  console.info(`   ✔ Temporary test document cleaned up successfully.`);

  // 4. Clean disconnect
  console.info('\n4. Testing graceful disconnection...');
  await disconnectDB();
  const disconnectedStatus = getDatabaseStatus();
  console.info(`   ✔ State after disconnect: ${disconnectedStatus.state}`);

  console.info('\n==========================================');
  console.info('🎉 Database verification passed with 100% success!');
  console.info('==========================================');
};

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  });
