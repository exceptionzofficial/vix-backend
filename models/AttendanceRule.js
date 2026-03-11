const mongoose = require('mongoose');

const AttendanceRuleSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
    },
    radius: { type: Number, required: true }, // custom radius for the event
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String, required: true },   // HH:mm
    eventName: { type: String },
    isTemporary: { type: Boolean, default: true }
});

module.exports = mongoose.model('AttendanceRule', AttendanceRuleSchema);
