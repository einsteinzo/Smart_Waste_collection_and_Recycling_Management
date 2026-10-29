/**
 * RecyclingRecord Model
 * Detailed facility audit record created when a recycling center processes waste
 */

const mongoose = require('mongoose');

const recyclingRecordSchema = new mongoose.Schema(
  {
    pickup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pickup',
      required: true,
      index: true,
    },
    recyclingCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecyclingCenter',
      required: true,
      index: true,
    },
    materialCategories: [
      {
        type: String,
        required: true,
      },
    ],
    receivedWeight: {
      type: Number,
      required: [true, 'Received weight is required'],
      min: [0, 'Received weight cannot be negative'],
    },
    rejectedWeight: {
      type: Number,
      default: 0,
      min: [0, 'Rejected weight cannot be negative'],
    },
    netRecycledWeight: {
      type: Number,
      default: function () {
        return Math.max(0, (this.receivedWeight || 0) - (this.rejectedWeight || 0));
      },
    },
    processingOutcome: {
      type: String,
      required: true,
      enum: [
        'Recycled',
        'Composted',
        'Refurbished / Reused',
        'Safely Disposed / Waste-to-Energy',
      ],
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('RecyclingRecord', recyclingRecordSchema);
