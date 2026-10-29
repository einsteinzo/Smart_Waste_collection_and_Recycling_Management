/**
 * Pickup Model
 * Tracks waste collection requests through their entire lifecycle:
 * Requested -> Assigned -> Collected -> Delivered -> Completed (or Cancelled)
 */

const mongoose = require('mongoose');

const pickupSchema = new mongoose.Schema(
  {
    citizen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Citizen reference is required'],
      index: true,
    },
    wasteCategory: {
      type: String,
      required: [true, 'Waste category is required'],
      enum: {
        values: [
          'Organic waste',
          'Plastic',
          'Paper and cardboard',
          'Glass',
          'Metal',
          'Electronic waste',
          'Mixed or other waste',
        ],
        message: '{VALUE} is not an allowed waste category',
      },
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    estimatedQuantity: {
      type: Number,
      required: [true, 'Estimated quantity is required'],
      min: [0.1, 'Quantity must be greater than 0'],
    },
    estimatedUnit: {
      type: String,
      enum: ['kg', 'bags', 'items', 'liters', 'cubic_meters'],
      default: 'kg',
    },
    address: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      postalCode: { type: String, required: true, trim: true },
      landmark: { type: String, trim: true, default: '' },
    },
    preferredDate: {
      type: Date,
      required: [true, 'Preferred pickup date is required'],
    },
    preferredTimeSlot: {
      type: String,
      enum: [
        'Morning (8am - 12pm)',
        'Afternoon (12pm - 4pm)',
        'Evening (4pm - 8pm)',
      ],
      default: 'Morning (8am - 12pm)',
    },
    additionalInstructions: {
      type: String,
      trim: true,
      maxlength: [500, 'Instructions cannot exceed 500 characters'],
      default: '',
    },
    collector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    recyclingCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecyclingCenter',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: [
          'Requested',
          'Assigned',
          'Collected',
          'Delivered',
          'Completed',
          'Cancelled',
        ],
        message: '{VALUE} is an invalid status',
      },
      default: 'Requested',
      index: true,
    },
    // Collection Details (Recorded by Collector)
    collectionDetails: {
      collectedWeight: { type: Number, min: 0, default: null }, // actual kg
      collectionNotes: { type: String, trim: true, default: '' },
      collectedAt: { type: Date, default: null },
    },
    // Delivery Details (Recorded by Collector upon drop-off)
    deliveryDetails: {
      deliveryNotes: { type: String, trim: true, default: '' },
      deliveredAt: { type: Date, default: null },
    },
    // Recycling Verification & Material Processing Details (Recorded by Center)
    recyclingDetails: {
      receivedWeight: { type: Number, min: 0, default: null }, // actual kg received
      rejectedWeight: { type: Number, min: 0, default: 0 }, // contaminated / non-recyclable kg
      rejectionReason: { type: String, trim: true, default: '' },
      processingOutcome: {
        type: String,
        enum: [
          'Recycled',
          'Composted',
          'Refurbished / Reused',
          'Safely Disposed / Waste-to-Energy',
          'Pending',
        ],
        default: 'Pending',
      },
      processingNotes: { type: String, trim: true, default: '' },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      completedAt: { type: Date, default: null },
    },
    // Cancellation Details
    cancellation: {
      cancelledAt: { type: Date, default: null },
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reason: { type: String, trim: true, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Pickup', pickupSchema);
