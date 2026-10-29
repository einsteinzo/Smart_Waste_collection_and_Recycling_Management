/**
 * Pickup Request Routes
 * Handles Citizen request submission, request list, status inspection, and cancellation
 */

const express = require('express');
const router = express.Router();
const Pickup = require('../models/Pickup');
const ActivityLog = require('../models/ActivityLog');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { createPickupValidation } = require('../middleware/validation');

/**
 * @route   POST /api/pickups
 * @desc    Submit a new waste pickup request (Citizen only)
 * @access  Private (Citizen)
 */
router.post(
  '/',
  isAuthenticated,
  hasRole('citizen'),
  createPickupValidation,
  async (req, res, next) => {
    try {
      const {
        wasteCategory,
        description,
        estimatedQuantity,
        estimatedUnit,
        street,
        city,
        state,
        postalCode,
        landmark,
        preferredDate,
        preferredTimeSlot,
        additionalInstructions,
      } = req.body;

      const newPickup = await Pickup.create({
        citizen: req.user._id,
        wasteCategory,
        description: description || '',
        estimatedQuantity: parseFloat(estimatedQuantity),
        estimatedUnit: estimatedUnit || 'kg',
        address: {
          street,
          city,
          state,
          postalCode,
          landmark: landmark || '',
        },
        preferredDate: new Date(preferredDate),
        preferredTimeSlot: preferredTimeSlot || 'Morning (8am - 12pm)',
        additionalInstructions: additionalInstructions || '',
        status: 'Requested',
      });

      await ActivityLog.log({
        user: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'PICKUP_REQUESTED',
        targetEntity: 'Pickup',
        targetId: newPickup._id,
        description: `Citizen requested pickup of ${newPickup.estimatedQuantity} ${newPickup.estimatedUnit} of ${newPickup.wasteCategory}`,
      });

      res.status(201).json({
        success: true,
        message: 'Pickup request submitted successfully! An administrator will assign a collector shortly.',
        pickup: newPickup,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/pickups
 * @desc    Get all pickup requests for the logged-in citizen
 * @access  Private (Citizen)
 */
router.get('/', isAuthenticated, hasRole('citizen'), async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const query = { citizen: req.user._id };

    if (status && status !== 'All') {
      query.status = status;
    }
    if (category && category !== 'All') {
      query.wasteCategory = category;
    }

    const pickups = await Pickup.find(query)
      .populate('collector', 'name phone collectorInfo')
      .populate('recyclingCenter', 'name address contactPhone')
      .sort({ createdAt: -1 });

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
 * @route   GET /api/pickups/:id
 * @desc    Get detailed information about a single pickup request
 * @access  Private (Owner Citizen, Assigned Collector, Assigned Center, Admin)
 */
router.get('/:id', isAuthenticated, async (req, res, next) => {
  try {
    const pickup = await Pickup.findById(req.params.id)
      .populate('citizen', 'name email phone address')
      .populate('collector', 'name phone collectorInfo')
      .populate('recyclingCenter', 'name address contactPhone contactEmail acceptedCategories')
      .populate('cancellation.cancelledBy', 'name role');

    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: 'Pickup request not found',
      });
    }

    // Role-based Access Control
    const isOwner = pickup.citizen && pickup.citizen._id.equals(req.user._id);
    const isAssignedCollector = pickup.collector && pickup.collector._id.equals(req.user._id);
    const isAssignedCenter =
      req.user.role === 'center' &&
      pickup.recyclingCenter &&
      req.user.centerRef &&
      pickup.recyclingCenter._id.equals(req.user.centerRef);
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAssignedCollector && !isAssignedCenter && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this pickup record.',
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
 * @route   POST /api/pickups/:id/cancel
 * @desc    Cancel an eligible pickup request before collection
 * @access  Private (Owner Citizen or Admin)
 */
router.post('/:id/cancel', isAuthenticated, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const pickup = await Pickup.findById(req.params.id);

    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: 'Pickup request not found',
      });
    }

    // Verify ownership or admin privileges
    const isOwner = pickup.citizen.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You cannot cancel this request.',
      });
    }

    // Business rule: Can only cancel if status is 'Requested' or 'Assigned'
    if (pickup.status !== 'Requested' && pickup.status !== 'Assigned') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel pickup with status "${pickup.status}". Only 'Requested' or 'Assigned' pickups can be cancelled before collection.`,
      });
    }

    pickup.status = 'Cancelled';
    pickup.cancellation = {
      cancelledAt: new Date(),
      cancelledBy: req.user._id,
      reason: reason || (isOwner ? 'Cancelled by citizen' : 'Cancelled by administrator'),
    };

    await pickup.save();

    await ActivityLog.log({
      user: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'PICKUP_CANCELLED',
      targetEntity: 'Pickup',
      targetId: pickup._id,
      description: `Pickup #${pickup._id.toString().slice(-6)} was cancelled. Reason: ${pickup.cancellation.reason}`,
    });

    res.json({
      success: true,
      message: 'Pickup request has been cancelled.',
      pickup,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
