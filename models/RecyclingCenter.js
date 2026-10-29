/**
 * RecyclingCenter Model
 * Defines authorized waste processing and material recovery facilities
 */

const mongoose = require('mongoose');

const recyclingCenterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide the recycling center name'],
      unique: true,
      trim: true,
    },
    managerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    address: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      postalCode: { type: String, required: true, trim: true },
    },
    contactPhone: {
      type: String,
      required: [true, 'Please provide a contact phone number'],
      trim: true,
    },
    contactEmail: {
      type: String,
      required: [true, 'Please provide a contact email'],
      trim: true,
      lowercase: true,
    },
    acceptedCategories: [
      {
        type: String,
        enum: [
          'Organic waste',
          'Plastic',
          'Paper and cardboard',
          'Glass',
          'Metal',
          'Electronic waste',
          'Mixed or other waste',
        ],
      },
    ],
    dailyCapacityKg: {
      type: Number,
      default: 5000,
      min: [0, 'Capacity cannot be negative'],
    },
    operatingHours: {
      type: String,
      default: '08:00 AM - 06:00 PM (Mon-Sat)',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('RecyclingCenter', recyclingCenterSchema);
