/* ================= IMPORTS ================= */
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const metascraper = require("metascraper")([
  require("metascraper-title")(),
  require("metascraper-description")(),
  require("metascraper-image")(),
]);

/* ================= INIT ================= */
const app = express();
app.use(cors());
app.set("trust proxy", true);

/* ================= ERROR LOGGING ================= */
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

/* ================= CACHE ================= */
const cache = {};
const CACHE_TIME = 1000 * 60 * 30;

/* ================= RATE LIMIT ================= */
const usage = {};

function checkUsage(req, res, next) {
  const ip = req.ip;
  usage[ip] = (usage[ip] || 0) + 1;

  if (usage[ip] > 100) {
    return res.status(403).json({
      success: false,
      error: "Rate limit hit",
    });
  }

  next();
}

app.use("/api/", checkUsage);

/* ================= FETCH HTML ================= */
async function fetchHTML(url) {
  // 1️⃣ Direct request (fast)
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 8000,
    });

    console.log("✅ Direct fetch worked");
    return data;
  } catch (err) {
    console.log("❌ Direct failed:", err.message);
  }

  // 2️⃣ Proxy fallback
  try {
    const proxyURL = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      url
    )}`;

    const { data } = await axios.get(proxyURL, {
      timeout: 12000,
    });

    console.log("🟡 Proxy worked");
    return data;
  } catch (err) {
    console.log("❌ Proxy failed:", err.message);
  }

  return null;
}

/* ================= SAFE FETCH ================= */
async function safeFetch(url) {
  return Promise.race([
    fetchHTML(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 15000)
    ),
  ]);
}

/* ================= ROUTES ================= */

// Root (so no "Not Found")
app.get("/", (req, res) => {
  res.send("🚀 NorthSky API running (no puppeteer)");
});

// Test route
app.get("/api/test", (req, res) => {
  res.json({ success: true });
});

// Main scraper
app.get("/api/rip", async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "URL required",
    });
  }

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  console.log("🔍", url);

  // Cache
  const cached = cache[url];
  if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
    console.log("⚡ Cache hit");
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const html = await safeFetch(url);

    if (!html) {
      return res.json({
        success: false,
        error: "Failed to fetch site",
      });
    }

    let metadata = {
      title: "Unknown",
      description: "No description",
      image: null,
    };

    try {
      const data = await metascraper({ html, url });

      metadata = {
        title: data.title || metadata.title,
        description: data.description || metadata.description,
        image: data.image || null,
      };

      console.log("✅ Scraped metadata");
    } catch (err) {
      console.log("⚠️ metascraper failed:", err.message);
    }

    const responseData = {
      success: true,
      metadata,
      screenshot: `https://image.thum.io/get/fullpage/${encodeURIComponent(
        url
      )}`,
    };

    cache[url] = {
      data: responseData,
      timestamp: Date.now(),
    };

    return res.json(responseData);
  } catch (err) {
    console.log("❌ ERROR:", err.message);

    return res.json({
      success: false,
      error: err.message,
    });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Running on ${PORT}`);
});

module.exports = app;