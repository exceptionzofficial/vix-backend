const express = require('express');
const router = express.Router();
const { ddbDocClient } = require('../config/awsConfig');
const { PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Submit Personal Request
router.post('/submit', async (req, res) => {
    try {
        const { 
            employeeId, employeeName, type, 
            amount, date, reason 
        } = req.body;

        if (!employeeId || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Salary Advance Limit Check (Max 2 per calendar year)
        if (type === 'Salary In Advance') {
            const currentYear = new Date().getFullYear().toString();
            const data = await ddbDocClient.send(new ScanCommand({
                TableName: 'PersonalRequests',
                FilterExpression: 'employeeId = :eid AND #t = :type AND begins_with(#d, :year) AND (#s = :app OR #s = :pen)',
                ExpressionAttributeNames: { 
                    '#t': 'type',
                    '#d': 'date',
                    '#s': 'status'
                },
                ExpressionAttributeValues: { 
                    ':eid': employeeId,
                    ':type': 'Salary In Advance',
                    ':year': currentYear,
                    ':app': 'Approved',
                    ':pen': 'Pending'
                }
            }));

            if (data.Items && data.Items.length >= 2) {
                return res.status(400).json({ 
                    error: 'Salary Advance limit reached (Max 2 per year). Please contact HR.' 
                });
            }
        }

        const requestId = crypto.randomUUID();
        const timestamp = Date.now();

        const newRequest = {
            requestId,
            employeeId,
            employeeName,
            type, // Salary In Advance / Travel Advance / Handloan / WFH
            amount: amount || 0,
            date: date || new Date().toISOString().split('T')[0],
            reason: reason || '',
            status: 'Pending',
            adminComment: '',
            timestamp
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'PersonalRequests',
            Item: newRequest
        }));

        res.status(201).json({ message: 'Request submitted successfully', requestId });
    } catch (error) {
        console.error('Error submitting personal request:', error);
        res.status(500).json({ error: 'Failed to submit request' });
    }
});

// Get My Personal Requests
router.get('/my/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'PersonalRequests',
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

// Get All Personal Requests (Admin)
router.get('/all', async (req, res) => {
    try {
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'PersonalRequests'
        }));
        const sorted = (data.Items || []).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (error) {
        console.error('Error fetching all requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

// Update Request Status (Admin)
router.put('/update-status/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { status, adminComment } = req.body;

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'PersonalRequests',
            Key: { requestId },
            UpdateExpression: 'set #s = :status, adminComment = :comment',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
                ':status': status,
                ':comment': adminComment || ""
            }
        }));

        res.json({ message: 'Request updated successfully' });
    } catch (error) {
        console.error('Error updating request:', error);
        res.status(500).json({ error: 'Failed to update request' });
    }
});

module.exports = router;
