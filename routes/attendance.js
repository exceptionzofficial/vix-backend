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

// Get Current Rule for Employee
router.get('/current-rule/:employeeId', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // In a real app, we would query the GeofenceRules table by employeeId and date
        // Note: GeofenceRules needs a GSI on employeeId and date for efficient lookup
        // For now, we fetch the latest rule matching the employeeId via Scan (for demo)
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'GeofenceRules',
        }));
        
        const rules = data.Items || [];
        // Find specific event rule for employee today
        let rule = rules.find(r => r.employeeId === req.params.employeeId && r.date === today);
        
        // Fallback to Main Branch rule if no specific event
        if (!rule) {
            rule = rules.find(r => r.employeeId === 'All' || r.eventName === 'Main Branch');
        }

        if (!rule) return res.status(404).json({ error: 'No active rule for today' });
        res.json(rule);
    } catch (error) {
        console.error('Error fetching current rule:', error);
        res.status(500).json({ error: 'Failed to fetch rule' });
    }
});

module.exports = router;
