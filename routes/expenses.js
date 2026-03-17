const express = require('express');
const router = express.Router();
const { ddbDocClient } = require('../config/awsConfig');
const { PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Submit Expense Request
router.post('/submit', async (req, res) => {
    try {
        const { employeeId, employeeName, amount, expenseDate, category, remarks } = req.body;
        const expenseId = crypto.randomUUID();
        const timestamp = Date.now();

        const newExpense = {
            expenseId,
            employeeId,
            employeeName,
            amount: Number(amount),
            expenseDate,
            category, // Petrol, Bus, Train, etc.
            remarks,
            submittedBy: employeeName,
            verifiedBy: null, // Manager verification
            approvedBy: null, // Admin / Accounts approval
            status: "Submitted", // Submitted, Verified, Approved, Rejected
            timestamp,
            createdAt: new Date().toISOString()
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'Expenses',
            Item: newExpense
        }));

        res.status(201).json({ message: 'Expense submitted successfully', expenseId });
    } catch (error) {
        console.error('Error submitting expense:', error);
        res.status(500).json({ error: 'Failed to submit expense' });
    }
});

// Get My Expenses (Staff)
router.get('/my/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'Expenses',
            FilterExpression: 'employeeId = :eid',
            ExpressionAttributeValues: { ':eid': employeeId }
        }));
        const sorted = (data.Items || []).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Get All Expenses (Admin/Manager)
router.get('/all', async (req, res) => {
    try {
        const data = await ddbDocClient.send(new ScanCommand({ TableName: 'Expenses' }));
        const sorted = (data.Items || []).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (error) {
        console.error('Error fetching all expenses:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Manager Verification
router.put('/verify/:expenseId', async (req, res) => {
    try {
        const { expenseId } = req.params;
        const { managerId, managerName, status } = req.body; // status: "Verified" or "Rejected"

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'Expenses',
            Key: { expenseId },
            UpdateExpression: 'set verifiedBy = :vname, #s = :status, verifiedAt = :time',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
                ':vname': managerName,
                ':status': status,
                ':time': new Date().toISOString()
            }
        }));

        res.json({ message: `Expense ${status} by manager` });
    } catch (error) {
        console.error('Error verifying expense:', error);
        res.status(500).json({ error: 'Failed to verify' });
    }
});

// Admin / Accounts Approval
router.put('/approve/:expenseId', async (req, res) => {
    try {
        const { expenseId } = req.params;
        const { adminName, status } = req.body; // status: "Approved" or "Rejected"

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'Expenses',
            Key: { expenseId },
            UpdateExpression: 'set approvedBy = :aname, #s = :status, approvedAt = :time',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
                ':aname': adminName,
                ':status': status,
                ':time': new Date().toISOString()
            }
        }));

        res.json({ message: `Expense ${status} by Admin` });
    } catch (error) {
        console.error('Error approving expense:', error);
        res.status(500).json({ error: 'Failed to approve' });
    }
});

module.exports = router;
