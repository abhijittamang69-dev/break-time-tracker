const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  designation: {
    type: String,
    enum: ['Admin', 'Coordinator', 'Supervisor', 'Team Leader', 'Operator'],
    required: true
  },
  shift: {
    type: String,
    enum: ['Morning', 'Afternoon', 'Night', 'Rotating'],
    required: true
  },
  department: {
    type: String,
    default: 'RMC'
  },
  maxBreakTime: {
    type: Number,
    default: 60 // minutes
  },
  maxBreaksPerShift: {
    type: Number,
    default: 3
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
