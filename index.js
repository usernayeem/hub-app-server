require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const app = express();

// Enable CORS
app.use(cors());

// Parse JSON request body
app.use(express.json());

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGO_DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Global variables to hold collections
let db;
let downloadInfoCollection;
let totalDownloadCollection;
let isConnected = false;

// Connect to MongoDB
async function connectToDatabase() {
  if (isConnected) {
    return;
  }

  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");

    db = client.db("hub-app-db");
    downloadInfoCollection = db.collection("downloadInfo");
    totalDownloadCollection = db.collection("totalDownload");

    // Initialize total download counter if it doesn't exist
    const counterDoc = await totalDownloadCollection.findOne({
      _id: "counter",
    });
    if (!counterDoc) {
      const existingCount = await downloadInfoCollection.countDocuments();
      await totalDownloadCollection.insertOne({
        _id: "counter",
        count: existingCount,
      });
    }

    isConnected = true;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

// Initialize database connection
connectToDatabase().catch(console.error);

// GET /totaldownloads - Fetch all app download counts
app.get("/totaldownloads", async (req, res) => {
  try {
    await connectToDatabase();

    // Get all app-specific counters
    const appCounters = await totalDownloadCollection
      .find({ _id: { $ne: "counter" } })
      .toArray();

    // Transform to object format: { "hub-mobile": 150, "hub-library": 75 }
    const downloadCounts = {};
    appCounters.forEach((app) => {
      downloadCounts[app._id] = app.count || 0;
    });

    res.json(downloadCounts);
  } catch (error) {
    console.error("Error fetching download counts:", error);
    res.status(500).json({ error: "Failed to fetch download counts" });
  }
});

// GET /totaldownloads/:appId - Fetch download count for specific app
app.get("/totaldownloads/:appId", async (req, res) => {
  try {
    await connectToDatabase();

    const { appId } = req.params;
    const appCounter = await totalDownloadCollection.findOne({
      _id: appId,
    });
    const totalDownloadCount = appCounter ? appCounter.count : 0;
    res.json({ totalDownloadCount });
  } catch (error) {
    console.error("Error fetching download count:", error);
    res.status(500).json({ error: "Failed to fetch download count" });
  }
});

// POST /totaldownloads/:appId - Track new download for specific app
app.post("/totaldownloads/:appId", async (req, res) => {
  try {
    await connectToDatabase();

    const { appId } = req.params;
    const { userAgent } = req.body;

    // Store download record
    await downloadInfoCollection.insertOne({
      appId,
      userAgent: userAgent || "Unknown",
      ip: req.ip || req.connection.remoteAddress,
      createdAt: new Date(),
    });

    // Increment app-specific counter
    const result = await totalDownloadCollection.findOneAndUpdate(
      { _id: appId },
      { $inc: { count: 1 } },
      { returnDocument: "after", upsert: true }
    );

    // Also increment global counter
    await totalDownloadCollection.findOneAndUpdate(
      { _id: "counter" },
      { $inc: { count: 1 } },
      { upsert: true }
    );

    res.json({
      success: true,
      totalDownloadCount: result.value.count,
      message: "Download tracked successfully",
    });
  } catch (error) {
    console.error("Error tracking download:", error);
    res.status(500).json({ error: "Failed to track download" });
  }
});

// POST /totaldownloads - Track new download
app.post("/totaldownloads", async (req, res) => {
  try {
    await connectToDatabase();

    const { userAgent } = req.body;

    // Store download record
    await downloadInfoCollection.insertOne({
      userAgent: userAgent || "Unknown",
      ip: req.ip || req.connection.remoteAddress,
      createdAt: new Date(),
    });

    // Increment counter
    const result = await totalDownloadCollection.findOneAndUpdate(
      { _id: "counter" },
      { $inc: { count: 1 } },
      { returnDocument: "after" }
    );

    res.json({
      success: true,
      totalDownloadCount: result.value.count,
      message: "Download tracked successfully",
    });
  } catch (error) {
    console.error("Error tracking download:", error);
    res.status(500).json({ error: "Failed to track download" });
  }
});

// Example route
app.get("/", (req, res) => {
  res.json({ message: "Hello hub softwares server" });
});

// For local development
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel serverless functions
module.exports = app;
