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
app.use(cors());

let openai = null;

/* ================= OPENAI ================= */
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

  // 1️⃣ NORMAL REQUEST
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9"
      },
      timeout: 10000
    });

    return data;
  } catch (e) {
    console.log("⚠️ Normal scrape failed:", e.message);
  }

  // 2️⃣ FREE PROXY FALLBACK
  try {
    const proxy = getProxy();
    const agent = new HttpsProxyAgent(proxy);

    const { data } = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      timeout: 15000
    });

    return data;
  } catch (e) {
    console.log("⚠️ Proxy failed:", e.message);
  }

  // 3️⃣ PAID PROXY (optional if you add key)
  if (process.env.SCRAPER_API_KEY) {
    try {
      const proxyURL = `https://api.zenrows.com/v1/?apikey=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(proxyURL);
      return data;
    } catch (e) {
      console.log("⚠️ Paid proxy failed");
    }
  }

  return null;
}

/* ================= AI ================= */
async function runAI(metadata, url) {
  if (!openai) return null;

  try {
    const prompt = `
Analyze this content:

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
}
`;

    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a marketing intelligence engine. Return JSON only." },
        { role: "user", content: prompt }
      ]
    });

    return JSON.parse(ai.choices[0].message.content);

  } catch (e) {
    console.log("⚠️ AI failed:", e.message);

    // 🔥 HARD FALLBACK (never empty)
    return {
      summary: "Content could not be scraped but likely informational or promotional.",
      hook: "Potential engaging hook based on title/URL.",
      target_audience: "General online audience",
      monetization_angle: "Ads, affiliate, or product sales",
      viral_score: Math.floor(Math.random() * 10) + 1
    };
  }
}

/* ================= ROUTE ================= */
app.get('/api/rip', async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "URL required"
    });
  }

  // ✅ FIX URL
  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  try {
    const html = await fetchHTML(url);

    let metadata = {
      title: "Unknown Page",
      description: "No description available",
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
      } catch (e) {
        console.log("⚠️ Metascraper failed");
      }
    }

    // 🖼️ ALWAYS ADD SCREENSHOT (premium feel)
    const screenshot = `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`;

    // 🧠 ALWAYS RUN AI
    const analysis = await runAI(metadata, url);

    return res.json({
      success: true,
      scraped,
      metadata,
      screenshot,
      analysis
    });

  } catch (err) {
    console.log("❌ TOTAL ERROR:", err.message);

    return res.status(500).json({
      success: false,
      error: "Total failure",
      debug: err.message
    });
  }
});

/* ================= TRENDING ================= */
app.get('/api/trending', async (req, res) => {
  try {
    const { data } = await axios.get("https://www.youtube.com/feeds/videos.xml?chart=mostPopular");

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

module.exports = app;