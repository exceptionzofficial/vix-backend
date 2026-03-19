const express = require('express');
const router = express.Router();
const { ddbDocClient } = require('../config/awsConfig');
const { PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Submit Multiple Expense Items (Batch)
router.post('/submit-multiple', async (req, res) => {
    try {
        const { employeeId, employeeName, expenseDate, items } = req.body;
        
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Invalid items list' });
        }

        const batchGroupId = crypto.randomUUID();
        const timestamp = Date.now();

        const putPromises = items.map(item => {
            const expense = {
                expenseId: crypto.randomUUID(),
                batchGroupId, // Link items together
                employeeId,
                employeeName,
                amount: Number(item.amount),
                expenseDate,
                category: item.category,
                remarks: item.remarks,
                submittedBy: employeeName,
                verifiedBy: null,
                approvedBy: null,
                status: "Submitted",
                timestamp,
                createdAt: new Date().toISOString()
            };

            return ddbDocClient.send(new PutCommand({
                TableName: 'Expenses',
                Item: expense
            }));
        });

        await Promise.all(putPromises);
        res.status(201).json({ message: 'Batch expenses submitted', batchGroupId });
    } catch (error) {
        console.error('Error submitting batch expenses:', error);
        res.status(500).json({ error: 'Failed' });
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
