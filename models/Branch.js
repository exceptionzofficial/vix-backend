const mongoose = require('mongoose');

const BranchSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
    },
    radius: { type: Number, default: 100 }, // Default geofence radius in meters
    isMainBranch: { type: Boolean, default: false }
});

module.exports = mongoose.model('Branch', BranchSchema);
