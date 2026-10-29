/**
 * ActivityLog Model
 * Records auditable actions across the portal for transparency and administration
 */

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    userName: {
      type: String,
      default: 'System',
    },
    userRole: {
      type: String,
      default: 'system',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetEntity: {
      type: String,
      enum: ['User', 'Pickup', 'RecyclingCenter', 'RecyclingRecord', 'System', 'Auth'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Helper static method to quickly log an activity without crashing calling logic
activityLogSchema.statics.log = async function ({
  user = null,
  userName = 'System',
  userRole = 'system',
  action,
  targetEntity,
  targetId = null,
  description,
  metadata = {},
}) {
  try {
    await this.create({
      user,
      userName,
      userRole,
      action,
      targetEntity,
      targetId,
      description,
      metadata,
    });
  } catch (err) {
    console.error('[ActivityLog Error]', err.message);
  }
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);
