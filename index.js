const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { HttpsProxyAgent } = require('https-proxy-agent');

const metascraper = require('metascraper')([
  require('metascraper-title')(),
  require('metascraper-description')(),
  require('metascraper-image')()
]);

const app = express();

/* ================= CORE SETUP ================= */
app.use(cors());
app.set('trust proxy', true); // ✅ IMPORTANT (real IP on Render)

/* ================= USAGE LIMIT ================= */
const usage = {};

function checkUsage(req, res, next) {
  const ip = req.ip; // ✅ FIXED (better than headers)

  usage[ip] = (usage[ip] || 0) + 1;

  if (usage[ip] > 50) {
    return res.status(403).json({
      success: false,
      error: "Upgrade required"
    });
  }

  next();
}

/* APPLY LIMIT TO API ONLY */
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

/* ================= FREE PROXIES ================= */
const proxies = [
  "http://103.149.162.194:80",
  "http://51.158.68.68:8811",
  "http://163.172.33.137:80"
];

function getProxy() {
  return proxies[Math.floor(Math.random() * proxies.length)];
}

/* ================= FETCH HTML ================= */
async function fetchHTML(url) {

  // 1️⃣ NORMAL
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9"
      },
      timeout: 10000
    });

    return data;
  } catch (e) {
    console.log("⚠️ Normal failed:", e.message);
  }

  // 2️⃣ FREE PROXY
  try {
    const proxy = getProxy();
    const agent = new HttpsProxyAgent(proxy);

    const { data } = await axios.get(url, {
      httpsAgent: agent,
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000
    });

    return data;
  } catch (e) {
    console.log("⚠️ Proxy failed:", e.message);
  }

  // 3️⃣ PAID PROXY
  if (process.env.SCRAPER_API_KEY) {
    try {
      const proxyURL = `https://api.zenrows.com/v1/?apikey=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(proxyURL);
      return data;
    } catch {
      console.log("⚠️ Paid proxy failed");
    }
  }

  return null;
}

/* ================= AI ================= */
async function runAI(metadata, url) {
  if (!openai) {
    // ✅ fallback even without OpenAI
    return {
      summary: "Basic content detected",
      hook: "Potential engaging content",
      target_audience: "General audience",
      monetization_angle: "Ads or products",
      viral_score: Math.floor(Math.random() * 10) + 1
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
Analyze this:

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
      summary: "AI fallback analysis",
      hook: "Likely engaging topic",
      target_audience: "Online users",
      monetization_angle: "Ads / affiliate",
      viral_score: Math.floor(Math.random() * 10) + 1
    };
  }
}

/* ================= RIP ROUTE ================= */
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
      } catch {
        console.log("⚠️ metascraper failed");
      }
    }

    const screenshot = `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`;

    const analysis = await runAI(metadata, url);

    return res.json({
      success: true,
      scraped,
      metadata,
      screenshot,
      analysis
    });

  } catch (err) {
    console.log("❌ ERROR:", err.message);

    return res.status(500).json({
      success: false,
      error: "Server failure",
      debug: err.message
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

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;