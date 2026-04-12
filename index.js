/* ================= TIMEOUT WRAPPER ================= */
function withTimeout(promise, ms) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Request timeout"));
      }, ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/* ================= SAFE RESPONSE ================= */
function safeSend(res, data) {
  if (!res.headersSent) {
    res.json(data);
  }
}

/* ================= ROUTE ================= */
app.get("/api/rip", async (req, res) => {
  try {
    await withTimeout(handleRequest(req, res), 20000);
  } catch (err) {
    console.log("❌ TIMEOUT:", err.message);

    safeSend(res, {
      success: false,
      error: "Request timed out"
    });
  }
});

/* ================= MAIN HANDLER ================= */
async function handleRequest(req, res) {
  try {
    let { url } = req.query;
    if (!url) {
      return safeSend(res, { success: false, error: "No URL provided" });
    }

    if (!url.startsWith("http")) {
      url = "https://" + url;
    }

    /* CACHE */
    const cached = getCache(url);
    if (cached) {
      return safeSend(res, cached);
    }

    const platform = detectPlatform(url);
    let data = null;

    /* ================= YOUTUBE ================= */
    if (platform === "youtube") {
      try {
        const { data: yt } = await axios.get(
          `https://www.youtube.com/oembed?url=${url}&format=json`,
          { timeout: 5000 }
        );

        data = {
          title: yt.title,
          image: yt.thumbnail_url,
          author: yt.author_name
        };
      } catch (e) {
        console.log("YouTube fetch failed");
      }
    }

    /* ================= WEB SCRAPE ================= */
    if (!data) {
      const html = await smartFetch(url);

      if (!html) {
        return safeSend(res, {
          success: false,
          error: "Failed to fetch HTML"
        });
      }

      try {
        const m = await metascraper({ html, url });

        data = {
          title: m.title || "No title",
          description: m.description || "",
          image: m.image || null
        };
      } catch (e) {
        console.log("Metascraper failed");

        data = {
          title: "Parse failed",
          description: "",
          image: null
        };
      }
    }

    const response = {
      success: true,
      platform,
      metadata: data
    };

    setCache(url, response);
    safeSend(res, response);

  } catch (err) {
    console.log("❌ HANDLE ERROR:", err.message);

    safeSend(res, {
      success: false,
      error: "Internal error"
    });
  }
}

/* ================= BROWSER FETCH ================= */
async function fetchWithBrowser(url) {
  let browser;

  try {
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 12000
    });

    const html = await page.content();
    return html;

  } catch (err) {
    console.log("Browser fetch failed:", err.message);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

/* ================= RETRY ================= */
async function retry(fn, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fn();
      if (res) return res;
    } catch {}
  }
  return null;
}

/* ================= SMART FETCH ================= */
async function smartFetch(url) {
  let html = await retry(() => fetchDirect(url));

  if (!html) {
    html = await retry(() => fetchProxy(url));
  }

  if (needsBrowser(html)) {
    html = await retry(() => fetchWithBrowser(url));
  }

  return html;
}

/* ================= DETECT NEED BROWSER ================= */
function needsBrowser(html) {
  if (!html) return true;

  const text = html.toLowerCase();

  return (
    html.length < 1500 ||
    text.includes("enable javascript") ||
    text.includes("captcha") ||
    text.includes("access denied") ||
    text.includes("verify you are human")
  );
}