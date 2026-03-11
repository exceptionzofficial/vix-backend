const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    faceId: { type: String }, // Reference image path or facial encoding
    role: { type: String, enum: ['employee', 'admin'], default: 'employee' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Employee', EmployeeSchema);
