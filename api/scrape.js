export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "No URL provided" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const html = await response.text();

    // 🔧 HELPER FUNCTION
    const extract = (regex) => {
      return html.match(regex)?.[1]?.trim() || "";
    };

    // 🔍 CORE META
    const title = extract(/<title>(.*?)<\/title>/i);

    const description =
      extract(/<meta name="description" content="(.*?)"/i) ||
      extract(/<meta property="og:description" content="(.*?)"/i);

    // 🔍 OPEN GRAPH
    const ogTitle = extract(/<meta property="og:title" content="(.*?)"/i);
    const ogImage = extract(/<meta property="og:image" content="(.*?)"/i);
    const ogUrl = extract(/<meta property="og:url" content="(.*?)"/i);

    // 🐦 TWITTER
    const twitterTitle = extract(/<meta name="twitter:title" content="(.*?)"/i);
    const twitterImage = extract(/<meta name="twitter:image" content="(.*?)"/i);

    // 🔗 CANONICAL
    const canonical = extract(/<link rel="canonical" href="(.*?)"/i);

    // 🧠 CLEAN CONTENT (BETTER)
    let content = html
      .replace(/<script[^>]*>.*?<\/script>/gis, "")
      .replace(/<style[^>]*>.*?<\/style>/gis, "")
      .replace(/<noscript[^>]*>.*?<\/noscript>/gis, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    content = content.slice(0, 3000); // slightly more context

    // 🧠 SIMPLE KEYWORD EXTRACTION
    const words = content.toLowerCase().split(" ");
    const freq = {};

    words.forEach(w => {
      if (w.length > 4) {
        freq[w] = (freq[w] || 0) + 1;
      }
    });

    const keywords = Object.entries(freq)
      .sort((a,b) => b[1]-a[1])
      .slice(0, 10)
      .map(k => k[0]);

    return res.status(200).json({
      title,
      description,
      ogTitle,
      ogImage,
      ogUrl,
      twitterTitle,
      twitterImage,
      canonical,
      keywords,
      content
    });

  } catch (error) {
    return res.status(500).json({
      error: "Scrape failed",
      details: error.message
    });
  }
}