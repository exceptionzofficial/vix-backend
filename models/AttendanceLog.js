const mongoose = require('mongoose');

const AttendanceLogSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    checkIn: {
        time: { type: Date },
        location: {
            latitude: { type: Number },
            longitude: { type: Number }
        },
        status: { type: String, enum: ['Present', 'Late', 'Outside Geofence'], default: 'Present' }
    },
    checkOut: {
        time: { type: Date },
        location: {
            latitude: { type: Number },
            longitude: { type: Number }
        }
    },
    isFaceVerified: { type: Boolean, default: false }
});

module.exports = mongoose.model('AttendanceLog', AttendanceLogSchema);
