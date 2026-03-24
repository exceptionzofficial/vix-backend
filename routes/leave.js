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
        const requests = data.Items || [];

        // Fetch all employees to get balances
        const employeesData = await ddbDocClient.send(new ScanCommand({
            TableName: 'Employees'
        }));
        const employees = employeesData.Items || [];
        const employeeMap = {};
        
        employees.forEach(e => {
            employeeMap[e.employeeId] = e.leaveBalances || { CL: 4, SL: 4, 'EL-PL': 4, LOP: 99 };
        });

        console.log('Employee Balance Map:', JSON.stringify(employeeMap, null, 2));

        const sorted = requests
            .map(r => ({
                ...r,
                leaveBalances: employeeMap[r.employeeId] || { CL: 4, SL: 4, 'EL-PL': 4, LOP: 99 }
            }))
            .sort((a, b) => b.timestamp - a.timestamp);

        res.json(sorted);
    } catch (error) {
        console.error('Error fetching all requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

// Get Leave Balances for an Employee
router.get('/balances/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { Item } = await ddbDocClient.send(new GetCommand({
            TableName: 'Employees',
            Key: { employeeId }
        }));

        if (!Item) return res.status(404).json({ error: 'Employee not found' });
        
        // Default balances if not present
        const balances = Item.leaveBalances || {
            CL: 4,
            SL: 4,
            'EL-PL': 4,
            LOP: 99
        };

        res.json(balances);
    } catch (error) {
        console.error('Error fetching balances:', error);
        res.status(500).json({ error: 'Failed to fetch balances' });
    }
});

// Update Leave Balance manually (Admin)
router.put('/update-balance', async (req, res) => {
    try {
        const { employeeId, leaveType, newBalance } = req.body;
        
        if (!employeeId || !leaveType || newBalance === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Fetch current balances first to avoid path errors
        const { Item: employee } = await ddbDocClient.send(new GetCommand({
            TableName: 'Employees',
            Key: { employeeId }
        }));

        const balances = (employee && employee.leaveBalances) ? employee.leaveBalances : { CL: 4, SL: 4, 'EL-PL': 4, LOP: 99 };

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'Employees',
            Key: { employeeId },
            UpdateExpression: 'set leaveBalances = :lb',
            ExpressionAttributeValues: { 
                ':lb': {
                    ...balances,
                    [leaveType]: Number(newBalance)
                }
            }
        }));

        res.json({ message: 'Balance updated successfully' });
    } catch (error) {
        console.error('Error updating balance:', error);
        res.status(500).json({ error: 'Failed to update balance' });
    }
});

// Update Request Status (Admin: Approved/Rejected)
router.put('/update-status/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { status, adminComment } = req.body;

        // 1. Get the original request to check type and employee
        const { Item: request } = await ddbDocClient.send(new GetCommand({
            TableName: 'LeaveRequests',
            Key: { requestId }
        }));

        if (!request) return res.status(404).json({ error: 'Request not found' });

        // 2. Adjust Balance (Decrement if Approving, Increment if Revoking)
        const isApproving = status === 'Approved' && request.status !== 'Approved';
        const isRevoking = request.status === 'Approved' && status !== 'Approved';

        if (request.type === 'Leave' && (isApproving || isRevoking)) {
            const { employeeId, leaveType, startDate, endDate, duration } = request;
            
            let daysToAdjust = 0;
            if (duration === 'Half Day') {
                daysToAdjust = 0.5;
            } else {
                const start = new Date(startDate);
                const end = new Date(endDate);
                const diffTime = Math.abs(end - start);
                daysToAdjust = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            }

            // Get current balance
            const { Item: employee } = await ddbDocClient.send(new GetCommand({
                TableName: 'Employees',
                Key: { employeeId }
            }));

            if (employee && leaveType !== 'LOP') {
                const balances = employee.leaveBalances || { CL: 4, SL: 4, 'EL-PL': 4, LOP: 99 };
                const currentBalance = balances[leaveType] || 0;
                
                // If approving: subtract. If revoking: add.
                const newBalance = isApproving 
                    ? Math.max(0, currentBalance - daysToAdjust)
                    : currentBalance + daysToAdjust;
                
                await ddbDocClient.send(new UpdateCommand({
                    TableName: 'Employees',
                    Key: { employeeId },
                    UpdateExpression: 'set leaveBalances = :lb',
                    ExpressionAttributeValues: { 
                        ':lb': {
                            ...balances,
                            [leaveType]: newBalance
                        }
                    }
                }));
            }
        }

        // 3. Update the request status
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
