const express = require('express');
const cors = require('cors');
require('dotenv').config();
const initTables = require('./utils/tableInit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize AWS DynamoDB Tables
initTables();

const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const employeeRoutes = require('./routes/employee');
const leaveRoutes = require('./routes/leave');
const taskRoutes = require('./routes/tasks');
const expenseRoutes = require('./routes/expenses');

app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/expenses', expenseRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
