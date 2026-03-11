const express = require('express');
const cors = require('cors');
require('dotenv').config();
const initTables = require('./utils/tableInit');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize AWS DynamoDB Tables
initTables();

const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const employeeRoutes = require('./routes/employee');

app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
