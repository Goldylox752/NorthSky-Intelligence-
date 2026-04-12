/* ================= IMPORTS ================= */
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const LRU = require("lru-cache");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= PLANS (SAAS CORE) ================= */
const PLANS = {
  free: { limit: 30 },
  pro: { limit: 300 },
  elite: { limit: 2000 }
};

/* ================= SIMPLE API KEY DB ================= */
const keys = {
  "demo_key": { plan: "free", used: 0, reset: Date.now() }
};

/* ================= USAGE STORE ================= */
function checkKey(key) {
  if (!keys[key]) return null;

  const user = keys[key];
  const now = Date.now();

  // reset every hour
  if (now - user.reset > 3600000) {
    user.used = 0;
    user.reset = now;
  }

  const limit = PLANS[user.plan].limit;

  if (user.used >= limit) return { ok: false, reason: "limit_reached" };

  user.used++;
  return { ok: true, user };
}

/* ================= CACHE ================= */
const cache = new LRU({
  max: 2000,
  ttl: 1000 * 60 * 60 * 3
});

/* ================= TIMEOUT ================= */
function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))
  ]);
}

/* ================= SAFE SEND ================= */
const send = (res, data) => {
  if (!res.headersSent) res.json(data);
};

/* ================= FETCH ================= */
async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 6000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36"
      }
    });
    return data;
  } catch {
    return null;
  }
}

/* ================= PARSER ================= */
function parse(html, url) {
  const $ = cheerio.load(html);

  const pick = (s) => $(s).attr("content");

  const title =
    pick("meta[property='og:title']") ||
    $("title").text() ||
    "Untitled";

  const description =
    pick("meta[property='og:description']") ||
    $("meta[name='description']").attr("content") ||
    $("p").first().text().slice(0, 200) ||
    "";

  const image =
    pick("meta[property='og:image']") ||
    null;

  const site = new URL(url).hostname.replace("www.", "");

  return {
    title: title.trim(),
    description: description.trim(),
    image,
    site,
    favicon: `https://${site}/favicon.ico`
  };
}

/* ================= FALLBACK ================= */
function fallback(html, url) {
  const $ = cheerio.load(html);
  $("script,style,noscript").remove();

  const text = $("body").text().replace(/\s+/g, " ").trim();

  const site = new URL(url).hostname.replace("www.", "");

  return {
    title: $("title").text().slice(0, 80) || "Untitled",
    description: text.slice(0, 200) || "No description",
    image: null,
    site,
    favicon: `https://${site}/favicon.ico`
  };
}

/* ================= ENGINE ================= */
async function engine(url) {
  const html = await fetchHTML(url);

  if (!html) {
    return { success: false, error: "fetch_failed" };
  }

  let meta = parse(html, url);

  if (!meta.title || meta.title.length < 3) {
    meta = fallback(html, url);
  }

  return {
    success: true,
    metadata: meta
  };
}

/* ================= ROUTE ================= */
app.get("/api/rip", async (req, res) => {
  let { url, key } = req.query;

  if (!url || !key) {
    return send(res, {
      success: false,
      error: "missing_url_or_key"
    });
  }

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  /* ================= AUTH ================= */
  const auth = checkKey(key);
  if (!auth) {
    return send(res, {
      success: false,
      error: "invalid_key"
    });
  }

  if (!auth.ok) {
    return send(res, {
      success: false,
      error: auth.reason
    });
  }

  /* ================= CACHE ================= */
  const cacheKey = crypto.createHash("md5").update(url).digest("hex");

  const cached = cache.get(cacheKey);
  if (cached) return send(res, cached);

  try {
    const result = await withTimeout(engine(url), 10000);

    const response = {
      ...result,
      keyUsage: {
        plan: auth.user.plan,
        used: auth.user.used,
        limit: PLANS[auth.user.plan].limit
      }
    };

    cache.set(cacheKey, response);

    send(res, response);
  } catch {
    send(res, {
      success: true,
      mode: "timeout_fallback",
      metadata: {
        title: "Slow page",
        description: "Fallback response generated",
        image: null,
        site: "unknown",
        favicon: null
      }
    });
  }
});

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("💼 SAAS MODE API LIVE");
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`💼 SAAS MODE running on port ${PORT}`);
});