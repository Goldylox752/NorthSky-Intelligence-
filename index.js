/* ================= CORE ================= */
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const LRU = require("lru-cache");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ================= STRIPE ================= */
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/* ================= CACHE ================= */
const cache = new LRU({
  max: 5000,
  ttl: 1000 * 60 * 60 * 3
});

/* ================= USERS DB (demo memory) ================= */
const users = new Map();

/* ================= PLANS ================= */
const PLANS = {
  free: { limit: 50 },
  pro: { limit: 1000 },
  business: { limit: 10000 }
};

/* ================= AUTH ================= */
function auth(req) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/* ================= RATE LIMIT PER USER ================= */
function checkUsage(user) {
  const u = users.get(user.id);
  if (!u) return false;

  const now = Date.now();
  if (now - u.reset > 3600000) {
    u.used = 0;
    u.reset = now;
  }

  const limit = PLANS[u.plan].limit;

  if (u.used >= limit) return false;

  u.used++;
  return true;
}

/* ================= FETCH ================= */
async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 6000,
      headers: {
        "User-Agent": "Mozilla/5.0"
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

  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").text() ||
    "Untitled";

  const description =
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    $("p").first().text().slice(0, 200);

  const image =
    $("meta[property='og:image']").attr("content") || null;

  const site = new URL(url).hostname.replace("www.", "");

  return {
    title,
    description,
    image,
    site,
    favicon: `https://${site}/favicon.ico`
  };
}

/* ================= ENGINE ================= */
async function engine(url) {
  const html = await fetchHTML(url);

  if (!html) {
    return { success: false };
  }

  return {
    success: true,
    metadata: parse(html, url)
  };
}

/* ================= SIGNUP ================= */
app.post("/signup", (req, res) => {
  const id = crypto.randomUUID();

  const user = {
    id,
    plan: "free",
    used: 0,
    reset: Date.now()
  };

  users.set(id, user);

  const token = jwt.sign({ id }, process.env.JWT_SECRET);

  res.json({
    token,
    plan: "free"
  });
});

/* ================= STRIPE CHECKOUT ================= */
app.post("/upgrade", async (req, res) => {
  const user = auth(req);
  if (!user) return res.json({ error: "unauthorized" });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Pro Plan"
          },
          unit_amount: 999
        },
        quantity: 1
      }
    ],
    success_url: process.env.BASE_URL + "/success",
    cancel_url: process.env.BASE_URL + "/cancel"
  });

  res.json({ url: session.url });
});

/* ================= MAIN API ================= */
app.get("/api/rip", async (req, res) => {
  const user = auth(req);

  if (!user) {
    return res.json({ error: "invalid_token" });
  }

  const profile = users.get(user.id);
  if (!profile) return res.json({ error: "no_user" });

  /* CHECK USAGE */
  if (!checkUsage(profile)) {
    return res.json({ error: "limit_reached" });
  }

  let { url } = req.query;
  if (!url) return res.json({ error: "no_url" });

  if (!url.startsWith("http")) url = "https://" + url;

  const cacheKey = crypto.createHash("md5").update(url).digest("hex");

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const result = await engine(url);

  const response = {
    ...result,
    usage: {
      plan: profile.plan,
      used: profile.used,
      limit: PLANS[profile.plan].limit
    }
  };

  cache.set(cacheKey, response);

  res.json(response);
});

/* ================= DASHBOARD ================= */
app.get("/me", (req, res) => {
  const user = auth(req);
  if (!user) return res.json({ error: "unauthorized" });

  const profile = users.get(user.id);

  res.json(profile);
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("💼 FULL SAAS PRODUCT RUNNING ON PORT", PORT);
});