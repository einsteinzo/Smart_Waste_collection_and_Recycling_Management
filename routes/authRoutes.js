/**
 * Authentication Routes
 * Handles Citizen registration, multi-role login, logout, and session check
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { isAuthenticated } = require('../middleware/auth');
const { registerValidation, loginValidation } = require('../middleware/validation');

// Rate limiting for auth endpoints (prevents brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 30 : 1000, // Developer-friendly limit in dev/test
  message: {
    success: false,
    message: 'Too many login/registration attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   GET /api/auth/csrf-token
 * @desc    Get anti-CSRF token for current session
 * @access  Public
 */
router.get('/csrf-token', (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = require('crypto').randomBytes(24).toString('hex');
  }
  req.session.save(() => {
    res.json({
      success: true,
      csrfToken: req.session.csrfToken,
    });
  });
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new Citizen
 * @access  Public
 */
router.post('/register', authLimiter, registerValidation, async (req, res, next) => {
  try {
    const { name, email, phone, password, street, city, state, postalCode } = req.body;

    // Check if email already registered
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.',
      });
    }

    // Citizens are registered with role 'citizen' and status 'active'
    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role: 'citizen',
      accountStatus: 'active',
      address: {
        street: street || '',
        city: city || '',
        state: state || '',
        postalCode: postalCode || '',
      },
    });

    // Auto-login after registration
    req.session.userId = newUser._id;
    req.session.userRole = newUser.role;

    // Log registration
    await ActivityLog.log({
      user: newUser._id,
      userName: newUser.name,
      userRole: newUser.role,
      action: 'USER_REGISTER',
      targetEntity: 'User',
      targetId: newUser._id,
      description: `Citizen registered: ${newUser.name} (${newUser.email})`,
    });

    req.session.save((err) => {
      if (err) {
        return next(err);
      }
      res.status(201).json({
        success: true,
        message: 'Registration successful! Welcome to WasteWise.',
        user: newUser,
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user (Citizen, Collector, Recycling Center, Admin)
 * @access  Public
 */
router.post('/login', authLimiter, loginValidation, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Explicitly select password field to verify
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check account status
    if (user.accountStatus === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    if (user.accountStatus === 'pending_approval') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending administrator approval. Please wait for activation.',
      });
    }

    // Set user session
    req.session.userId = user._id;
    req.session.userRole = user.role;

    // Log login activity
    await ActivityLog.log({
      user: user._id,
      userName: user.name,
      userRole: user.role,
      action: 'USER_LOGIN',
      targetEntity: 'Auth',
      description: `User logged in: ${user.name} [Role: ${user.role}]`,
    });

    req.session.save((err) => {
      if (err) {
        return next(err);
      }
      res.json({
        success: true,
        message: `Login successful. Welcome back, ${user.name}!`,
        user: user.toJSON(),
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST|GET /api/auth/logout
 * @desc    Terminate session and log out user
 * @access  Public / Private
 */
const handleLogoutRequest = (req, res) => {
  const finalizeLogout = () => {
    res.clearCookie('connect.sid', { path: '/' });
    if (
      req.method === 'GET' &&
      req.accepts('html') &&
      !req.xhr &&
      !req.headers['x-requested-with']
    ) {
      return res.redirect('/login.html?logged_out=1');
    }
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  };

  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('[Logout] Session destroy warning:', err.message);
      }
      finalizeLogout();
    });
  } else {
    finalizeLogout();
  }
};

router.post('/logout', handleLogoutRequest);
router.get('/logout', handleLogoutRequest);

/**
 * @route   GET /api/auth/me
 * @desc    Get currently authenticated user details
 * @access  Private
 */
router.get('/me', isAuthenticated, async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

module.exports = router;
