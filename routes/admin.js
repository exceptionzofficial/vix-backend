const express = require('express');
const router = express.Router();
const { ddbDocClient } = require('../config/awsConfig');
const { PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Get All Attendance Logs (for Admin)
router.get('/attendance-logs', async (req, res) => {
    try {
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'AttendanceLogs'
        }));
        // Sort by timestamp descending
        const sorted = (data.Items || []).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (error) {
        console.error('Error fetching attendance logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// Add Geofence Rule (for Admin)
router.post('/set-geofence', async (req, res) => {
    try {
        const { employeeId, eventName, location, radius, startTime, date } = req.body;
        const ruleId = crypto.randomUUID();

        const newRule = {
            ruleId,
            employeeId,
            eventName,
            location, // { latitude, longitude }
            radius: Number(radius),
            startTime,
            date,
            createdAt: new Date().toISOString()
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'GeofenceRules',
            Item: newRule
        }));

        res.status(201).json({ message: 'Geofence rule set successfully', ruleId });
    } catch (error) {
        console.error('Error setting geofence:', error);
        res.status(500).json({ error: 'Failed to set geofence' });
    }
});

// Get All Geofence Rules
router.get('/geofences', async (req, res) => {
    try {
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'GeofenceRules'
        }));
        res.json(data.Items || []);
    } catch (error) {
        console.error('Error fetching geofences:', error);
        res.status(500).json({ error: 'Failed to fetch geofences' });
    }
});

// Update Geofence Rule
router.put('/geofence/:ruleId', async (req, res) => {
    try {
        const { ruleId } = req.params;
        const { employeeId, eventName, location, radius, startTime, date } = req.body;

        const updatedRule = {
            ruleId,
            employeeId,
            eventName,
            location,
            radius: Number(radius),
            startTime,
            date,
            updatedAt: new Date().toISOString()
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'GeofenceRules',
            Item: updatedRule
        }));

        res.json({ message: 'Geofence rule updated successfully' });
    } catch (error) {
        console.error('Error updating geofence:', error);
        res.status(500).json({ error: 'Failed to update geofence' });
    }
});

// Delete Geofence Rule
const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
router.delete('/geofence/:ruleId', async (req, res) => {
    try {
        const { ruleId } = req.params;

        await ddbDocClient.send(new DeleteCommand({
            TableName: 'GeofenceRules',
            Key: { ruleId }
        }));

        res.json({ message: 'Geofence rule deleted successfully' });
    } catch (error) {
        console.error('Error deleting geofence:', error);
        res.status(500).json({ error: 'Failed to delete geofence' });
    }
});

module.exports = router;
