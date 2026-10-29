/**
 * CSRF Protection Middleware
 * Generates and validates cryptographic anti-CSRF tokens for state-changing requests
 */

const crypto = require('crypto');

const csrfProtection = (req, res, next) => {
  // Ensure session exists
  if (!req.session) {
    return next();
  }

  // Initialize token if not set
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }

  // Safe HTTP methods that do not modify state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Exempt logout from CSRF check to ensure session termination is never blocked
  if (req.path === '/logout' || req.originalUrl === '/api/auth/logout' || req.path.endsWith('/logout')) {
    return next();
  }

  // Allow test environments to bypass if desired
  if (process.env.NODE_ENV === 'test' && !req.headers['x-csrf-token']) {
    return next();
  }

  // Check token for state-changing requests
  const clientToken = req.headers['x-csrf-token'] || (req.body && req.body._csrf);

  if (!clientToken || clientToken !== req.session.csrfToken) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or missing CSRF token. Request rejected for security.',
    });
  }

  next();
};

module.exports = csrfProtection;
