/* ================= IMPORTS ================= */
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const metascraper = require("metascraper")([
  require("metascraper-title")(),
  require("metascraper-description")(),
  require("metascraper-image")(),
]);

const app = express();
app.use(cors());
app.set("trust proxy", true);

/* ================= CONFIG ================= */
const PORT = process.env.PORT || 3000;
const CACHE_TIME = 1000 * 60 * 20;

/* ================= CACHE ================= */
const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() - item.t > CACHE_TIME) {
    cache.delete(key);
    return null;
  }

  return item.d;
}

function setCache(key, data) {
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }

  cache.set(key, { d: data, t: Date.now() });
}

/* ================= USER AGENTS ================= */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
  "Mozilla/5.0 (Linux; Android 12)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
];

function getHeaders() {
  return {
    "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    "Accept-Language": "en-US,en;q=0.9"
  };
}

/* ================= PLATFORM DETECT ================= */
function detectPlatform(url) {
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  return "web";
}

/* ================= FETCH LAYERS ================= */
async function fetchDirect(url) {
  try {
    const { data } = await axios.get(url, {
      headers: getHeaders(),
      timeout: 7000
    });
    return data;
  } catch {
    return null;
  }
}

async function fetchProxy(url) {
  try {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxy, {
      headers: getHeaders(),
      timeout: 9000
    });
    return data;
  } catch {
    return null;
  }
}

function needsBrowser(html) {
  if (!html) return true;

  const blocked = [
    "captcha",
    "enable javascript",
    "access denied",
    "verify you are human"
  ];

  return (
    html.length < 1200 ||
    blocked.some(x => html.toLowerCase().includes(x))
  );
}

/* ================= BROWSER FALLBACK ================= */
async function fetchWithBrowser(url) {
  try {
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    const html = await page.content();

    await browser.close();

    return html;
  } catch (e) {
    return null;
  }
}

/* ================= SMART FETCH ENGINE ================= */
async function smartFetch(url) {
  let html = await fetchDirect(url);

  if (!html) {
    html = await fetchProxy(url);
  }

  if (needsBrowser(html)) {
    html = await fetchWithBrowser(url);
  }

  return html;
}

/* ================= API ROUTE ================= */
app.get("/api/rip", async (req, res) => {
  try {
    let { url } = req.query;
    if (!url) return res.json({ success: false });

    if (!url.startsWith("http")) {
      url = "https://" + url;
    }

    /* CACHE */
    const cached = getCache(url);
    if (cached) {
      return res.json(cached);
    }

    const platform = detectPlatform(url);

    let data = null;

    /* PLATFORM LOGIC */
    if (platform === "youtube") {
      const { data: yt } = await axios.get(
        `https://www.youtube.com/oembed?url=${url}&format=json`
      );

      data = {
        title: yt.title,
        image: yt.thumbnail_url,
        author: yt.author_name
      };
    }

    /* WEB FALLBACK */
    if (!data) {
      const html = await smartFetch(url);

      let meta = { title: "Unknown" };

      if (html) {
        try {
          const m = await metascraper({ html, url });
          meta = {
            title: m.title,
            description: m.description,
            image: m.image
          };
        } catch {}
      }

      data = meta;
    }

    const response = {
      success: true,
      platform,
      metadata: data
    };

    setCache(url, response);

    res.json(response);
  } catch (e) {
    res.json({
      success: false,
      error: e.message
    });
  }
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});