const express = require('express');
const router = express.Router();
const { ddbDocClient, rekognitionClient } = require('../config/awsConfig');
const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { IndexFaceCommand, SearchFacesByImageCommand } = require('@aws-sdk/client-rekognition');

// Mark Attendance with Face Recognition
router.post('/mark', async (req, res) => {
    try {
        const { employeeId, imageBase64, location, status } = req.body;

        // 1. Convert Image to Buffer
        const imageBuffer = Buffer.from(imageBase64, 'base64');

        // 2. Search for face in Rekognition Collection
        // Note: For a real app, we would have already indexed the employee's face
        // Here we simulate the match to provide the mock workflow requested
        
        // MOCK: SearchFacesByImage placeholder logic
        /*
        const searchResponse = await rekognitionClient.send(new SearchFacesByImageCommand({
            CollectionId: 'CrayonzEmployees',
            Image: { Bytes: imageBuffer },
            MaxFaces: 1,
            FaceMatchThreshold: 90
        }));

        if (searchResponse.FaceMatches.length === 0) {
            return res.status(401).json({ error: 'Face not recognized' });
        }
        */

        // 3. Log Attendance in DynamoDB
        const logEntry = {
            employeeId,
            timestamp: Date.now(),
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString(),
            location,
            status, // 'Early', 'On-Time', 'Late'
            verified: true
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'AttendanceLogs',
            Item: logEntry
        }));
        
        // 4. If this is a registration, update the Employee's faceId
        if (req.body.isRegistration) {
            await ddbDocClient.send(new UpdateCommand({
                TableName: 'Employees',
                Key: { employeeId },
                UpdateExpression: 'set faceId = :fid',
                ExpressionAttributeValues: {
                    ':fid': `face_${employeeId}_${Date.now()}` // Mock face ID
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
