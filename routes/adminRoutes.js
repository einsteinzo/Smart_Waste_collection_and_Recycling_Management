/**
 * Administrator Routes
 * Full administrative control: user management, center oversight, collector assignment, audit logs
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const RecyclingCenter = require('../models/RecyclingCenter');
const RecyclingRecord = require('../models/RecyclingRecord');
const ActivityLog = require('../models/ActivityLog');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const {
  assignPickupValidation,
  centerValidation,
} = require('../middleware/validation');

// Enforce admin privileges for all endpoints in this file
router.use(isAuthenticated, hasRole('admin'));

/**
 * @route   GET /api/admin/users
 * @desc    Get user accounts with search and filtering
 * @access  Private (Admin)
 */
router.get('/users', async (req, res, next) => {
  try {
    const { role, status, search } = req.query;
    const query = {};

    if (role && role !== 'All') {
      query.role = role;
    }
    if (status && status !== 'All') {
      query.accountStatus = status;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .populate('centerRef', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/users
 * @desc    Create a new user (Collector, Center Manager, or Admin)
 * @access  Private (Admin)
 */
router.post('/users', async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      role,
      accountStatus,
      vehicleType,
      vehicleNumber,
      centerId,
      street,
      city,
      state,
      postalCode,
    } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(422).json({
        success: false,
        message: 'Name, email, phone, password, and role are required fields.',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email address already exists.',
      });
    }

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role,
      accountStatus: accountStatus || 'active',
      address: {
        street: street || '',
        city: city || '',
        state: state || '',
        postalCode: postalCode || '',
      },
      collectorInfo: {
        vehicleType: vehicleType || '',
        vehicleNumber: vehicleNumber || '',
        isOnDuty: true,
      },
      centerRef: centerId || null,
    });

    await newUser.save();

    // If a center is linked, also update the center's managerUser reference
    if (role === 'center' && centerId) {
      await RecyclingCenter.findByIdAndUpdate(centerId, { managerUser: newUser._id });
    }

    await ActivityLog.log({
      user: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'ADMIN_CREATED_USER',
      targetEntity: 'User',
      targetId: newUser._id,
      description: `Admin created user account for ${newUser.name} with role "${newUser.role}"`,
    });

    res.status(201).json({
      success: true,
      message: `User ${newUser.name} created successfully!`,
      user: newUser.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/admin/users/:id/status
 * @desc    Update user account status (active, pending_approval, inactive)
 * @access  Private (Admin)
 */
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'pending_approval', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, pending_approval, or inactive.',
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent admin from deactivating their own account
    if (user._id.equals(req.user._id) && status === 'inactive') {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own administrative account.',
      });
    }

    const oldStatus = user.accountStatus;
    user.accountStatus = status;
    await user.save();

    await ActivityLog.log({
      user: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'USER_STATUS_UPDATED',
      targetEntity: 'User',
      targetId: user._id,
      description: `User ${user.name} status changed from "${oldStatus}" to "${status}"`,
    });

    res.json({
      success: true,
      message: `Account status updated to "${status}"`,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/collectors
 * @desc    Get active, eligible collectors for pickup assignment
 * @access  Private (Admin)
 */
router.get('/collectors', async (req, res, next) => {
  try {
    const collectors = await User.find({
      role: 'collector',
      accountStatus: 'active',
    }).select('name phone email collectorInfo');

    res.json({
      success: true,
      count: collectors.length,
      collectors,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/centers
 * @desc    Get all registered recycling centers
 * @access  Private (Admin)
 */
router.get('/centers', async (req, res, next) => {
  try {
    const centers = await RecyclingCenter.find()
      .populate('managerUser', 'name email phone')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: centers.length,
      centers,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/centers
 * @desc    Create a new recycling center facility
 * @access  Private (Admin)
 */
router.post('/centers', centerValidation, async (req, res, next) => {
  try {
    const {
      name,
      street,
      city,
      state,
      postalCode,
      contactPhone,
      contactEmail,
      acceptedCategories,
      dailyCapacityKg,
      operatingHours,
      managerUserId,
    } = req.body;

    const existingCenter = await RecyclingCenter.findOne({ name });
    if (existingCenter) {
      return res.status(409).json({
        success: false,
        message: 'A recycling center with this name already exists.',
      });
    }

    const center = await RecyclingCenter.create({
      name,
      address: { street, city, state, postalCode },
      contactPhone,
      contactEmail,
      acceptedCategories,
      dailyCapacityKg: dailyCapacityKg || 5000,
      operatingHours: operatingHours || '08:00 AM - 06:00 PM (Mon-Sat)',
      managerUser: managerUserId || null,
      isActive: true,
    });

    if (managerUserId) {
      await User.findByIdAndUpdate(managerUserId, { centerRef: center._id });
    }

    await ActivityLog.log({
      user: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CENTER_CREATED',
      targetEntity: 'RecyclingCenter',
      targetId: center._id,
      description: `Admin created recycling facility "${center.name}"`,
    });

    res.status(201).json({
      success: true,
      message: 'Recycling center created successfully!',
      center,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/centers/:id
 * @desc    Update recycling center facility information
 * @access  Private (Admin)
 */
router.put('/centers/:id', centerValidation, async (req, res, next) => {
  try {
    const center = await RecyclingCenter.findById(req.params.id);
    if (!center) {
      return res.status(404).json({
        success: false,
        message: 'Recycling center not found',
      });
    }

    const {
      name,
      street,
      city,
      state,
      postalCode,
      contactPhone,
      contactEmail,
      acceptedCategories,
      dailyCapacityKg,
      operatingHours,
      isActive,
      managerUserId,
    } = req.body;

    center.name = name;
    center.address = { street, city, state, postalCode };
    center.contactPhone = contactPhone;
    center.contactEmail = contactEmail;
    center.acceptedCategories = acceptedCategories;
    if (dailyCapacityKg !== undefined) center.dailyCapacityKg = dailyCapacityKg;
    if (operatingHours) center.operatingHours = operatingHours;
    if (isActive !== undefined) center.isActive = isActive;
    if (managerUserId) center.managerUser = managerUserId;

    await center.save();

    res.json({
      success: true,
      message: 'Recycling center updated successfully',
      center,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/pickups
 * @desc    List all system pickup requests with advanced filters
 * @access  Private (Admin)
 */
router.get('/pickups', async (req, res, next) => {
  try {
    const { status, category, collectorId, centerId, search } = req.query;
    const query = {};

    if (status && status !== 'All') query.status = status;
    if (category && category !== 'All') query.wasteCategory = category;
    if (collectorId && collectorId !== 'All') query.collector = collectorId;
    if (centerId && centerId !== 'All') query.recyclingCenter = centerId;

    let pickups = await Pickup.find(query)
      .populate('citizen', 'name email phone address')
      .populate('collector', 'name phone collectorInfo')
      .populate('recyclingCenter', 'name address contactPhone')
      .sort({ createdAt: -1 });

    if (search) {
      const s = search.toLowerCase();
      pickups = pickups.filter((p) => {
        return (
          p.citizen?.name?.toLowerCase().includes(s) ||
          p.address?.city?.toLowerCase().includes(s) ||
          p.wasteCategory?.toLowerCase().includes(s) ||
          p._id.toString().includes(s)
        );
      });
    }

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
 * @route   POST /api/admin/pickups/:id/assign
 * @desc    Assign an active collector and recycling center to a pickup
 * @access  Private (Admin)
 */
router.post(
  '/pickups/:id/assign',
  assignPickupValidation,
  async (req, res, next) => {
    try {
      const { collectorId, recyclingCenterId } = req.body;

      const pickup = await Pickup.findById(req.params.id);
      if (!pickup) {
        return res.status(404).json({
          success: false,
          message: 'Pickup request not found',
        });
      }

      // Can only assign if status is 'Requested' or reassign if 'Assigned'
      if (pickup.status !== 'Requested' && pickup.status !== 'Assigned') {
        return res.status(400).json({
          success: false,
          message: `Cannot assign collector. Pickup has already progressed to status "${pickup.status}".`,
        });
      }

      // Verify collector is valid, active, and approved
      const collector = await User.findOne({
        _id: collectorId,
        role: 'collector',
        accountStatus: 'active',
      });
      if (!collector) {
        return res.status(400).json({
          success: false,
          message: 'Selected collector is invalid, inactive, or not approved.',
        });
      }

      // Verify recycling center is valid and active
      const center = await RecyclingCenter.findOne({
        _id: recyclingCenterId,
        isActive: true,
      });
      if (!center) {
        return res.status(400).json({
          success: false,
          message: 'Selected recycling center is invalid or inactive.',
        });
      }

      pickup.collector = collector._id;
      pickup.recyclingCenter = center._id;
      pickup.status = 'Assigned';
      await pickup.save();

      await ActivityLog.log({
        user: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'PICKUP_ASSIGNED',
        targetEntity: 'Pickup',
        targetId: pickup._id,
        description: `Admin assigned Collector "${collector.name}" and Center "${center.name}" to Pickup #${pickup._id.toString().slice(-6)}`,
      });

      const updatedPickup = await Pickup.findById(pickup._id)
        .populate('citizen', 'name phone')
        .populate('collector', 'name phone')
        .populate('recyclingCenter', 'name address');

      res.json({
        success: true,
        message: `Collector ${collector.name} and Recycling Center ${center.name} successfully assigned!`,
        pickup: updatedPickup,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/admin/records
 * @desc    View all completed recycling records
 * @access  Private (Admin)
 */
router.get('/records', async (req, res, next) => {
  try {
    const records = await RecyclingRecord.find()
      .populate('pickup')
      .populate('recyclingCenter', 'name address')
      .populate('recordedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: records.length,
      records,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/activity-logs
 * @desc    View audit trail and activity history
 * @access  Private (Admin)
 */
router.get('/activity-logs', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const logs = await ActivityLog.find()
      .populate('user', 'name role email')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
