/**
 * User Model
 * Defines schema for all system roles: Citizen, Collector, Recycling Center, and Admin
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter your full name'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please enter your email address'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address',
      ],
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Please enter your phone number'],
      trim: true,
      minlength: [10, 'Phone number must be at least 10 digits'],
      maxlength: [15, 'Phone number cannot exceed 15 digits'],
    },
    password: {
      type: String,
      required: [true, 'Please enter a password'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false, // Do not return password by default in queries
    },
    role: {
      type: String,
      enum: {
        values: ['citizen', 'collector', 'center', 'admin'],
        message: '{VALUE} is not a valid role',
      },
      default: 'citizen',
      index: true,
    },
    address: {
      street: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      postalCode: { type: String, trim: true, default: '' },
      landmark: { type: String, trim: true, default: '' },
    },
    accountStatus: {
      type: String,
      enum: ['active', 'pending_approval', 'inactive'],
      default: function () {
        // Citizens and Admins are active by default; collectors and centers require admin approval
        return this.role === 'citizen' || this.role === 'admin' ? 'active' : 'active';
      },
      index: true,
    },
    // Collector specific fields
    collectorInfo: {
      vehicleType: { type: String, trim: true, default: '' }, // e.g., 'Truck', 'Van', 'Electric Tricycle'
      vehicleNumber: { type: String, trim: true, default: '' },
      isOnDuty: { type: Boolean, default: true },
    },
    // Recycling Center specific link
    centerRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecyclingCenter',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with stored hash
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Remove sensitive fields when converting to JSON
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);
