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

/* ================= CACHE ================= */
const CACHE_TIME = 1000 * 60 * 20;
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

/* ================= RATE LIMIT ================= */
const usage = {};
app.use("/api/", (req, res, next) => {
  const ip = req.ip;
  usage[ip] = (usage[ip] || 0) + 1;
  if (usage[ip] > 150) {
    return res.status(429).json({ success: false });
  }
  next();
});

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

/* ================= RETRY ================= */
async function retry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fn();
      if (res && typeof res === "object" && Object.keys(res).length > 0) {
        return res;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  return null;
}

/* ================= SAFE RACE ================= */
async function raceRequests(tasks, ms = 10000) {
  return new Promise((resolve) => {
    let finished = false;

    tasks.forEach(task => {
      task().then(res => {
        if (!finished && res) {
          finished = true;
          resolve(res);
        }
      }).catch(() => {});
    });

    setTimeout(() => {
      if (!finished) resolve(null);
    }, ms);
  });
}

/* ================= QUEUE ================= */
const MAX_WORKERS = 3;
let activeWorkers = 0;
const queue = [];

function runNext() {
  if (activeWorkers >= MAX_WORKERS || queue.length === 0) return;

  const job = queue.shift();
  activeWorkers++;

  job().finally(() => {
    activeWorkers--;
    runNext();
  });
}

function addToQueue(fn) {
  return new Promise(resolve => {
    queue.push(async () => {
      const result = await fn();
      resolve(result);
    });
    runNext();
  });
}

/* ================= PLATFORM DETECT ================= */
function detectPlatform(url) {
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  return "web";
}

/* ================= TIKTOK ================= */
async function tiktokAPI1(url) {
  return retry(async () => {
    const { data } = await axios.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
      { timeout: 8000, headers: getHeaders() }
    );

    if (data?.data) {
      return {
        title: data.data.title,
        image: data.data.cover,
        video: data.data.play,
        download: data.data.play,
        author: data.data.author?.nickname,
      };
    }
    return null;
  });
}

async function tiktokAPI2(url) {
  return retry(async () => {
    const { data } = await axios.get(
      `https://tikdown.org/api/download?url=${encodeURIComponent(url)}`,
      { timeout: 8000, headers: getHeaders() }
    );

    if (data?.video) {
      return {
        title: "TikTok Video",
        video: data.video,
        download: data.video,
      };
    }
    return null;
  });
}

async function handleTikTok(url) {
  return raceRequests([
    () => tiktokAPI1(url),
    () => tiktokAPI2(url),
  ]);
}

/* ================= INSTAGRAM ================= */
async function handleInstagram(url) {
  return retry(async () => {
    const { data } = await axios.get(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      { timeout: 8000, headers: getHeaders() }
    );

    const img = data.match(/"og:image" content="(.*?)"/)?.[1];

    return {
      title: "Instagram Post",
      image: img || null,
    };
  });
}

/* ================= YOUTUBE ================= */
async function handleYouTube(url) {
  return retry(async () => {
    const { data } = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { timeout: 8000, headers: getHeaders() }
    );

    return {
      title: data.title,
      image: data.thumbnail_url,
      author: data.author_name,
    };
  });
}

/* ================= WEB ================= */
async function fetchDirect(url) {
  try {
    const { data } = await axios.get(url, {
      headers: getHeaders(),
      timeout: 7000,
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
      timeout: 9000,
      headers: getHeaders()
    });
    return data;
  } catch {
    return null;
  }
}

async function fetchSmart(url) {
  return raceRequests([
    () => fetchDirect(url),
    () => fetchProxy(url),
  ]);
}

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.send("🚀 NorthSky COBALT v2 FIXED");
});

app.get("/api/rip", async (req, res) => {
  let responded = false;

  const send = (data) => {
    if (!responded) {
      responded = true;
      res.json(data);
    }
  };

  const timeout = setTimeout(() => {
    send({ success: false, error: "timeout" });
  }, 15000);

  try {
    let { url } = req.query;
    if (!url) {
      clearTimeout(timeout);
      return send({ success: false });
    }

    if (!url.startsWith("http")) url = "https://" + url;

    console.log("Incoming:", url);

    const cached = getCache(url);
    if (cached) {
      clearTimeout(timeout);
      return send(cached);
    }

    const platform = detectPlatform(url);

    const data = await addToQueue(async () => {
      if (platform === "tiktok") return handleTikTok(url);
      if (platform === "instagram") return handleInstagram(url);
      if (platform === "youtube") return handleYouTube(url);
      return null;
    });

    if (data) {
      const resData = {
        success: true,
        platform,
        metadata: data,
        video: data.video || null,
        download: data.download || null,
      };

      setCache(url, resData);
      clearTimeout(timeout);
      return send(resData);
    }

    /* WEB FALLBACK */
    const html = await fetchSmart(url);

    let meta = { title: "Unknown" };

    if (html) {
      try {
        const m = await metascraper({ html, url });
        meta = {
          title: m.title,
          description: m.description,
          image: m.image,
        };
      } catch {}
    }

    const resData = {
      success: true,
      platform: "web",
      metadata: meta,
    };

    setCache(url, resData);
    clearTimeout(timeout);
    send(resData);

  } catch (e) {
    console.error("ERROR:", e.message);
    clearTimeout(timeout);
    send({ success: false });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 COBALT FIXED RUNNING on " + PORT);
});