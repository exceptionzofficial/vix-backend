const express = require('express');
const router = express.Router();
const { ddbDocClient, rekognitionClient } = require('../config/awsConfig');
const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { 
    IndexFacesCommand, 
    SearchFacesByImageCommand, 
    CreateCollectionCommand, 
    ListCollectionsCommand 
} = require('@aws-sdk/client-rekognition');

const COLLECTION_ID = 'crayonz-employee-faces';

// Ensure Rekognition collection exists
const ensureCollection = async () => {
    try {
        const { CollectionIds } = await rekognitionClient.send(new ListCollectionsCommand({}));
        if (!CollectionIds.includes(COLLECTION_ID)) {
            await rekognitionClient.send(new CreateCollectionCommand({ CollectionId: COLLECTION_ID }));
            console.log(`[REKOGNITION] Collection "${COLLECTION_ID}" created.`);
        } else {
            console.log(`[REKOGNITION] Collection "${COLLECTION_ID}" ready.`);
        }
    } catch (err) {
        console.error('[REKOGNITION] Error ensuring collection:', err.message);
    }
};
ensureCollection();

// Register Face — Index a face into the Rekognition collection
router.post('/register-face', async (req, res) => {
    try {
        const { employeeId, imageBase64 } = req.body;

        if (!employeeId || !imageBase64) {
            return res.status(400).json({ error: 'employeeId and imageBase64 are required' });
        }

        const imageBuffer = Buffer.from(imageBase64, 'base64');

        const indexResult = await rekognitionClient.send(new IndexFacesCommand({
            CollectionId: COLLECTION_ID,
            Image: { Bytes: imageBuffer },
            ExternalImageId: employeeId,
            DetectionAttributes: ['ALL'],
            MaxFaces: 1,
            QualityFilter: 'AUTO'
        }));

        if (!indexResult.FaceRecords || indexResult.FaceRecords.length === 0) {
            return res.status(400).json({ error: 'No face detected in the image. Please try again with a clear face photo.' });
        }

        const faceId = indexResult.FaceRecords[0].Face.FaceId;

        // Store faceId in Employees table
        await ddbDocClient.send(new UpdateCommand({
            TableName: 'Employees',
            Key: { employeeId },
            UpdateExpression: 'set faceId = :fid, isFaceRegistered = :reg',
            ExpressionAttributeValues: {
                ':fid': faceId,
                ':reg': true
            }
        }));

        console.log(`[REKOGNITION] Face registered for ${employeeId}. FaceId: ${faceId}`);
        res.status(200).json({ 
            message: 'Face registered successfully', 
            faceId, 
            confidence: indexResult.FaceRecords[0].Face.Confidence 
        });
    } catch (error) {
        console.error('[REKOGNITION] Registration error:', error);
        res.status(500).json({ error: 'Failed to register face: ' + error.message });
    }
});

// Verify Face — Search for a matching face
router.post('/verify-face', async (req, res) => {
    try {
        const { imageBase64 } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ error: 'imageBase64 is required' });
        }

        const imageBuffer = Buffer.from(imageBase64, 'base64');

        const searchResult = await rekognitionClient.send(new SearchFacesByImageCommand({
            CollectionId: COLLECTION_ID,
            Image: { Bytes: imageBuffer },
            MaxFaces: 1,
            FaceMatchThreshold: 80
        }));

        if (!searchResult.FaceMatches || searchResult.FaceMatches.length === 0) {
            return res.status(401).json({ error: 'Face not recognized. Please register your face first.' });
        }

        const match = searchResult.FaceMatches[0];
        const matchedEmployeeId = match.Face.ExternalImageId;
        const confidence = match.Similarity;

        console.log(`[REKOGNITION] Face matched: ${matchedEmployeeId} (${confidence.toFixed(1)}% confidence)`);
        res.status(200).json({ 
            matched: true, 
            employeeId: matchedEmployeeId, 
            confidence: confidence.toFixed(1)
        });
    } catch (error) {
        if (error.name === 'InvalidParameterException' && error.message.includes('no faces')) {
            return res.status(400).json({ error: 'No face detected in image. Please try again.' });
        }
        console.error('[REKOGNITION] Verification error:', error);
        res.status(500).json({ error: 'Face verification failed: ' + error.message });
    }
});

// Mark Attendance (with real face verification)
router.post('/mark', async (req, res) => {
    try {
        const { employeeId, imageBase64, location, status, type = 'check-in' } = req.body;

        // 1. Get accurate India time
        const now = new Date();
        const indiaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const dateStr = indiaTime.toLocaleDateString('en-GB').split('/').reverse().join('-');
        const timeStr = indiaTime.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // 2. Face verification (if real image provided)
        let faceVerified = false;
        let matchConfidence = 0;

        if (imageBase64 && imageBase64 !== 'MOCK_BASE64_IMAGE_DATA' && imageBase64.length > 100) {
            try {
                const imageBuffer = Buffer.from(imageBase64, 'base64');

                if (req.body.isRegistration) {
                    // --- REGISTER FACE ---
                    const indexResult = await rekognitionClient.send(new IndexFacesCommand({
                        CollectionId: COLLECTION_ID,
                        Image: { Bytes: imageBuffer },
                        ExternalImageId: employeeId,
                        DetectionAttributes: ['ALL'],
                        MaxFaces: 1,
                        QualityFilter: 'AUTO'
                    }));

                    if (indexResult.FaceRecords && indexResult.FaceRecords.length > 0) {
                        const faceId = indexResult.FaceRecords[0].Face.FaceId;
                        await ddbDocClient.send(new UpdateCommand({
                            TableName: 'Employees',
                            Key: { employeeId },
                            UpdateExpression: 'set faceId = :fid, isFaceRegistered = :reg',
                            ExpressionAttributeValues: { ':fid': faceId, ':reg': true }
                        }));
                        faceVerified = true;
                        matchConfidence = indexResult.FaceRecords[0].Face.Confidence;
                        console.log(`[REKOGNITION] Face registered for ${employeeId}. FaceId: ${faceId}`);
                    } else {
                        return res.status(400).json({ error: 'No face detected. Please position your face clearly in the frame.' });
                    }
                } else {
                    // --- VERIFY FACE ---
                    const searchResult = await rekognitionClient.send(new SearchFacesByImageCommand({
                        CollectionId: COLLECTION_ID,
                        Image: { Bytes: imageBuffer },
                        MaxFaces: 1,
                        FaceMatchThreshold: 80
                    }));

                    if (searchResult.FaceMatches && searchResult.FaceMatches.length > 0) {
                        const matchedId = searchResult.FaceMatches[0].Face.ExternalImageId;
                        matchConfidence = searchResult.FaceMatches[0].Similarity;

                        if (matchedId === employeeId) {
                            faceVerified = true;
                            console.log(`[REKOGNITION] Face verified for ${employeeId} (${matchConfidence.toFixed(1)}%)`);
                        } else {
                            console.log(`[REKOGNITION] Face mismatch: expected ${employeeId}, got ${matchedId}`);
                            return res.status(401).json({ 
                                error: `Face does not match your profile. Identity matched to a different employee.` 
                            });
                        }
                    } else {
                        return res.status(401).json({ 
                            error: 'Face not recognized. Please register your face first or try again with better lighting.' 
                        });
                    }
                }
            } catch (rekError) {
                console.error('[REKOGNITION] Face processing error:', rekError.message);
                if (rekError.name === 'InvalidParameterException' && rekError.message.includes('no faces')) {
                    return res.status(400).json({ error: 'No face detected in image. Please position your face clearly.' });
                }
                // For other Rekognition errors, allow fallback
                console.log('[REKOGNITION] Falling back to non-verified mode');
            }
        } else {
            // No real image — mock mode for testing
            faceVerified = true;
            matchConfidence = 100;
        }

        // 3. Handle Check-out
        if (type === 'check-out') {
            const { geofenceName } = req.body;
            console.log(`[CHECKOUT] Employee: ${employeeId}, Date: ${dateStr}, Time: ${timeStr}`);

            const logsRes = await ddbDocClient.send(new QueryCommand({
                TableName: 'AttendanceLogs',
                KeyConditionExpression: 'employeeId = :eid',
                ExpressionAttributeValues: { ':eid': employeeId },
                ScanIndexForward: false,
                Limit: 10
            }));

            const allLogs = logsRes.Items || [];
            const latestLog = allLogs.find(log => log.date === dateStr && !log.checkOutTime);

            if (latestLog) {
                await ddbDocClient.send(new UpdateCommand({
                    TableName: 'AttendanceLogs',
                    Key: { employeeId: latestLog.employeeId, timestamp: latestLog.timestamp },
                    UpdateExpression: 'set checkOutTime = :cot, checkoutLocation = :loc, checkoutGeofence = :cgeo',
                    ExpressionAttributeValues: { ':cot': timeStr, ':loc': location, ':cgeo': geofenceName || latestLog.geofence }
                }));
                return res.status(200).json({ message: 'Check-out successful', logEntry: { ...latestLog, checkOutTime: timeStr } });
            } else {
                const checkoutEntry = {
                    employeeId, timestamp: Date.now(), date: dateStr, checkOutTime: timeStr,
                    location, geofence: geofenceName || 'Unknown Branch',
                    status: 'Checked-Out', verified: faceVerified, type: 'check-out'
                };
                await ddbDocClient.send(new PutCommand({ TableName: 'AttendanceLogs', Item: checkoutEntry }));
                return res.status(200).json({ message: 'Check-out recorded', logEntry: checkoutEntry });
            }
        }

        // 4. Log Check-in
        const logEntry = {
            employeeId, timestamp: Date.now(), date: dateStr, checkInTime: timeStr,
            location, geofence: req.body.geofenceName || 'Main Branch',
            status, verified: faceVerified, faceConfidence: matchConfidence, type: 'check-in'
        };

        await ddbDocClient.send(new PutCommand({ TableName: 'AttendanceLogs', Item: logEntry }));

        res.status(200).json({ message: 'Attendance marked successfully', logEntry, faceVerified });
    } catch (error) {
        console.error('Error marking attendance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get All Attendance Logs for Employee
router.get('/logs/:employeeId', async (req, res) => {
    try {
        const data = await ddbDocClient.send(new QueryCommand({
            TableName: 'AttendanceLogs',
            KeyConditionExpression: 'employeeId = :eid',
            ExpressionAttributeValues: { ':eid': req.params.employeeId }
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
        const data = await ddbDocClient.send(new ScanCommand({ TableName: 'GeofenceRules' }));
        const allRules = data.Items || [];

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
