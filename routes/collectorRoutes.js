/**
 * Collector Routes
 * Handles assigned pickups, recording actual collected weight, and recording deliveries
 */

const express = require('express');
const router = express.Router();
const Pickup = require('../models/Pickup');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const {
  recordCollectionValidation,
  recordDeliveryValidation,
} = require('../middleware/validation');

// All routes in this file require an active Collector account
router.use(isAuthenticated, hasRole('collector'));

/**
 * @route   GET /api/collector/pickups
 * @desc    Get all pickups assigned to the logged-in collector
 * @access  Private (Collector)
 */
router.get('/pickups', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { collector: req.user._id };

    if (status && status !== 'All') {
      query.status = status;
    }

    const pickups = await Pickup.find(query)
      .populate('citizen', 'name phone email address')
      .populate('recyclingCenter', 'name address contactPhone operatingHours')
      .sort({ preferredDate: 1, createdAt: -1 });

    res.json({
      success: true,
      count: pickups.length,
      pickups,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/collector/pickups/:id
 * @desc    Get single assigned pickup details with citizen contact info
 * @access  Private (Collector)
 */
router.get('/pickups/:id', async (req, res, next) => {
  try {
    const pickup = await Pickup.findOne({
      _id: req.params.id,
      collector: req.user._id,
    })
      .populate('citizen', 'name phone email address')
      .populate('recyclingCenter', 'name address contactPhone operatingHours acceptedCategories');

    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: 'Assigned pickup not found or not assigned to your account',
      });
    }

    res.json({
      success: true,
      pickup,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/collector/pickups/:id/collect
 * @desc    Record actual collected weight and notes (Assigned -> Collected)
 * @access  Private (Collector)
 */
router.post(
  '/pickups/:id/collect',
  recordCollectionValidation,
  async (req, res, next) => {
    try {
      const { collectedWeight, collectionNotes } = req.body;

      const pickup = await Pickup.findOne({
        _id: req.params.id,
        collector: req.user._id,
      });

      if (!pickup) {
        return res.status(404).json({
          success: false,
          message: 'Pickup not found or not assigned to you',
        });
      }

      // Enforce state machine transition: must be 'Assigned'
      if (pickup.status !== 'Assigned') {
        return res.status(400).json({
          success: false,
          message: `Cannot mark as collected. Current status is "${pickup.status}". Must be "Assigned".`,
        });
      }

      pickup.status = 'Collected';
      pickup.collectionDetails = {
        collectedWeight: parseFloat(collectedWeight),
        collectionNotes: collectionNotes || '',
        collectedAt: new Date(),
      };

      await pickup.save();

      await ActivityLog.log({
        user: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'PICKUP_COLLECTED',
        targetEntity: 'Pickup',
        targetId: pickup._id,
        description: `Collector ${req.user.name} collected ${pickup.collectionDetails.collectedWeight} kg of ${pickup.wasteCategory}`,
      });

      res.json({
        success: true,
        message: 'Collection recorded successfully! You can now proceed to deliver to the designated recycling center.',
        pickup,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/collector/pickups/:id/deliver
 * @desc    Record delivery at the recycling center (Collected -> Delivered)
 * @access  Private (Collector)
 */
router.post(
  '/pickups/:id/deliver',
  recordDeliveryValidation,
  async (req, res, next) => {
    try {
      const { deliveryNotes } = req.body;

      const pickup = await Pickup.findOne({
        _id: req.params.id,
        collector: req.user._id,
      }).populate('recyclingCenter', 'name');

      if (!pickup) {
        return res.status(404).json({
          success: false,
          message: 'Pickup not found or not assigned to you',
        });
      }

      // Enforce state machine transition: must be 'Collected'
      if (pickup.status !== 'Collected') {
        return res.status(400).json({
          success: false,
          message: `Cannot mark as delivered. Current status is "${pickup.status}". Must be "Collected".`,
        });
      }

      pickup.status = 'Delivered';
      pickup.deliveryDetails = {
        deliveryNotes: deliveryNotes || '',
        deliveredAt: new Date(),
      };

      await pickup.save();

      await ActivityLog.log({
        user: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'PICKUP_DELIVERED',
        targetEntity: 'Pickup',
        targetId: pickup._id,
        description: `Collector delivered waste to ${pickup.recyclingCenter ? pickup.recyclingCenter.name : 'Recycling Center'}`,
      });

      res.json({
        success: true,
        message: 'Delivery recorded! The recycling center will now inspect and confirm the material receipt.',
        pickup,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/collector/history
 * @desc    View completed collection history
 * @access  Private (Collector)
 */
router.get('/history', async (req, res, next) => {
  try {
    const history = await Pickup.find({
      collector: req.user._id,
      status: { $in: ['Delivered', 'Completed'] },
    })
      .populate('citizen', 'name')
      .populate('recyclingCenter', 'name')
      .sort({ updatedAt: -1 });

    const totalWeight = history.reduce((sum, p) => {
      return sum + (p.collectionDetails?.collectedWeight || 0);
    }, 0);

    res.json({
      success: true,
      count: history.length,
      totalWeightKg: totalWeight,
      history,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/collector/status
 * @desc    Update duty status (On Duty / Off Duty)
 * @access  Private (Collector)
 */
router.put('/status', async (req, res, next) => {
  try {
    const { isOnDuty, vehicleType, vehicleNumber } = req.body;
    const user = await User.findById(req.user._id);

    if (isOnDuty !== undefined) {
      user.collectorInfo.isOnDuty = Boolean(isOnDuty);
    }
    if (vehicleType !== undefined) {
      user.collectorInfo.vehicleType = vehicleType;
    }
    if (vehicleNumber !== undefined) {
      user.collectorInfo.vehicleNumber = vehicleNumber;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Duty status updated successfully',
      collectorInfo: user.collectorInfo,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
