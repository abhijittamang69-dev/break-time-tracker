const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('username').notEmpty().trim().toLowerCase(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    console.log('[LOGIN] Attempting login for username:', username);

    const user = await User.findOne({ username });
    if (!user) {
      console.log('[LOGIN] User not found:', username);
      return res.status(400).json({ message: 'Invalid credentials - user not found' });
    }

    console.log('[LOGIN] User found:', user.username, '| isActive:', user.isActive);

    if (!user.isActive) {
      return res.status(400).json({ message: 'Account is deactivated' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('[LOGIN] Password match:', isMatch);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials - wrong password' });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        employeeId: user.employeeId,
        name: user.name,
        username: user.username,
        designation: user.designation,
        shift: user.shift
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        employeeId: req.user.employeeId,
        name: req.user.name,
        email: req.user.email,
        designation: req.user.designation,
        shift: req.user.shift,
        maxBreakTime: req.user.maxBreakTime,
        maxBreaksPerShift: req.user.maxBreaksPerShift
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Debug endpoint - check if users exist in DB
router.get('/debug', async (req, res) => {
  try {
    const count = await User.countDocuments();
    const users = await User.find({}, 'username name designation isActive');
    res.json({
      totalUsers: count,
      users: users
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
