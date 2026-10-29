/**
 * Administrator Account Setup Script
 * Creates or updates an administrative user account without hardcoding credentials in code
 *
 * Usage:
 *   node scripts/setup-admin.js
 * Or with custom environment variables:
 *   ADMIN_NAME="Head Admin" ADMIN_EMAIL="admin@custom.org" ADMIN_PASSWORD="SecretPassword123!" node scripts/setup-admin.js
 */

require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const User = require('../models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};

const setupAdmin = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wastewise';

  try {
    console.log('[Setup Admin] Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('[Setup Admin] Connected to database.');

    let name = process.env.ADMIN_NAME;
    let email = process.env.ADMIN_EMAIL;
    let password = process.env.ADMIN_PASSWORD;
    let phone = process.env.ADMIN_PHONE || '+91 98765 00000';

    // If not provided via env, prompt interactively if running in terminal, or use safe defaults
    if (!email || !password) {
      if (process.stdin.isTTY) {
        name = name || (await askQuestion('Enter Admin Full Name [System Admin]: ')) || 'System Admin';
        email = await askQuestion('Enter Admin Email Address: ');
        password = await askQuestion('Enter Admin Password (min 6 chars): ');
        phone = (await askQuestion('Enter Admin Phone Number [+91 98765 00000]: ')) || phone;
      } else {
        name = name || 'System Administrator';
        email = email || 'admin@wastewise.org';
        password = password || 'Admin@123456';
      }
    }

    if (!email || !password || password.length < 6) {
      console.error('Error: A valid email and password (minimum 6 characters) are required.');
      process.exit(1);
    }

    const existingAdmin = await User.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      console.log(`Admin user with email ${email} already exists. Updating credentials...`);
      existingAdmin.name = name;
      existingAdmin.password = password; // Will be hashed by User pre-save hook
      existingAdmin.role = 'admin';
      existingAdmin.accountStatus = 'active';
      await existingAdmin.save();
      console.log(`[Success] Administrator account "${email}" updated successfully.`);
    } else {
      await User.create({
        name,
        email: email.toLowerCase(),
        phone,
        password,
        role: 'admin',
        accountStatus: 'active',
        address: {
          street: 'Main Administration Building',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
        },
      });
      console.log(`[Success] Administrator account "${email}" created successfully.`);
    }

    await mongoose.disconnect();
    rl.close();
    process.exit(0);
  } catch (err) {
    console.error('[Setup Admin Error]', err.message);
    rl.close();
    process.exit(1);
  }
};

setupAdmin();
