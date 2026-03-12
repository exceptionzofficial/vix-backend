const express = require('express');
const router = express.Router();
const { ddbDocClient, rekognitionClient } = require('../config/awsConfig');
const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { IndexFaceCommand, SearchFacesByImageCommand } = require('@aws-sdk/client-rekognition');

// Mark Attendance with Face Recognition
router.post('/mark', async (req, res) => {
    try {
        const { employeeId, imageBase64, location, status, type = 'check-in' } = req.body;

        // 1. Get accurate India time
        const now = new Date();
        const indiaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const dateStr = indiaTime.toISOString().split('T')[0];
        const timeStr = indiaTime.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (type === 'check-out') {
            // Find the latest log for this employee today
            const logsRes = await ddbDocClient.send(new QueryCommand({
                TableName: 'AttendanceLogs',
                KeyConditionExpression: 'employeeId = :eid',
                ExpressionAttributeValues: { ':eid': employeeId },
                ScanIndexForward: false, // Descending by sort key (timestamp)
                Limit: 5
            }));

            const latestLog = logsRes.Items?.find(log => log.date === dateStr && !log.checkOutTime);

            if (!latestLog) {
                return res.status(404).json({ error: 'No active check-in found for today' });
            }

            // Update with check-out time
            await ddbDocClient.send(new UpdateCommand({
                TableName: 'AttendanceLogs',
                Key: { 
                    employeeId: latestLog.employeeId,
                    timestamp: latestLog.timestamp
                },
                UpdateExpression: 'set checkOutTime = :cot, checkoutLocation = :loc',
                ExpressionAttributeValues: {
                    ':cot': timeStr,
                    ':loc': location
                }
            }));

            return res.status(200).json({ 
                message: 'Check-out successful', 
                logEntry: { ...latestLog, checkOutTime: timeStr } 
            });
        }

        // 3. Log Check-in in DynamoDB
        const logEntry = {
            employeeId,
            timestamp: Date.now(),
            date: dateStr,
            checkInTime: timeStr,
            location,
            status, // 'Early', 'On-Time', 'Late'
            verified: true,
            type: 'check-in'
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'AttendanceLogs',
            Item: logEntry
        }));
        
        // 4. Face Registration logic
        if (req.body.isRegistration) {
            await ddbDocClient.send(new UpdateCommand({
                TableName: 'Employees',
                Key: { employeeId },
                UpdateExpression: 'set faceId = :fid',
                ExpressionAttributeValues: {
                    ':fid': `face_${employeeId}_${Date.now()}`
                }
            }));
        }

        res.status(200).json({ message: 'Attendance marked successfully', logEntry });
    } catch (error) {
        console.error('Error marking attendance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get All Attendance Logs for Employee
router.get('/logs/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const data = await ddbDocClient.send(new QueryCommand({
            TableName: 'AttendanceLogs',
            KeyConditionExpression: 'employeeId = :eid',
            ExpressionAttributeValues: {
                ':eid': employeeId
            }
        }));
        res.json(data.Items || []);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch attendance logs' });
    }
});

// Get All Applicable Geofence Rules for Employee
router.get('/current-rules/:employeeId', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch all rules
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'GeofenceRules',
        }));
        
        const allRules = data.Items || [];
        
        // Filter rules applicable to this employee:
        // 1. Branch locations (employeeId === 'All')
        // 2. Specific events assigned to this employeeId for today
        const applicableRules = allRules.filter(r => {
            const isBranch = r.employeeId === 'All' || r.eventName?.toLowerCase().includes('branch');
            const isAssignedEvent = r.employeeId === req.params.employeeId && r.date === today;
            return isBranch || isAssignedEvent;
        });

        if (applicableRules.length === 0) return res.status(404).json({ error: 'No active geofences found' });
        res.json(applicableRules);
    } catch (error) {
        console.error('Error fetching rules:', error);
        res.status(500).json({ error: 'Failed to fetch rules' });
    }
});

module.exports = router;
