const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('./models/User');
const QRCode = require('./models/QRCode');

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await QRCode.deleteMany({});
    console.log('Cleared existing data');

    const salt = await bcrypt.genSalt(10);

    // Create admin user from env or use defaults
    const adminUsername = process.env.ADMIN_USERNAME || 'administrator';
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
    console.log('Admin user created');

    // Create sample operators
    const operators = [
      { employeeId: 'OP001', name: 'John Smith', email: 'john.smith@rmc.com', shift: 'Morning' },
      { employeeId: 'OP002', name: 'Sarah Johnson', email: 'sarah.j@rmc.com', shift: 'Morning' },
      { employeeId: 'OP003', name: 'Michael Brown', email: 'm.brown@rmc.com', shift: 'Afternoon' },
      { employeeId: 'OP004', name: 'Emily Davis', email: 'emily.d@rmc.com', shift: 'Afternoon' },
      { employeeId: 'OP005', name: 'David Wilson', email: 'd.wilson@rmc.com', shift: 'Night' }
    ];

    for (const op of operators) {
      const password = await bcrypt.hash('password123', salt);
      const operator = new User({
        employeeId: op.employeeId,
        name: op.name,
        username: op.email.split('@')[0],
        password,
        designation: 'Operator',
        shift: op.shift
      });
      await operator.save();
    }
    console.log('Sample operators created');

    // Create sample supervisors
    const supervisors = [
      { employeeId: 'SUP001', name: 'Robert Taylor', email: 'r.taylor@rmc.com', shift: 'Morning' },
      { employeeId: 'SUP002', name: 'Lisa Anderson', email: 'l.anderson@rmc.com', shift: 'Afternoon' }
    ];

    for (const sup of supervisors) {
      const password = await bcrypt.hash('password123', salt);
      const supervisor = new User({
        employeeId: sup.employeeId,
        name: sup.name,
        username: sup.email.split('@')[0],
        password,
        designation: 'Supervisor',
        shift: sup.shift
      });
      await supervisor.save();
    }
    console.log('Sample supervisors created');

    // Create sample QR codes
    const qrCodes = [
      { codeId: 'RMC-BREAK-AREA-01', location: 'Main Break Room', description: 'Primary break area for all shifts' },
      { codeId: 'RMC-BREAK-AREA-02', location: 'Secondary Break Room', description: 'Secondary break area for overflow' }
    ];

    for (const qr of qrCodes) {
      const qrCode = new QRCode(qr);
      await qrCode.save();
    }
    console.log('Sample QR codes created');

    console.log('\nSeed data created successfully!');
    console.log(`\nAdmin Login: Username: ${adminUsername}, Password: ${adminPasswordRaw}`);
    console.log('\nOperator Logins (password: password123):');
    operators.forEach(op => console.log(`  ${op.employeeId}: ${op.email.split('@')[0]}`));

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();
