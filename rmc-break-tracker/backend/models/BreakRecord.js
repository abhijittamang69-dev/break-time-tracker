const mongoose = require('mongoose');

const breakRecordSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  breakNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 3
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // in minutes
    default: 0
  },
  status: {
    type: String,
    enum: ['ongoing', 'completed', 'exceeded'],
    default: 'ongoing'
  },
  qrCodeId: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return now;
    }
  },
  shift: {
    type: String,
    enum: ['Morning', 'Afternoon', 'Night', 'Rotating']
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
breakRecordSchema.index({ employee: 1, date: -1 });
breakRecordSchema.index({ status: 1, date: -1 });

module.exports = mongoose.model('BreakRecord', breakRecordSchema);
