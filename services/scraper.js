const axios = require("axios");
const cheerio = require("cheerio");

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

function parse(html, url) {
  const $ = cheerio.load(html);

  return {
    title:
      $("meta[property='og:title']").attr("content") ||
      $("title").text() ||
      "Untitled",

    description:
      $("meta[property='og:description']").attr("content") ||
      $("meta[name='description']").attr("content") ||
      $("p").first().text().slice(0, 200),

    image:
      $("meta[property='og:image']").attr("content") || null,

    site: new URL(url).hostname.replace("www.", ""),
    favicon: `${new URL(url).origin}/favicon.ico`
  };
}

async function getPreview(url) {
  const html = await fetchHTML(url);
  if (!html) return null;

  return parse(html, url);
}

module.exports = { getPreview };