/**
 * Dashboard & Analytics Routes
 * Provides database-driven metrics, status charts data, and public statistics
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const RecyclingCenter = require('../models/RecyclingCenter');
const RecyclingRecord = require('../models/RecyclingRecord');
const ActivityLog = require('../models/ActivityLog');
const { isAuthenticated } = require('../middleware/auth');

/**
 * @route   GET /api/dashboard/public-stats
 * @desc    Public overview statistics for home page
 * @access  Public
 */
router.get('/public-stats', async (req, res, next) => {
  try {
    const [
      totalPickups,
      completedPickups,
      totalCitizens,
      partnerCenters,
      activeCollectors,
      recyclingRecords,
    ] = await Promise.all([
      Pickup.countDocuments(),
      Pickup.countDocuments({ status: 'Completed' }),
      User.countDocuments({ role: 'citizen' }),
      RecyclingCenter.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'collector', accountStatus: 'active' }),
      RecyclingRecord.find().select('netRecycledWeight receivedWeight'),
    ]);

    const totalRecycledKg = recyclingRecords.reduce((sum, r) => sum + (r.netRecycledWeight || 0), 0);

    res.json({
      success: true,
      stats: {
        totalPickups,
        completedPickups,
        totalCitizens,
        partnerCenters,
        activeCollectors,
        totalRecycledKg: Math.round(totalRecycledKg),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/dashboard/stats
 * @desc    Role-specific dashboard metrics and charts data
 * @access  Private
 */
router.get('/stats', isAuthenticated, async (req, res, next) => {
  try {
    const role = req.user.role;
    const userId = req.user._id;

    if (role === 'citizen') {
      const citizenPickups = await Pickup.find({ citizen: userId });

      const totalRequests = citizenPickups.length;
      const requested = citizenPickups.filter((p) => p.status === 'Requested').length;
      const assigned = citizenPickups.filter((p) => p.status === 'Assigned').length;
      const collected = citizenPickups.filter((p) => p.status === 'Collected').length;
      const delivered = citizenPickups.filter((p) => p.status === 'Delivered').length;
      const completed = citizenPickups.filter((p) => p.status === 'Completed').length;
      const cancelled = citizenPickups.filter((p) => p.status === 'Cancelled').length;

      const totalRecycledKg = citizenPickups
        .filter((p) => p.status === 'Completed')
        .reduce((sum, p) => sum + (p.recyclingDetails?.receivedWeight || 0), 0);

      const recentPickups = await Pickup.find({ citizen: userId })
        .populate('collector', 'name phone')
        .populate('recyclingCenter', 'name')
        .sort({ createdAt: -1 })
        .limit(5);

      return res.json({
        success: true,
        role: 'citizen',
        metrics: {
          totalRequests,
          pending: requested + assigned,
          inTransit: collected + delivered,
          completed,
          cancelled,
          totalRecycledKg: Math.round(totalRecycledKg * 10) / 10,
        },
        recentPickups,
      });
    }

    if (role === 'collector') {
      const assignedPickups = await Pickup.find({ collector: userId });

      const assignedJobs = assignedPickups.filter((p) => p.status === 'Assigned').length;
      const collectedJobs = assignedPickups.filter((p) => p.status === 'Collected').length;
      const deliveredJobs = assignedPickups.filter((p) => p.status === 'Delivered').length;
      const completedJobs = assignedPickups.filter((p) => p.status === 'Completed').length;

      const totalCollectedKg = assignedPickups.reduce(
        (sum, p) => sum + (p.collectionDetails?.collectedWeight || 0),
        0
      );

      const upcomingPickups = await Pickup.find({
        collector: userId,
        status: { $in: ['Assigned', 'Collected'] },
      })
        .populate('citizen', 'name phone address')
        .populate('recyclingCenter', 'name address')
        .sort({ preferredDate: 1 })
        .limit(5);

      return res.json({
        success: true,
        role: 'collector',
        metrics: {
          assignedJobs,
          collectedJobs,
          deliveredJobs,
          completedJobs,
          totalJobs: assignedPickups.length,
          totalCollectedKg: Math.round(totalCollectedKg * 10) / 10,
        },
        upcomingPickups,
      });
    }

    if (role === 'center') {
      let center = null;
      if (req.user.centerRef) {
        center = await RecyclingCenter.findById(req.user.centerRef);
      }
      if (!center) {
        center = await RecyclingCenter.findOne({ managerUser: userId });
      }

      if (!center) {
        return res.json({
          success: true,
          role: 'center',
          metrics: { incoming: 0, completed: 0, receivedKg: 0, rejectedKg: 0, recycledKg: 0 },
          recentDeliveries: [],
        });
      }

      const deliveries = await Pickup.find({ recyclingCenter: center._id });
      const records = await RecyclingRecord.find({ recyclingCenter: center._id });

      const incoming = deliveries.filter((p) => p.status === 'Delivered').length;
      const completed = deliveries.filter((p) => p.status === 'Completed').length;

      const totalReceivedKg = records.reduce((sum, r) => sum + (r.receivedWeight || 0), 0);
      const totalRejectedKg = records.reduce((sum, r) => sum + (r.rejectedWeight || 0), 0);
      const totalRecycledKg = records.reduce((sum, r) => sum + (r.netRecycledWeight || 0), 0);

      const recentDeliveries = await Pickup.find({
        recyclingCenter: center._id,
        status: { $in: ['Delivered', 'Completed'] },
      })
        .populate('collector', 'name phone')
        .populate('citizen', 'name')
        .sort({ updatedAt: -1 })
        .limit(5);

      return res.json({
        success: true,
        role: 'center',
        centerName: center.name,
        metrics: {
          incoming,
          completed,
          totalDeliveries: deliveries.length,
          totalReceivedKg: Math.round(totalReceivedKg * 10) / 10,
          totalRejectedKg: Math.round(totalRejectedKg * 10) / 10,
          totalRecycledKg: Math.round(totalRecycledKg * 10) / 10,
        },
        recentDeliveries,
      });
    }

    if (role === 'admin') {
      const [
        totalCitizens,
        totalCollectors,
        totalCenters,
        allPickups,
        recyclingRecords,
        recentActivity,
      ] = await Promise.all([
        User.countDocuments({ role: 'citizen' }),
        User.countDocuments({ role: 'collector' }),
        RecyclingCenter.countDocuments(),
        Pickup.find().select('status wasteCategory collectionDetails recyclingDetails createdAt'),
        RecyclingRecord.find().select('receivedWeight rejectedWeight netRecycledWeight processingOutcome materialCategories'),
        ActivityLog.find().sort({ createdAt: -1 }).limit(8),
      ]);

      const statusCounts = {
        Requested: 0,
        Assigned: 0,
        Collected: 0,
        Delivered: 0,
        Completed: 0,
        Cancelled: 0,
      };

      const categoryCounts = {};
      let totalCollectedKg = 0;

      allPickups.forEach((p) => {
        if (statusCounts[p.status] !== undefined) {
          statusCounts[p.status]++;
        }
        categoryCounts[p.wasteCategory] = (categoryCounts[p.wasteCategory] || 0) + 1;
        if (p.collectionDetails?.collectedWeight) {
          totalCollectedKg += p.collectionDetails.collectedWeight;
        }
      });

      const totalRecycledKg = recyclingRecords.reduce((sum, r) => sum + (r.netRecycledWeight || 0), 0);
      const totalRejectedKg = recyclingRecords.reduce((sum, r) => sum + (r.rejectedWeight || 0), 0);

      return res.json({
        success: true,
        role: 'admin',
        metrics: {
          totalUsers: totalCitizens + totalCollectors + totalCenters,
          totalCitizens,
          totalCollectors,
          totalCenters,
          totalPickups: allPickups.length,
          pendingPickups: (statusCounts.Requested || 0) + (statusCounts.Assigned || 0),
          completedPickups: statusCounts.Completed || 0,
          cancelledPickups: statusCounts.Cancelled || 0,
          totalCollectedKg: Math.round(totalCollectedKg * 10) / 10,
          totalRecycledKg: Math.round(totalRecycledKg * 10) / 10,
          totalRejectedKg: Math.round(totalRejectedKg * 10) / 10,
        },
        statusCounts,
        categoryCounts,
        recentActivity,
      });
    }

    res.status(400).json({ success: false, message: 'Invalid role' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
