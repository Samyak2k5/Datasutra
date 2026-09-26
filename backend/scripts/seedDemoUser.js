import bcrypt from 'bcrypt';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';

const email = process.env.DEMO_EMAIL || 'john@example.com';
const password = process.env.DEMO_PASSWORD || 'SecurePass123!';
const name = process.env.DEMO_NAME || 'John Doe';

try {
  await connectDB();

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      $set: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: 'user',
        isActive: true
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`Demo user ready: ${user.email}`);
  console.log(`Demo password: ${password}`);
} catch (error) {
  console.error('Failed to seed demo user:', error.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
