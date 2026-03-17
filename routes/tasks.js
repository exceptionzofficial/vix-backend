const express = require('express');
const router = express.Router();
const { ddbDocClient } = require('../config/awsConfig');
const { PutCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Submit Work Task
router.post('/submit', async (req, res) => {
    try {
        const { 
            employeeId, employeeName, department, role, 
            eventName, taskName, description, location, 
            sourceFile, category, outputType, 
            startTime, endTime, status, remarks, date 
        } = req.body;

        const taskId = crypto.randomUUID();
        const timestamp = Date.now();

        const newTask = {
            taskId,
            employeeId,
            employeeName,
            department,
            role,
            eventName,
            taskName,
            description,
            location,
            sourceFile, // Drive or Sourcing
            category, // Poster, Video, Ai, etc.
            outputType, // Landscape or Portrait
            startTime,
            endTime,
            status, // Start, Completed, Pending
            remarks,
            timestamp,
            date: date || new Date().toISOString().split('T')[0]
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'WorkTasks',
            Item: newTask
        }));

        res.status(201).json({ message: 'Task submitted successfully', taskId });
    } catch (error) {
        console.error('Error submitting task:', error);
        res.status(500).json({ error: 'Failed to submit task' });
    }
});

// Get All Tasks (Admin)
router.get('/all', async (req, res) => {
    try {
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'WorkTasks'
        }));
        const sorted = (data.Items || []).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// Get Employee Tasks
router.get('/employee/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'WorkTasks',
            FilterExpression: 'employeeId = :eid',
            ExpressionAttributeValues: { ':eid': employeeId }
        }));
        const sorted = (data.Items || []).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (error) {
        console.error('Error fetching employee tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// Update Task Status
router.put('/update-status/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status, remarks } = req.body;

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'WorkTasks',
            Key: { taskId },
            UpdateExpression: 'set #s = :status, remarks = :remarks',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
                ':status': status,
                ':remarks': remarks || ""
            }
        }));

        res.json({ message: 'Task updated successfully' });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

module.exports = router;
