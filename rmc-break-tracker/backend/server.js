const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/User');
const QRCode = require('./models/QRCode');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
const allowedOrigins = ['https://break-time-tracker.vercel.app', 'https://break-time-tracker.onrender.com', 'http://localhost:5000'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Auto-seed database if empty
const seedDatabase = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('Database already seeded, skipping...');
      return;
    }

    console.log('Database empty - seeding data...');
    const salt = await bcrypt.genSalt(10);

    // Create admin user from env or use defaults
    const adminUsername = (process.env.ADMIN_USERNAME || 'administrator').toLowerCase();
    const adminPasswordRaw = process.env.ADMIN_PASSWORD || 'Admin@123';
    const adminPassword = await bcrypt.hash(adminPasswordRaw, salt);

    const admin = new User({
      employeeId: 'ADMIN001',
      name: 'Administrator',
      username: adminUsername,
      password: adminPassword,
      designation: 'Admin',
      shift: 'Morning'
    });
    await admin.save();
    console.log(`Admin user created: ${adminUsername} / ${adminPasswordRaw}`);

    // Create sample QR codes
    const qrCodes = [
      { codeId: 'RMC-BREAK-AREA-01', location: 'Main Break Room', description: 'Primary break area for all shifts' },
      { codeId: 'RMC-BREAK-AREA-02', location: 'Secondary Break Room', description: 'Secondary break area for overflow' }
    ];
    for (const qr of qrCodes) {
      await new QRCode(qr).save();
    }
    console.log('Sample QR codes created');
    console.log('Auto-seed complete!');
  } catch (error) {
    console.error('Auto-seed error:', error.message);
  }
};

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected Successfully');
    await seedDatabase();
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

connectDB();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/breaks', require('./routes/breaks'));
app.use('/api/qrcodes', require('./routes/qrcodes'));
app.use('/api/reports', require('./routes/reports'));

// Serve frontend for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
