const express = require('express');
const router = express.Router();
const { ddbDocClient } = require('../config/awsConfig');
const { PutCommand, QueryCommand, ScanCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Submit Leave or Permission Request
router.post('/request', async (req, res) => {
    try {
        const { employeeId, employeeName, type, leaveType, startDate, endDate, reason, duration = "Full Day" } = req.body;
        const requestId = crypto.randomUUID();

        const newRequest = {
            requestId,
            employeeId,
            employeeName,
            type, // "Leave" or "Permission"
            leaveType, // CL, SL, EL-PL, LOP, Half Day (only for Leave)
            startDate,
            endDate: endDate || startDate,
            reason,
            duration, // For Permission: e.g. "2 Hours", For Leave: "Full Day" or "Half Day"
            status: "Pending",
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'LeaveRequests',
            Item: newRequest
        }));

        res.status(201).json({ message: 'Request submitted successfully', requestId });
    } catch (error) {
        console.error('Error submitting leave request:', error);
        res.status(500).json({ error: 'Failed to submit request' });
    }
});

// Get My Requests (for Employee)
router.get('/my-requests/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'LeaveRequests',
            FilterExpression: 'employeeId = :eid',
            ExpressionAttributeValues: { ':eid': employeeId }
        }));
        
        const sorted = (data.Items || []).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (error) {
        console.error('Error fetching my requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

// Get All Requests (for Admin)
router.get('/all-requests', async (req, res) => {
    try {
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'LeaveRequests'
        }));
        const sorted = (data.Items || []).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (error) {
        console.error('Error fetching all requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

// Update Request Status (Admin: Approved/Rejected)
router.put('/update-status/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { status, adminComment } = req.body;

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'LeaveRequests',
            Key: { requestId },
            UpdateExpression: 'set #s = :status, adminComment = :comment, updatedAt = :time',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
                ':status': status,
                ':comment': adminComment || "",
                ':time': new Date().toISOString()
            }
        }));

        res.json({ message: `Request ${status} successfully` });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Failed to update request status' });
    }
});

module.exports = router;
