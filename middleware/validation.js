/**
 * Input Validation Middleware
 * Uses express-validator to enforce server-side constraints and data sanitization
 */

const { body, validationResult } = require('express-validator');

// Helper to format validation errors into a clean, uniform JSON response
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));

    return res.status(422).json({
      success: false,
      message: 'Validation failed: ' + formattedErrors[0].message,
      errors: formattedErrors,
    });
  }
  next();
};

// 1. Citizen Registration Validation
const registerValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email address is required')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^[0-9+\-\s()]{10,15}$/)
    .withMessage('Please enter a valid 10 to 15 digit phone number'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  body('street').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('postalCode').optional().trim(),
  handleValidationErrors,
];

// 2. Login Validation
const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email address is required')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

// 3. Profile Update Validation
const profileUpdateValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('phone')
    .optional()
    .trim()
    .matches(/^[0-9+\-\s()]{10,15}$/)
    .withMessage('Please enter a valid 10 to 15 digit phone number'),
  body('street').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('postalCode').optional().trim(),
  handleValidationErrors,
];

// 4. Password Change Validation
const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
  body('confirmNewPassword')
    .notEmpty()
    .withMessage('Please confirm your new password')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('New passwords do not match');
      }
      return true;
    }),
  handleValidationErrors,
];

// 5. Pickup Request Creation Validation
const createPickupValidation = [
  body('wasteCategory')
    .trim()
    .notEmpty()
    .withMessage('Waste category is required')
    .isIn([
      'Organic waste',
      'Plastic',
      'Paper and cardboard',
      'Glass',
      'Metal',
      'Electronic waste',
      'Mixed or other waste',
    ])
    .withMessage('Invalid waste category selected'),
  body('estimatedQuantity')
    .notEmpty()
    .withMessage('Estimated quantity is required')
    .isFloat({ min: 0.1, max: 10000 })
    .withMessage('Quantity must be a positive number up to 10,000'),
  body('estimatedUnit')
    .optional()
    .isIn(['kg', 'bags', 'items', 'liters', 'cubic_meters'])
    .withMessage('Invalid unit of measurement'),
  body('street').trim().notEmpty().withMessage('Street address is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('postalCode').trim().notEmpty().withMessage('Postal code is required'),
  body('preferredDate')
    .notEmpty()
    .withMessage('Preferred pickup date is required')
    .isISO8601()
    .withMessage('Preferred date must be a valid date format')
    .custom((value) => {
      const selected = new Date(value);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (selected < yesterday) {
        throw new Error('Preferred date cannot be in the past');
      }
      return true;
    }),
  body('preferredTimeSlot')
    .optional()
    .isIn([
      'Morning (8am - 12pm)',
      'Afternoon (12pm - 4pm)',
      'Evening (4pm - 8pm)',
    ])
    .withMessage('Invalid time slot selected'),
  body('description').optional().trim().isLength({ max: 500 }),
  body('additionalInstructions').optional().trim().isLength({ max: 500 }),
  handleValidationErrors,
];

// 6. Admin Assignment Validation
const assignPickupValidation = [
  body('collectorId').trim().notEmpty().withMessage('Collector ID is required'),
  body('recyclingCenterId').trim().notEmpty().withMessage('Recycling center ID is required'),
  handleValidationErrors,
];

// 7. Collector Collection Update Validation
const recordCollectionValidation = [
  body('collectedWeight')
    .notEmpty()
    .withMessage('Actual collected weight is required')
    .isFloat({ min: 0.1, max: 20000 })
    .withMessage('Collected weight must be a positive number in kilograms'),
  body('collectionNotes').optional().trim().isLength({ max: 500 }),
  handleValidationErrors,
];

// 8. Collector Delivery Update Validation
const recordDeliveryValidation = [
  body('deliveryNotes').optional().trim().isLength({ max: 500 }),
  handleValidationErrors,
];

// 9. Recycling Receipt and Processing Validation
const recordRecyclingValidation = [
  body('receivedWeight')
    .notEmpty()
    .withMessage('Actual received weight is required')
    .isFloat({ min: 0.1, max: 20000 })
    .withMessage('Received weight must be a positive number in kilograms'),
  body('rejectedWeight')
    .optional()
    .isFloat({ min: 0, max: 20000 })
    .withMessage('Rejected weight cannot be negative'),
  body('processingOutcome')
    .trim()
    .notEmpty()
    .withMessage('Processing outcome is required')
    .isIn([
      'Recycled',
      'Composted',
      'Refurbished / Reused',
      'Safely Disposed / Waste-to-Energy',
    ])
    .withMessage('Invalid processing outcome selected'),
  body('processingNotes').optional().trim().isLength({ max: 500 }),
  handleValidationErrors,
];

// 10. Recycling Center Validation
const centerValidation = [
  body('name').trim().notEmpty().withMessage('Center name is required'),
  body('street').trim().notEmpty().withMessage('Street address is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('postalCode').trim().notEmpty().withMessage('Postal code is required'),
  body('contactPhone').trim().notEmpty().withMessage('Contact phone is required'),
  body('contactEmail').trim().isEmail().withMessage('Valid contact email is required'),
  body('acceptedCategories')
    .isArray({ min: 1 })
    .withMessage('At least one accepted waste category must be selected'),
  handleValidationErrors,
];

module.exports = {
  registerValidation,
  loginValidation,
  profileUpdateValidation,
  changePasswordValidation,
  createPickupValidation,
  assignPickupValidation,
  recordCollectionValidation,
  recordDeliveryValidation,
  recordRecyclingValidation,
  centerValidation,
};
