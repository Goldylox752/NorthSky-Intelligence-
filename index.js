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

/* ================= SAFE STRIPE INIT ================= */
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
}

/* ================= CACHE ================= */
const cache = new LRU({
  max: 5000,
  ttl: 1000 * 60 * 60 * 3
});

/* ================= USERS DB ================= */
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
    return jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
  } catch {
    return null;
  }
}

/* ================= USAGE ================= */
function checkUsage(user) {
  const u = users.get(user.id);
  if (!u) return false;

  const now = Date.now();

  if (now - u.reset > 3600000) {
    u.used = 0;
    u.reset = now;
  }

  const limit = PLANS[u.plan]?.limit || 50;

  if (u.used >= limit) return false;

  u.used++;
  return true;
}

/* ================= FETCH ================= */
async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 6000,
      headers: { "User-Agent": "Mozilla/5.0" }
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
    $("p").first().text().slice(0, 200) ||
    "";

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
    return {
      success: false,
      error: "fetch_failed"
    };
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

  const token = jwt.sign(
    { id },
    process.env.JWT_SECRET || "dev_secret"
  );

  res.json({ token, plan: "free" });
});

/* ================= STRIPE (SAFE) ================= */
app.post("/upgrade", async (req, res) => {
  const user = auth(req);
  if (!user) return res.json({ error: "unauthorized" });

  if (!stripe) {
    return res.json({
      error: "stripe_not_configured"
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Pro Plan" },
            unit_amount: 999
          },
          quantity: 1
        }
      ],
      success_url: process.env.BASE_URL || "http://localhost:3000",
      cancel_url: process.env.BASE_URL || "http://localhost:3000"
    });

    res.json({ url: session.url });
  } catch (e) {
    res.json({ error: "stripe_error" });
  }
});

/* ================= MAIN API ================= */
app.get("/api/rip", async (req, res) => {
  try {
    const user = auth(req);
    if (!user) return res.json({ error: "invalid_token" });

    let profile = users.get(user.id);

    if (!profile) {
      profile = {
        id: user.id,
        plan: "free",
        used: 0,
        reset: Date.now()
      };

      users.set(user.id, profile);
    }

    if (!checkUsage(profile)) {
      return res.json({ error: "limit_reached" });
    }

    let { url } = req.query;
    if (!url) return res.json({ error: "no_url" });

    if (!url.startsWith("http")) url = "https://" + url;

    const key = crypto.createHash("md5").update(url).digest("hex");

    const cached = cache.get(key);
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

    cache.set(key, response);

    res.json(response);

  } catch (err) {
    res.json({
      success: false,
      error: "server_error"
    });
  }
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("💼 SAFE SAAS RUNNING ON PORT", PORT);
});