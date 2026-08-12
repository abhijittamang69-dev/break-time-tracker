const express = require('express');
const BreakRecord = require('../models/BreakRecord');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/reports/daily
// @desc    Get daily report
// @access  Admin, Coordinator
router.get('/daily', auth, authorize('Admin', 'Coordinator'), async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const breaks = await BreakRecord.find({
      date: { $gte: targetDate, $lt: nextDay }
    }).populate('employee', 'name employeeId designation shift');

    // Calculate statistics
    const totalBreaks = breaks.length;
    const completedBreaks = breaks.filter(b => b.status === 'completed').length;
    const exceededBreaks = breaks.filter(b => b.status === 'exceeded').length;
    const ongoingBreaks = breaks.filter(b => b.status === 'ongoing').length;

    const totalDuration = breaks.reduce((sum, b) => sum + (b.duration || 0), 0);
    const avgDuration = totalBreaks > 0 ? Math.round(totalDuration / totalBreaks) : 0;

    // Group by employee
    const employeeStats = {};
    breaks.forEach(b => {
      const empId = b.employee._id.toString();
      if (!employeeStats[empId]) {
        employeeStats[empId] = {
          employee: b.employee,
          totalBreaks: 0,
          totalDuration: 0,
          exceeded: 0
        };
      }
      employeeStats[empId].totalBreaks++;
      employeeStats[empId].totalDuration += b.duration || 0;
      if (b.status === 'exceeded') employeeStats[empId].exceeded++;
    });

    res.json({
      date: targetDate,
      summary: {
        totalBreaks,
        completedBreaks,
        exceededBreaks,
        ongoingBreaks,
        totalDuration,
        avgDuration
      },
      employeeStats: Object.values(employeeStats),
      breaks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/weekly
// @desc    Get weekly report
// @access  Admin, Coordinator
router.get('/weekly', auth, authorize('Admin', 'Coordinator'), async (req, res) => {
  try {
    const { startDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);

    // Get start of week (Sunday)
    const dayOfWeek = start.getDay();
    start.setDate(start.getDate() - dayOfWeek);

    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const breaks = await BreakRecord.find({
      date: { $gte: start, $lt: end }
    }).populate('employee', 'name employeeId designation shift');

    // Daily breakdown
    const dailyStats = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateKey = d.toISOString().split('T')[0];
      dailyStats[dateKey] = {
        date: dateKey,
        totalBreaks: 0,
        totalDuration: 0,
        exceeded: 0
      };
    }

    breaks.forEach(b => {
      const dateKey = b.date.toISOString().split('T')[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].totalBreaks++;
        dailyStats[dateKey].totalDuration += b.duration || 0;
        if (b.status === 'exceeded') dailyStats[dateKey].exceeded++;
      }
    });

    const totalBreaks = breaks.length;
    const totalDuration = breaks.reduce((sum, b) => sum + (b.duration || 0), 0);
    const exceededCount = breaks.filter(b => b.status === 'exceeded').length;

    res.json({
      weekStart: start,
      weekEnd: end,
      summary: {
        totalBreaks,
        totalDuration,
        exceededCount,
        avgDuration: totalBreaks > 0 ? Math.round(totalDuration / totalBreaks) : 0
      },
      dailyBreakdown: Object.values(dailyStats),
      breaks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/monthly
// @desc    Get monthly report
// @access  Admin, Coordinator
router.get('/monthly', auth, authorize('Admin', 'Coordinator'), async (req, res) => {
  try {
    const { year, month } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();

    const start = new Date(targetYear, targetMonth, 1);
    const end = new Date(targetYear, targetMonth + 1, 1);

    const breaks = await BreakRecord.find({
      date: { $gte: start, $lt: end }
    }).populate('employee', 'name employeeId designation shift');

    // Employee breakdown
    const employeeStats = {};
    breaks.forEach(b => {
      const empId = b.employee._id.toString();
      if (!employeeStats[empId]) {
        employeeStats[empId] = {
          employee: b.employee,
          totalBreaks: 0,
          totalDuration: 0,
          exceeded: 0,
          daysWithBreaks: new Set()
        };
      }
      employeeStats[empId].totalBreaks++;
      employeeStats[empId].totalDuration += b.duration || 0;
      employeeStats[empId].daysWithBreaks.add(b.date.toISOString().split('T')[0]);
      if (b.status === 'exceeded') employeeStats[empId].exceeded++;
    });

    // Convert sets to counts
    Object.values(employeeStats).forEach(stat => {
      stat.daysActive = stat.daysWithBreaks.size;
      delete stat.daysWithBreaks;
    });

    const totalBreaks = breaks.length;
    const totalDuration = breaks.reduce((sum, b) => sum + (b.duration || 0), 0);
    const exceededCount = breaks.filter(b => b.status === 'exceeded').length;

    res.json({
      year: targetYear,
      month: targetMonth + 1,
      summary: {
        totalBreaks,
        totalDuration,
        exceededCount,
        avgDuration: totalBreaks > 0 ? Math.round(totalDuration / totalBreaks) : 0
      },
      employeeStats: Object.values(employeeStats),
      breaks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/employee/:id
// @desc    Get employee-specific report
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
      .populate('employee', 'name employeeId designation shift maxBreakTime')
      .sort({ date: -1 });

    const totalBreaks = breaks.length;
    const totalDuration = breaks.reduce((sum, b) => sum + (b.duration || 0), 0);
    const exceededCount = breaks.filter(b => b.status === 'exceeded').length;
    const avgDuration = totalBreaks > 0 ? Math.round(totalDuration / totalBreaks) : 0;

    // Daily breakdown
    const dailyStats = {};
    breaks.forEach(b => {
      const dateKey = b.date.toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = {
          date: dateKey,
          totalBreaks: 0,
          totalDuration: 0,
          exceeded: 0
        };
      }
      dailyStats[dateKey].totalBreaks++;
      dailyStats[dateKey].totalDuration += b.duration || 0;
      if (b.status === 'exceeded') dailyStats[dateKey].exceeded++;
    });

    res.json({
      employee: breaks.length > 0 ? breaks[0].employee : null,
      summary: {
        totalBreaks,
        totalDuration,
        exceededCount,
        avgDuration
      },
      dailyBreakdown: Object.values(dailyStats),
      breaks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
