const express = require('express');
const QRCodeModel = require('../models/QRCode');
const { auth, authorize } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// @route   GET /api/qrcodes
// @desc    Get all QR codes
// @access  Admin, Coordinator
router.get('/', auth, authorize('Admin', 'Coordinator'), async (req, res) => {
  try {
    const qrCodes = await QRCodeModel.find().sort({ createdAt: -1 });
    res.json(qrCodes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/qrcodes
// @desc    Create new QR code
// @access  Admin
router.post('/', auth, authorize('Admin'), async (req, res) => {
  try {
    const { location, description } = req.body;

    const qrCode = new QRCodeModel({
      codeId: uuidv4(),
      location,
      description
    });

    await qrCode.save();
    res.status(201).json({ message: 'QR Code created successfully', qrCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/qrcodes/:codeId
// @desc    Get QR code by codeId
// @access  Public (for scanning)
router.get('/:codeId', async (req, res) => {
  try {
    const qrCode = await QRCodeModel.findOne({ codeId: req.params.codeId });
    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }
    if (!qrCode.isActive) {
      return res.status(400).json({ message: 'QR Code is inactive' });
    }
    res.json(qrCode);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/qrcodes/:id
// @desc    Update QR code
// @access  Admin
router.put('/:id', auth, authorize('Admin'), async (req, res) => {
  try {
    const { location, description, isActive } = req.body;

    const qrCode = await QRCodeModel.findByIdAndUpdate(
      req.params.id,
      { location, description, isActive },
      { new: true }
    );

    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }

    res.json({ message: 'QR Code updated successfully', qrCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/qrcodes/:id
// @desc    Delete QR code
// @access  Admin
router.delete('/:id', auth, authorize('Admin'), async (req, res) => {
  try {
    const qrCode = await QRCodeModel.findByIdAndDelete(req.params.id);
    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }
    res.json({ message: 'QR Code deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
