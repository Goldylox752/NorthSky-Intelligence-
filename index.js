const express = require('express');
const axios = require('axios');
const cors = require('cors');

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
  console.log("No OpenAI key");
}

/* ================= HELPERS ================= */
async function fetchHTML(url) {
  // 1️⃣ TRY NORMAL
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
    console.log("Normal scrape failed");
  }

  // 2️⃣ TRY PROXY (ZenRows example)
  try {
    const proxyURL = `https://api.zenrows.com/v1/?apikey=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`;

    const { data } = await axios.get(proxyURL, { timeout: 15000 });

    return data;
  } catch (e) {
    console.log("Proxy scrape failed");
  }

  return null;
}

/* ================= AI ================= */
async function runAI(metadata, url) {
  if (!openai) return null;

  try {
    const prompt = `
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
}
`;

    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: prompt }
      ]
    });

    return JSON.parse(ai.choices[0].message.content);

  } catch (e) {
    console.log("AI failed:", e.message);
    return null;
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

  // FIX URL
  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  try {
    const html = await fetchHTML(url);

    let metadata = {
      title: "Unknown Page",
      description: "No data available",
      image: null
    };

    let scraped = false;

    if (html) {
      try {
        metadata = await metascraper({ html, url });
        scraped = true;
      } catch {}
    }

    // 🧠 ALWAYS RUN AI (even if scrape fails)
    const analysis = await runAI(metadata, url);

    return res.json({
      success: true,
      scraped,
      metadata,
      analysis
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Total failure"
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

  } catch {
    res.status(500).json({ success: false });
  }
});

module.exports = app;