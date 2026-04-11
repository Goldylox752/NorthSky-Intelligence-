const express = require('express');
const axios = require('axios');
const cors = require('cors');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const metascraper = require('metascraper')([
  require('metascraper-title')(),
  require('metascraper-description')(),
  require('metascraper-image')()
]);

const app = express();

/* ================= CORE ================= */
app.use(cors());
app.set('trust proxy', true);

/* ================= CACHE ================= */
const cache = {};
const CACHE_TIME = 1000 * 60 * 30;

/* ================= USAGE ================= */
const usage = {};

function checkUsage(req, res, next) {
  const ip = req.ip;

  usage[ip] = (usage[ip] || 0) + 1;

  if (usage[ip] > 50) {
    return res.status(403).json({
      success: false,
      error: "Upgrade required",
      upgrade: true
    });
  }

  next();
}

app.use('/api/', checkUsage);

/* ================= OPENAI ================= */
let openai = null;

try {
  const OpenAI = require("openai");
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} catch {
  console.log("❌ No OpenAI key");
}

/* ================= PUPPETEER ================= */
async function fetchWithBrowser(url) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0");

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 25000
    });

    const html = await page.content();

    console.log("🟢 Puppeteer worked");
    return html;

  } catch (e) {
    console.log("🔴 Puppeteer failed:", e.message);
    return null;

  } finally {
    if (browser) await browser.close();
  }
}

/* ================= FETCH HTML ================= */
async function fetchHTML(url) {

  // 1️⃣ FAST REQUEST
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 8000
    });

    console.log("✅ Normal worked");
    return data;

  } catch {
    console.log("❌ Normal failed");
  }

  // 2️⃣ PROXY
  try {
    const proxyURL = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxyURL, { timeout: 12000 });

    console.log("🟡 Proxy worked");
    return data;

  } catch {
    console.log("❌ Proxy failed");
  }

  // 3️⃣ PUPPETEER (REAL BROWSER)
  const browserHTML = await fetchWithBrowser(url);

  if (browserHTML) return browserHTML;

  return null;
}

/* ================= AI ================= */
async function runAI(metadata, url) {

  if (!openai) {
    return {
      summary: `Content from ${url}`,
      hook: "Likely engaging content",
      target_audience: "Online users",
      monetization_angle: "Ads / affiliate",
      viral_score: Math.floor(Math.random() * 5) + 5
    };
  }

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON."
        },
        {
          role: "user",
          content: `
Analyze:

URL: ${url}
Title: ${metadata.title}
Description: ${metadata.description}

Return JSON:
{
  "summary": "...",
  "hook": "...",
  "target_audience": "...",
  "monetization_angle": "...",
  "viral_score": 1-10
}`
        }
      ]
    });

    return JSON.parse(ai.choices[0].message.content);

  } catch (e) {
    console.log("⚠️ AI failed:", e.message);

    return {
      summary: "Fallback analysis",
      hook: "Likely engaging topic",
      target_audience: "Online users",
      monetization_angle: "Ads / affiliate",
      viral_score: Math.floor(Math.random() * 5) + 5
    };
  }
}

/* ================= RIP ================= */
app.get('/api/rip', async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "URL required"
    });
  }

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  console.log("🔍", url);

  /* CACHE */
  const cached = cache[url];
  if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
    console.log("⚡ Cache hit");
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const html = await fetchHTML(url);

    let metadata = {
      title: "Unknown Page",
      description: "No description",
      image: null
    };

    let scraped = false;

    if (html) {
      try {
        const data = await metascraper({ html, url });

        metadata = {
          title: data.title || metadata.title,
          description: data.description || metadata.description,
          image: data.image || null
        };

        scraped = true;
        console.log("✅ Scraped");

      } catch {
        console.log("⚠️ metascraper failed");
      }
    }

    const screenshot = `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`;

    const analysis = await runAI(metadata, url);

    const responseData = {
      success: true,
      scraped,
      metadata,
      screenshot,
      analysis
    };

    cache[url] = {
      data: responseData,
      timestamp: Date.now()
    };

    return res.json(responseData);

  } catch (err) {
    console.log("❌ ERROR:", err.message);

    return res.status(500).json({
      success: false,
      error: "Server failure"
    });
  }
});

/* ================= TRENDING ================= */
app.get('/api/trending', async (req, res) => {
  try {
    const { data } = await axios.get(
      "https://www.youtube.com/feeds/videos.xml?chart=mostPopular"
    );

    const videos = [...data.matchAll(/<entry>(.*?)<\/entry>/gs)].slice(0, 6);

    const results = videos.map(v => {
      const chunk = v[1];

      return {
        title: chunk.match(/<title>(.*?)<\/title>/)?.[1] || "Video",
        url: chunk.match(/href="(.*?)"/)?.[1]
      };
    });

    res.json({ success: true, results });

  } catch (e) {
    console.log("⚠️ Trending failed:", e.message);
    res.status(500).json({ success: false });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Running on ${PORT}`);
});

module.exports = app;