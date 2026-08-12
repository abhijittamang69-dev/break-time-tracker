const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users
// @access  Admin, Coordinator
router.get('/', auth, authorize('Admin', 'Coordinator'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/operators
// @desc    Get all operators
// @access  Admin, Coordinator, Supervisor, Team Leader
router.get('/operators', auth, authorize('Admin', 'Coordinator', 'Supervisor', 'Team Leader'), async (req, res) => {
  try {
    const operators = await User.find({ designation: 'Operator' }).select('-password');
    res.json(operators);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Admin, Coordinator
router.get('/:id', auth, authorize('Admin', 'Coordinator'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/users
// @desc    Create new user
// @access  Admin
router.post('/', auth, authorize('Admin'), [
  body('employeeId').notEmpty().trim().withMessage('Employee ID is required'),
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('username').notEmpty().trim().toLowerCase().withMessage('Username (email) is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('designation').isIn(['Admin', 'Coordinator', 'Supervisor', 'Team Leader', 'Operator']).withMessage('Invalid designation'),
  body('shift').isIn(['Morning', 'Afternoon', 'Night', 'Rotating']).withMessage('Invalid shift')
], async (req, res) => {
  try {
    console.log('[CREATE USER] Request body:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[CREATE USER] Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeId, name, username, password, designation, shift, department, maxBreakTime, maxBreaksPerShift } = req.body;

    let user = await User.findOne({ $or: [{ username }, { employeeId }] });
    if (user) {
      console.log('[CREATE USER] User already exists:', username, employeeId);
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      employeeId,
      name,
      username,
      password: hashedPassword,
      designation,
      shift,
      department: department || 'RMC',
      maxBreakTime: maxBreakTime || 60,
      maxBreaksPerShift: maxBreaksPerShift || 3
    });

    await user.save();
    console.log('[CREATE USER] Success:', user.username);
    res.status(201).json({ message: 'User created successfully', user: { ...user._doc, password: undefined } });
  } catch (error) {
    console.error('[CREATE USER] Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
  body('employeeId').notEmpty().trim(),
  body('name').notEmpty().trim(),
  body('username').notEmpty().trim().toLowerCase(),
  body('password').isLength({ min: 6 }),
  body('designation').isIn(['Admin', 'Coordinator', 'Supervisor', 'Team Leader', 'Operator']),
  body('shift').isIn(['Morning', 'Afternoon', 'Night', 'Rotating'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeId, name, username, password, designation, shift, department, maxBreakTime, maxBreaksPerShift } = req.body;

    let user = await User.findOne({ $or: [{ username }, { employeeId }] });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      employeeId,
      name,
      username,
      password: hashedPassword,
      designation,
      shift,
      department: department || 'RMC',
      maxBreakTime: maxBreakTime || 60,
      maxBreaksPerShift: maxBreaksPerShift || 3
    });

    await user.save();
    res.status(201).json({ message: 'User created successfully', user: { ...user._doc, password: undefined } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Admin
router.put('/:id', auth, authorize('Admin'), async (req, res) => {
  try {
    const { name, username, designation, shift, isActive, maxBreakTime, maxBreaksPerShift } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, username, designation, shift, isActive, maxBreakTime, maxBreaksPerShift },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (soft delete)
// @access  Admin
router.delete('/:id', auth, authorize('Admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
