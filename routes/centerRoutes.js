/**
 * Recycling Center Routes
 * Handles incoming deliveries, receipt verification, material intake, and recycling records
 */

const express = require('express');
const router = express.Router();
const Pickup = require('../models/Pickup');
const RecyclingCenter = require('../models/RecyclingCenter');
const RecyclingRecord = require('../models/RecyclingRecord');
const ActivityLog = require('../models/ActivityLog');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { recordRecyclingValidation } = require('../middleware/validation');

// All routes require an active 'center' role
router.use(isAuthenticated, hasRole('center'));

// Helper middleware to resolve the RecyclingCenter associated with the authenticated user
const resolveCenter = async (req, res, next) => {
  try {
    let center = null;
    if (req.user.centerRef) {
      center = await RecyclingCenter.findById(req.user.centerRef);
    }
    if (!center) {
      center = await RecyclingCenter.findOne({ managerUser: req.user._id });
    }

    if (!center) {
      return res.status(404).json({
        success: false,
        message: 'No recycling center facility is linked to your user account. Please contact an administrator.',
      });
    }

    req.center = center;
    next();
  } catch (error) {
    next(error);
  }
};

router.use(resolveCenter);

/**
 * @route   GET /api/center/info
 * @desc    Get facility details for current recycling center
 * @access  Private (Recycling Center)
 */
router.get('/info', async (req, res) => {
  res.json({
    success: true,
    center: req.center,
  });
});

/**
 * @route   PUT /api/center/info
 * @desc    Update permitted facility details
 * @access  Private (Recycling Center)
 */
router.put('/info', async (req, res, next) => {
  try {
    const { contactPhone, operatingHours, dailyCapacityKg } = req.body;
    const center = req.center;

    if (contactPhone) center.contactPhone = contactPhone;
    if (operatingHours) center.operatingHours = operatingHours;
    if (dailyCapacityKg !== undefined) {
      center.dailyCapacityKg = parseFloat(dailyCapacityKg);
    }

    await center.save();

    res.json({
      success: true,
      message: 'Facility information updated successfully',
      center,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/center/deliveries
 * @desc    View deliveries assigned or delivered to this recycling center
 * @access  Private (Recycling Center)
 */
router.get('/deliveries', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { recyclingCenter: req.center._id };

    if (status && status !== 'All') {
      if (status === 'InTransit') {
        query.status = { $in: ['Assigned', 'Collected'] };
      } else {
        query.status = status;
      }
    } else {
      // By default show Delivered, Completed, and in-transit deliveries
      query.status = { $in: ['Delivered', 'Completed', 'Assigned', 'Collected'] };
    }

    const deliveries = await Pickup.find(query)
      .populate('citizen', 'name phone email address')
      .populate('collector', 'name phone collectorInfo')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: deliveries.length,
      deliveries,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/center/deliveries/:id
 * @desc    Get single delivery details
 * @access  Private (Recycling Center)
 */
router.get('/deliveries/:id', async (req, res, next) => {
  try {
    const pickup = await Pickup.findOne({
      _id: req.params.id,
      recyclingCenter: req.center._id,
    })
      .populate('citizen', 'name phone email address')
      .populate('collector', 'name phone collectorInfo');

    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found or not assigned to your center facility',
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
 * @route   POST /api/center/deliveries/:id/confirm
 * @desc    Confirm delivery receipt, record received/rejected materials, and mark Completed
 * @access  Private (Recycling Center)
 */
router.post(
  '/deliveries/:id/confirm',
  recordRecyclingValidation,
  async (req, res, next) => {
    try {
      const {
        receivedWeight,
        rejectedWeight,
        rejectionReason,
        processingOutcome,
        processingNotes,
      } = req.body;

      const pickup = await Pickup.findOne({
        _id: req.params.id,
        recyclingCenter: req.center._id,
      });

      if (!pickup) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found or belongs to another recycling facility',
        });
      }

      // Enforce status rule: must be in 'Delivered' status
      if (pickup.status !== 'Delivered') {
        return res.status(400).json({
          success: false,
          message: `Cannot confirm receipt. Delivery is currently in status "${pickup.status}". It must be "Delivered" by the collector first.`,
        });
      }

      const parsedReceived = parseFloat(receivedWeight);
      const parsedRejected = parseFloat(rejectedWeight || 0);

      if (parsedRejected > parsedReceived) {
        return res.status(422).json({
          success: false,
          message: 'Rejected weight cannot exceed total received weight.',
        });
      }

      // Mark pickup as Completed
      pickup.status = 'Completed';
      pickup.recyclingDetails = {
        receivedWeight: parsedReceived,
        rejectedWeight: parsedRejected,
        rejectionReason: rejectionReason || '',
        processingOutcome,
        processingNotes: processingNotes || '',
        verifiedBy: req.user._id,
        completedAt: new Date(),
      };

      await pickup.save();

      // Create permanent facility material record
      const recyclingRecord = await RecyclingRecord.create({
        pickup: pickup._id,
        recyclingCenter: req.center._id,
        materialCategories: [pickup.wasteCategory],
        receivedWeight: parsedReceived,
        rejectedWeight: parsedRejected,
        netRecycledWeight: Math.max(0, parsedReceived - parsedRejected),
        processingOutcome,
        notes: processingNotes || '',
        recordedBy: req.user._id,
      });

      await ActivityLog.log({
        user: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'PICKUP_COMPLETED',
        targetEntity: 'Pickup',
        targetId: pickup._id,
        description: `Recycling Center confirmed ${parsedReceived} kg received (${parsedRejected} kg rejected). Outcome: ${processingOutcome}`,
        metadata: {
          recordId: recyclingRecord._id,
          centerName: req.center.name,
        },
      });

      res.json({
        success: true,
        message: 'Material receipt verified and pickup successfully completed!',
        pickup,
        record: recyclingRecord,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/center/records
 * @desc    View facility recycling and material processing history
 * @access  Private (Recycling Center)
 */
router.get('/records', async (req, res, next) => {
  try {
    const records = await RecyclingRecord.find({
      recyclingCenter: req.center._id,
    })
      .populate('pickup', 'wasteCategory estimatedQuantity address')
      .populate('recordedBy', 'name')
      .sort({ createdAt: -1 });

    const totalReceived = records.reduce((s, r) => s + (r.receivedWeight || 0), 0);
    const totalRejected = records.reduce((s, r) => s + (r.rejectedWeight || 0), 0);
    const totalNetRecycled = records.reduce((s, r) => s + (r.netRecycledWeight || 0), 0);

    res.json({
      success: true,
      count: records.length,
      totals: {
        totalReceivedKg: totalReceived,
        totalRejectedKg: totalRejected,
        totalNetRecycledKg: totalNetRecycled,
      },
      records,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
