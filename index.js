const express = require("express");
const Redis = require("ioredis");
const { Queue } = require("bullmq");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

const connection = new Redis(process.env.REDIS_URL);
const scrapeQueue = new Queue("scrapeQueue", { connection });

/* SIMPLE CACHE FIRST */
app.get("/api/rip", async (req, res) => {
  try {
    let { url } = req.query;
    if (!url) return res.json({ error: "no_url" });

    if (!url.startsWith("http")) url = "https://" + url;

    const key = crypto.createHash("md5").update(url).digest("hex");

    // 1. check cache
    const cached = await connection.get(key);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // 2. enqueue job (NON-BLOCKING)
    const job = await scrapeQueue.add("scrape", { url, key });

    // 3. return job id immediately (FAST API)
    return res.json({
      success: true,
      jobId: job.id,
      status: "processing"
    });

  } catch (e) {
    res.json({ success: false, error: "server_error" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 API SERVER RUNNING");
});