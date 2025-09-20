
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function run() {
  console.log('Attempting to connect to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Successfully connected to MongoDB.');

    const email = process.env.ADMIN_EMAIL;
    const password = 'admin123';
    const existing = await User.findOne({ email });

    if (existing) {
      console.log('Admin already exists');
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ name: 'Admin', email, passwordHash, role: 'admin' });
    await user.save();

    console.log('Admin created:', email, 'password:', password);
    process.exit(0);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    }
  }
}

run();