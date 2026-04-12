const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { getPreview } = require("./services/scraper");
const cache = require("./services/cache");

const authRoutes = require("./routes/auth");
const billingRoutes = require("./routes/billing");

const app = express();
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/billing", billingRoutes);

function auth(req) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/* ================= API ================= */
app.get("/api/preview", async (req, res) => {
  const user = auth(req);
  if (!user) return res.json({ error: "unauthorized" });

  let { url } = req.query;
  if (!url) return res.json({ error: "no_url" });

  if (!url.startsWith("http")) url = "https://" + url;

  const key = crypto.createHash("md5").update(url).digest("hex");

  const cached = await cache.get(key);
  if (cached) return res.json(cached);

  const data = await getPreview(url);

  const response = {
    success: true,
    data
  };

  await cache.set(key, response, 3600);

  res.json(response);
});

app.listen(3000, () => {
  console.log("🚀 Startup backend running");
});