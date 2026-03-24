const { ddbClient } = require("../config/awsConfig");
const { CreateTableCommand, DescribeTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");

const tables = [
  {
    TableName: "Employees",
    KeySchema: [{ AttributeName: "employeeId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "employeeId", AttributeType: "S" }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: "AttendanceLogs",
    KeySchema: [
        { AttributeName: "employeeId", KeyType: "HASH" },
        { AttributeName: "timestamp", KeyType: "RANGE" }
    ],
    AttributeDefinitions: [
        { AttributeName: "employeeId", AttributeType: "S" },
        { AttributeName: "timestamp", AttributeType: "N" }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: "GeofenceRules",
    KeySchema: [{ AttributeName: "ruleId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "ruleId", AttributeType: "S" }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: "LeaveRequests",
    KeySchema: [{ AttributeName: "requestId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "requestId", AttributeType: "S" }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: "WorkTasks",
    KeySchema: [{ AttributeName: "taskId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "taskId", AttributeType: "S" }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: "Expenses",
    KeySchema: [{ AttributeName: "expenseId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "expenseId", AttributeType: "S" }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: "PersonalRequests",
    KeySchema: [{ AttributeName: "requestId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "requestId", AttributeType: "S" }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  }
];

const initTables = async () => {
  console.log("Checking DynamoDB tables...");
  try {
    const { TableNames } = await ddbClient.send(new ListTablesCommand({}));

    for (const table of tables) {
      console.log(`Checking table: ${table.TableName}`);
      if (!TableNames.includes(table.TableName)) {
        console.log(`Creating table ${table.TableName}...`);
        await ddbClient.send(new CreateTableCommand(table));
        console.log(`Table ${table.TableName} created successfully.`);
      } else {
        console.log(`Table ${table.TableName} already exists.`);
      }
    }
    console.log("DynamoDB initialization complete.");
  } catch (error) {
    console.error("Error initializing DynamoDB tables:", error);
  }
};

module.exports = initTables;
