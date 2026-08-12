const express = require('express');
const BreakRecord = require('../models/BreakRecord');
const User = require('../models/User');
const QRCode = require('../models/QRCode');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper: Get today's date at midnight
const getToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

// Helper: Calculate duration in minutes
const calculateDuration = (start, end) => {
  const diffMs = end - start;
  return Math.round(diffMs / 60000);
};

// @route   POST /api/breaks/start
// @desc    Start a break
// @access  Private
router.post('/start', auth, async (req, res) => {
  try {
    const { qrCodeId } = req.body;
    const userId = req.user._id;

    // Verify QR code exists and is active
    const qrCode = await QRCode.findOne({ codeId: qrCodeId, isActive: true });
    if (!qrCode) {
      return res.status(400).json({ message: 'Invalid or inactive QR code' });
    }

    // Check if user already has an ongoing break
    const ongoingBreak = await BreakRecord.findOne({
      employee: userId,
      status: 'ongoing',
      date: { $gte: getToday() }
    });

    if (ongoingBreak) {
      return res.status(400).json({ 
        message: 'You already have an ongoing break. Please end it first.',
        ongoingBreak
      });
    }

    // Get today's breaks to determine break number
    const todayBreaks = await BreakRecord.find({
      employee: userId,
      date: { $gte: getToday() }
    }).sort({ breakNumber: -1 });

    const breakNumber = todayBreaks.length > 0 ? todayBreaks[0].breakNumber + 1 : 1;

    // Check max breaks
    if (breakNumber > req.user.maxBreaksPerShift) {
      return res.status(400).json({ 
        message: `Maximum ${req.user.maxBreaksPerShift} breaks allowed per shift` 
      });
    }

    // Calculate total break time used today
    const totalUsedToday = todayBreaks.reduce((sum, b) => sum + (b.duration || 0), 0);

    if (totalUsedToday >= req.user.maxBreakTime) {
      return res.status(400).json({ 
        message: 'You have used all your break time for this shift',
        totalUsed: totalUsedToday,
        maxBreakTime: req.user.maxBreakTime
      });
    }

    const breakRecord = new BreakRecord({
      employee: userId,
      breakNumber,
      startTime: new Date(),
      qrCodeId,
      date: getToday(),
      shift: req.user.shift
    });

    await breakRecord.save();

    // Populate employee info
    await breakRecord.populate('employee', 'name employeeId designation shift');

    res.status(201).json({
      message: 'Break started successfully',
      breakRecord,
      remainingBreakTime: req.user.maxBreakTime - totalUsedToday
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/breaks/end
// @desc    End a break
// @access  Private
router.post('/end', auth, async (req, res) => {
  try {
    const { qrCodeId } = req.body;
    const userId = req.user._id;

    // Find ongoing break
    const ongoingBreak = await BreakRecord.findOne({
      employee: userId,
      status: 'ongoing',
      date: { $gte: getToday() }
    }).populate('employee', 'name employeeId designation shift maxBreakTime');

    if (!ongoingBreak) {
      return res.status(400).json({ message: 'No ongoing break found' });
    }

    // Verify QR code
    const qrCode = await QRCode.findOne({ codeId: qrCodeId, isActive: true });
    if (!qrCode) {
      return res.status(400).json({ message: 'Invalid or inactive QR code' });
    }

    const endTime = new Date();
    const duration = calculateDuration(ongoingBreak.startTime, endTime);

    // Check if exceeded max break time
    const todayBreaks = await BreakRecord.find({
      employee: userId,
      date: { $gte: getToday() },
      status: { $in: ['completed', 'exceeded'] }
    });

    const totalUsedBefore = todayBreaks.reduce((sum, b) => sum + b.duration, 0);
    const totalUsed = totalUsedBefore + duration;

    let status = 'completed';
    if (totalUsed > req.user.maxBreakTime) {
      status = 'exceeded';
    }

    ongoingBreak.endTime = endTime;
    ongoingBreak.duration = duration;
    ongoingBreak.status = status;

    await ongoingBreak.save();

    res.json({
      message: 'Break ended successfully',
      breakRecord: ongoingBreak,
      duration,
      totalUsed,
      remainingBreakTime: Math.max(0, req.user.maxBreakTime - totalUsed),
      exceeded: status === 'exceeded'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/breaks/my-breaks
// @desc    Get current user's break records
// @access  Private
router.get('/my-breaks', auth, async (req, res) => {
  try {
    const today = getToday();
    const breaks = await BreakRecord.find({
      employee: req.user._id,
      date: { $gte: today }
    }).sort({ createdAt: -1 });

    const totalUsed = breaks.reduce((sum, b) => sum + (b.duration || 0), 0);
    const ongoingBreak = breaks.find(b => b.status === 'ongoing');

    res.json({
      breaks,
      totalUsed,
      remaining: Math.max(0, req.user.maxBreakTime - totalUsed),
      ongoingBreak,
      maxBreakTime: req.user.maxBreakTime,
      maxBreaksPerShift: req.user.maxBreaksPerShift
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/breaks/today
// @desc    Get all today's breaks
// @access  Admin, Coordinator, Supervisor, Team Leader
router.get('/today', auth, authorize('Admin', 'Coordinator', 'Supervisor', 'Team Leader'), async (req, res) => {
  try {
    const today = getToday();
    const breaks = await BreakRecord.find({ date: { $gte: today } })
      .populate('employee', 'name employeeId designation shift')
      .sort({ createdAt: -1 });

    res.json(breaks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/breaks/live-status
// @desc    Get live break status (who is on break now)
// @access  Admin, Coordinator, Supervisor, Team Leader
router.get('/live-status', auth, authorize('Admin', 'Coordinator', 'Supervisor', 'Team Leader'), async (req, res) => {
  try {
    const today = getToday();

    // Get all ongoing breaks
    const ongoingBreaks = await BreakRecord.find({
      status: 'ongoing',
      date: { $gte: today }
    }).populate('employee', 'name employeeId designation shift');

    // Get all active users
    const activeUsers = await User.find({ isActive: true, designation: 'Operator' }).select('name employeeId shift');

    // Get completed breaks today
    const completedBreaks = await BreakRecord.find({
      status: { $in: ['completed', 'exceeded'] },
      date: { $gte: today }
    }).populate('employee', 'name employeeId designation shift');

    res.json({
      onBreak: ongoingBreaks,
      available: activeUsers.filter(u => !ongoingBreaks.some(b => b.employee._id.toString() === u._id.toString())),
      completed: completedBreaks,
      totalOnBreak: ongoingBreaks.length,
      totalAvailable: activeUsers.length - ongoingBreaks.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/breaks/employee/:id
// @desc    Get break records for specific employee
// @access  Admin, Coordinator
router.get('/employee/:id', auth, authorize('Admin', 'Coordinator'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { employee: req.params.id };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const breaks = await BreakRecord.find(query)
      .populate('employee', 'name employeeId designation shift')
      .sort({ date: -1, createdAt: -1 });

    res.json(breaks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/breaks/exceeded
// @desc    Get all exceeded breaks
// @access  Admin, Coordinator
router.get('/exceeded', auth, authorize('Admin', 'Coordinator'), async (req, res) => {
  try {
    const today = getToday();
    const exceeded = await BreakRecord.find({
      status: 'exceeded',
      date: { $gte: today }
    }).populate('employee', 'name employeeId designation shift');

    res.json(exceeded);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
