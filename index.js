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
  console.error("UNHANDLED:", err);
});
process.on("uncaughtException", (err) => {
  console.error("CRASH:", err);
});

/* ================= CACHE ================= */
const cache = {};
const CACHE_TIME = 1000 * 60 * 30;

/* ================= RATE LIMIT ================= */
const usage = {};
app.use("/api/", (req, res, next) => {
  const ip = req.ip;
  usage[ip] = (usage[ip] || 0) + 1;

  if (usage[ip] > 100) {
    return res.status(429).json({ success: false, error: "Rate limit" });
  }

  next();
});

/* ================= PLATFORM DETECTION ================= */
function detectPlatform(url) {
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  return "web";
}

/* ================= SOCIAL HANDLERS ================= */

async function handleTikTok(url) {
  try {
    const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(api, { timeout: 10000 });

    if (!data || !data.data) return null;

    return {
      title: data.data.title,
      description: data.data.title,
      image: data.data.cover,
      video: data.data.play,
      author: data.data.author?.nickname,
      platform: "tiktok",
    };
  } catch {
    return null;
  }
}

async function handleInstagram(url) {
  try {
    const api = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(api, { timeout: 10000 });

    const match = data.match(/"og:image" content="(.*?)"/);

    return {
      title: "Instagram Post",
      description: "Instagram content",
      image: match?.[1] || null,
      platform: "instagram",
    };
  } catch {
    return null;
  }
}

async function handleYouTube(url) {
  try {
    const { data } = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );

    return {
      title: data.title,
      description: data.author_name,
      image: data.thumbnail_url,
      platform: "youtube",
    };
  } catch {
    return null;
  }
}

/* ================= FETCH HTML ================= */
async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 8000,
    });

    console.log("✅ Direct fetch");
    return data;
  } catch {
    console.log("❌ Direct failed");
  }

  try {
    const proxyURL = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxyURL, { timeout: 12000 });

    console.log("🟡 Proxy fetch");
    return data;
  } catch {
    console.log("❌ Proxy failed");
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

// Root
app.get("/", (req, res) => {
  res.send("🚀 NorthSky API (Smart + Social Ready)");
});

// Test
app.get("/api/test", (req, res) => {
  res.json({ success: true });
});

// Main API
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
    /* ================= SOCIAL BYPASS ================= */
    const platform = detectPlatform(url);

    if (platform !== "web") {
      let result = null;

      if (platform === "tiktok") result = await handleTikTok(url);
      if (platform === "instagram") result = await handleInstagram(url);
      if (platform === "youtube") result = await handleYouTube(url);

      if (result) {
        const response = {
          success: true,
          platform,
          metadata: result,
        };

        cache[url] = {
          data: response,
          timestamp: Date.now(),
        };

        return res.json(response);
      }

      console.log("⚠️ Social fallback failed → trying web scrape");
    }

    /* ================= NORMAL SCRAPE ================= */
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

      console.log("✅ Metadata scraped");
    } catch {
      console.log("⚠️ metascraper failed");
    }

    const responseData = {
      success: true,
      platform: "web",
      metadata,
      screenshot: `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`,
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