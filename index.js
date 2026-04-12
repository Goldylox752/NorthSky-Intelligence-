/* ================= IMPORTS ================= */
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const LRU = require("lru-cache");

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CACHE (GOD MODE) ================= */
const cache = new LRU({
  max: 1000,
  ttl: 1000 * 60 * 60 * 2 // 2 hours
});

/* ================= TIMEOUT CORE ================= */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    )
  ]);
}

/* ================= SAFE RESPONSE ================= */
function safeSend(res, data) {
  if (!res.headersSent) res.json(data);
}

/* ================= FAST HEADERS ================= */
const headers = () => ({
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml"
});

/* ================= FETCH LAYERS ================= */
async function fetchHTML(url, timeout = 6000) {
  try {
    const { data } = await axios.get(url, {
      timeout,
      headers: headers(),
      maxRedirects: 5
    });
    return data;
  } catch {
    return null;
  }
}

/* ================= RETRY ENGINE ================= */
async function retry(fn, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (r) return r;
    } catch {}
  }
  return null;
}

/* ================= DOMAIN ================= */
function getDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}

/* ================= BEST IMAGE ================= */
function bestImage($, url) {
  return (
    $("meta[property='og:image']").attr("content") ||
    $("meta[name='twitter:image']").attr("content") ||
    $("img").first().attr("src") ||
    `${new URL(url).origin}/favicon.ico`
  );
}

/* ================= BEST TITLE ================= */
function bestTitle($) {
  return (
    $("meta[property='og:title']").attr("content") ||
    $("meta[name='twitter:title']").attr("content") ||
    $("title").text() ||
    $("h1").first().text() ||
    "No title"
  );
}

/* ================= BEST DESCRIPTION ================= */
function bestDescription($) {
  return (
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='twitter:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    $("p").first().text().slice(0, 220) ||
    ""
  );
}

/* ================= READABLE CONTENT ================= */
function bestText($) {
  $("script, style, noscript, iframe").remove();

  const paragraphs = $("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(t => t.length > 80);

  return paragraphs[0] || "";
}

/* ================= OG PARSER ================= */
function parseOG(html, url) {
  const $ = cheerio.load(html);

  return {
    title: bestTitle($),
    description: bestDescription($) || bestText($),
    image: bestImage($, url),
    site: getDomain(url),
    favicon: `${new URL(url).origin}/favicon.ico`
  };
}

/* ================= FALLBACK ENGINE ================= */
function fallback(html, url) {
  const $ = cheerio.load(html);

  $("script, style, noscript").remove();

  const text = $("body").text().replace(/\s+/g, " ").trim();

  return {
    title: $("title").text().slice(0, 80) || "Untitled",
    description: text.slice(0, 200) || "No description",
    image: null,
    site: getDomain(url),
    favicon: `${new URL(url).origin}/favicon.ico`
  };
}

/* ================= QUALITY CHECK ================= */
function isWeak(meta) {
  return (
    !meta ||
    !meta.title ||
    meta.title.length < 3 ||
    meta.title === "No title"
  );
}

/* ================= GOD MODE ENGINE ================= */
async function getPreview(url) {
  // LAYER 1: FAST FETCH
  let html = await retry(() => fetchHTML(url, 6000));

  if (!html) {
    return {
      success: false,
      error: "Fetch failed"
    };
  }

  // LAYER 2: OG PARSE
  let meta = parseOG(html, url);

  if (!isWeak(meta)) {
    return {
      success: true,
      mode: "og",
      metadata: meta
    };
  }

  // LAYER 3: FALLBACK TEXT
  meta = fallback(html, url);

  if (!isWeak(meta)) {
    return {
      success: true,
      mode: "fallback",
      metadata: meta
    };
  }

  // LAYER 4: LAST RESORT (NEVER FAIL)
  return {
    success: true,
    mode: "emergency",
    metadata: {
      title: "Untitled page",
      description: "No preview available",
      image: null,
      site: getDomain(url),
      favicon: null
    }
  };
}

/* ================= ROUTE ================= */
app.get("/api/rip", async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.json({ success: false, error: "No URL" });
  }

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  // CACHE HIT
  const cached = cache.get(url);
  if (cached) return safeSend(res, cached);

  try {
    const result = await withTimeout(getPreview(url), 10000);

    cache.set(url, result);

    safeSend(res, result);
  } catch {
    safeSend(res, {
      success: true,
      mode: "timeout-fallback",
      metadata: {
        title: "Slow response page",
        description: "Preview generated with timeout fallback",
        image: null,
        site: getDomain(url),
        favicon: null
      }
    });
  }
});

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("🚀 GOD MODE Preview API LIVE");
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🚀 GOD MODE running on port ${PORT}`);
});