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

async function run() {
  try {
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const db = client.db("hub-app-db");
    const downloadInfoCollection = db.collection("downloadInfo");
    const totalDownloadCollection = db.collection("totalDownload");

    // Initialize total download counter if it doesn't exist
    const initializeCounter = async () => {
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
    };

    await initializeCounter();

    // GET /totaldownloads - Fetch current download count
    app.get("/totaldownloads", async (req, res) => {
      try {
        const counterDoc = await totalDownloadCollection.findOne({
          _id: "counter",
        });
        const totalDownloadCount = counterDoc ? counterDoc.count : 0;
        res.json({ totalDownloadCount });
      } catch (error) {
        console.error("Error fetching download count:", error);
        res.status(500).json({ error: "Failed to fetch download count" });
      }
    });

    // POST /totaldownloads - Track new download
    app.post("/totaldownloads", async (req, res) => {
      try {
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
      res.json({ message: "Hello hub app server" });
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

// Get port from .env or fallback to 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
