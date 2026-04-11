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
process.on("unhandledRejection", (err) => console.error("UNHANDLED:", err));
process.on("uncaughtException", (err) => console.error("CRASH:", err));

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
    const { data } = await axios.get(api, { timeout: 8000 });

    if (data?.data) {
      return {
        title: data.data.title,
        image: data.data.cover,
        video: data.data.play,
        download: data.data.play,
        author: data.data.author?.nickname,
        platform: "tiktok",
      };
    }
  } catch {
    console.log("❌ TikWM failed");
  }

  // fallback (prevents failure)
  return {
    title: "TikTok Video",
    platform: "tiktok",
  };
}

async function handleInstagram(url) {
  try {
    const api = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(api, { timeout: 8000 });

    const match = data.match(/"og:image" content="(.*?)"/);

    return {
      title: "Instagram Post",
      image: match?.[1] || null,
      platform: "instagram",
    };
  } catch {
    return { title: "Instagram Content", platform: "instagram" };
  }
}

async function handleYouTube(url) {
  try {
    const { data } = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { timeout: 8000 }
    );

    return {
      title: data.title,
      image: data.thumbnail_url,
      description: data.author_name,
      platform: "youtube",
    };
  } catch {
    return { title: "YouTube Video", platform: "youtube" };
  }
}

/* ================= FETCH HTML ================= */
async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 7000,
    });
    return data;
  } catch {}

  try {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxy, { timeout: 9000 });
    return data;
  } catch {}

  return null;
}

/* ================= SAFE FETCH (NEVER HANGS) ================= */
async function safeFetch(url) {
  try {
    return await Promise.race([
      fetchHTML(url),
      new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
    ]);
  } catch {
    return null;
  }
}

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.send("🚀 NorthSky API LIVE");
});

app.get("/api/test", (req, res) => {
  res.json({ success: true });
});

app.get("/api/rip", async (req, res) => {
  const timeout = setTimeout(() => {
    res.json({ success: false, error: "Timeout" });
  }, 12000);

  try {
    let { url } = req.query;

    if (!url) {
      clearTimeout(timeout);
      return res.status(400).json({ success: false, error: "URL required" });
    }

    if (!url.startsWith("http")) {
      url = "https://" + url;
    }

    console.log("🔍", url);

    // CACHE
    const cached = cache[url];
    if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
      clearTimeout(timeout);
      return res.json({ ...cached.data, cached: true });
    }

    /* ================= SOCIAL ================= */
    const platform = detectPlatform(url);
    let result = null;

    if (platform === "tiktok") result = await handleTikTok(url);
    if (platform === "instagram") result = await handleInstagram(url);
    if (platform === "youtube") result = await handleYouTube(url);

    if (result) {
      const response = {
        success: true,
        platform,
        metadata: result,
        video: result.video || null,
        download: result.download || null,
      };

      cache[url] = { data: response, timestamp: Date.now() };

      clearTimeout(timeout);
      return res.json(response);
    }

    /* ================= WEB SCRAPE ================= */
    const html = await safeFetch(url);

    let metadata = {
      title: "Unknown",
      description: "No description",
      image: null,
    };

    if (html) {
      try {
        const data = await metascraper({ html, url });
        metadata = {
          title: data.title || metadata.title,
          description: data.description || metadata.description,
          image: data.image || null,
        };
      } catch {}
    }

    const response = {
      success: true,
      platform: "web",
      metadata,
    };

    cache[url] = { data: response, timestamp: Date.now() };

    clearTimeout(timeout);
    return res.json(response);

  } catch (err) {
    clearTimeout(timeout);
    return res.json({ success: false, error: err.message });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Running on " + PORT);
});

module.exports = app;