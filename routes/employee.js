const express = require('express');
const router = express.Router();
const { ddbDocClient } = require('../config/awsConfig');
const { PutCommand, GetCommand, ScanCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Add New Employee
router.post('/add', async (req, res) => {
    try {
        const { employeeId, pin, name, email, role, department, faceId, documents, phone, location } = req.body;
        
        // Ensure ID and PIN are provided
        if (!employeeId || !pin) {
            return res.status(400).json({ error: 'Employee ID and PIN are required' });
        }

        const newEmployee = {
            employeeId, // Use provided ID
            pin,        // Store PIN (plain text for now as per simple demo request, or bcrypt later)
            name,
            email,
            phone,
            location,
            role,
            department,
            faceId: faceId || null, 
            documents: documents || [],
            leaveBalances: {
                CL: 1,
                SL: 1,
                'EL-PL': 1,
                LOP: 99
            },
            createdAt: new Date().toISOString()
        };

        await ddbDocClient.send(new PutCommand({
            TableName: 'Employees',
            Item: newEmployee
        }));

        res.status(201).json({ message: 'Employee added successfully', employeeId });
    } catch (error) {
        console.error('Error adding employee:', error);
        res.status(500).json({ error: 'Failed to add employee' });
    }
});

// Employee Login
router.post('/login', async (req, res) => {
    try {
        const { employeeId, pin } = req.body;

        const { Item } = await ddbDocClient.send(new GetCommand({
            TableName: 'Employees',
            Key: { employeeId }
        }));

        if (!Item) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        if (Item.pin !== pin) {
            return res.status(401).json({ error: 'Invalid PIN' });
        }

        // Return employee details + face registration status
        res.json({
            message: 'Login successful',
            employee: {
                employeeId: Item.employeeId,
                name: Item.name,
                role: Item.role,
                department: Item.department,
                isFaceRegistered: !!Item.faceId
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get All Employees
router.get('/all', async (req, res) => {
    try {
        const data = await ddbDocClient.send(new ScanCommand({
            TableName: 'Employees'
        }));
        res.json(data.Items);
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
});

// Get Single Employee
router.get('/:id', async (req, res) => {
    try {
        const { Item } = await ddbDocClient.send(new GetCommand({
            TableName: 'Employees',
            Key: { employeeId: req.params.id }
        }));

        if (!Item) return res.status(404).json({ error: 'Employee not found' });
        
        // Ensure leaveBalances exist (for older records)
        if (!Item.leaveBalances) {
            Item.leaveBalances = {
                CL: 1,
                SL: 1,
                'EL-PL': 1,
                LOP: 99
            };
        }
        res.json(Item);
    } catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({ error: 'Failed to fetch employee' });
    }
});

// Update Employee Details
router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { pin, name, email, role, department, phone, location } = req.body;

        await ddbDocClient.send(new UpdateCommand({
            TableName: 'Employees',
            Key: { employeeId: id },
            UpdateExpression: 'set pin = :p, #n = :name, email = :e, #r = :role, department = :d, phone = :ph, #l = :loc',
            ExpressionAttributeNames: {
                '#n': 'name',
                '#r': 'role',
                '#l': 'location'
            },
            ExpressionAttributeValues: {
                ':p': pin,
                ':name': name,
                ':e': email,
                ':role': role,
                ':d': department,
                ':ph': phone,
                ':loc': location
            }
        }));

        res.json({ message: 'Employee updated successfully' });
    } catch (error) {
        console.error('Update Error:', error);
        res.status(500).json({ error: 'Failed to update employee' });
    }
});

// Delete Employee
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await ddbDocClient.send(new DeleteCommand({
            TableName: 'Employees',
            Key: { employeeId: id }
        }));
        res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Delete Error:', error);
        res.status(500).json({ error: 'Failed to delete employee' });
    }
});

module.exports = router;
