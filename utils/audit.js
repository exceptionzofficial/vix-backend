const cron = require('node-cron');
const AttendanceRule = require('./models/AttendanceRule');
const AttendanceLog = require('./models/AttendanceLog');
const Employee = require('./models/Employee');

// Task: Every 30 minutes, check for missing sign-ins
const startAttendanceAudit = () => {
    cron.schedule('*/30 * * * *', async () => {
        console.log('Running Attendance Audit...');
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        try {
            // Find all active rules for today where startTime < current time
            const activeRules = await AttendanceRule.find({ date: today });

            for (const rule of activeRules) {
                // If current time is past start time
                if (currentTime > rule.startTime) {
                    // Check if employee has signed in for today
                    const log = await AttendanceLog.findOne({ employeeId: rule.employeeId, date: today });

                    if (!log) {
                        // Notify Admin
                        console.log(`ALERT: Missing sign-in for Employee ${rule.employeeId} at Event ${rule.eventName}`);
                        // Here you would integrate with an Email or Push Notification service
                    }
                }
            }
        } catch (error) {
            console.error('Audit Error:', error);
        }
    });
};

module.exports = { startAttendanceAudit };
