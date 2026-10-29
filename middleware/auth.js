/**
 * Authentication and Authorization Middleware
 * Enforces session verification, role-based access control, and active account status
 */

const User = require('../models/User');

// Verify that the user has an active session
const isAuthenticated = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      // Invalidate orphaned session
      req.session.destroy();
      return res.status(401).json({
        success: false,
        message: 'User account not found. Please log in again.',
      });
    }

    if (user.accountStatus === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    if (user.accountStatus === 'pending_approval') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending administrator approval.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]', error.message);
    res.status(500).json({
      success: false,
      message: 'Authentication check failed due to server error',
    });
  }
};

// Enforce specific role(s)
const hasRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

module.exports = {
  isAuthenticated,
  hasRole,
};
