/**
 * User Profile & Account Settings Routes
 * Allows users to view/edit their profile and change their password
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { isAuthenticated } = require('../middleware/auth');
const {
  profileUpdateValidation,
  changePasswordValidation,
} = require('../middleware/validation');

/**
 * @route   GET /api/users/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', isAuthenticated, async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update permitted profile fields
 * @access  Private
 */
router.put(
  '/profile',
  isAuthenticated,
  profileUpdateValidation,
  async (req, res, next) => {
    try {
      const { name, phone, street, city, state, postalCode, landmark } = req.body;
      const user = await User.findById(req.user._id);

      if (name) user.name = name;
      if (phone) user.phone = phone;

      user.address = {
        street: street !== undefined ? street : user.address.street,
        city: city !== undefined ? city : user.address.city,
        state: state !== undefined ? state : user.address.state,
        postalCode: postalCode !== undefined ? postalCode : user.address.postalCode,
        landmark: landmark !== undefined ? landmark : user.address.landmark,
      };

      await user.save();

      await ActivityLog.log({
        user: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'PROFILE_UPDATED',
        targetEntity: 'User',
        targetId: user._id,
        description: `User updated profile information`,
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: user.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/users/change-password
 * @desc    Update password securely
 * @access  Private
 */
router.put(
  '/change-password',
  isAuthenticated,
  changePasswordValidation,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user._id).select('+password');
      const isMatch = await user.matchPassword(currentPassword);

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password does not match.',
        });
      }

      user.password = newPassword;
      await user.save();

      await ActivityLog.log({
        user: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'PASSWORD_CHANGED',
        targetEntity: 'User',
        targetId: user._id,
        description: `User changed account password`,
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
