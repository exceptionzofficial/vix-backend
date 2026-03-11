const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { RekognitionClient } = require("@aws-sdk/client-rekognition");
require("dotenv").config();

const config = {
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const ddbClient = new DynamoDBClient(config);
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const rekognitionClient = new RekognitionClient(config);

module.exports = { ddbClient, ddbDocClient, rekognitionClient };
