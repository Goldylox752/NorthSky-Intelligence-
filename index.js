/* =========================
   AI INTELLIGENCE LAYER
========================= */
let analysis = null;
let confidence = "low";

if (openai && (metadata.title || metadata.description)) {
  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a marketing intelligence engine that ONLY returns valid JSON."
        },
        {
          role: "user",
          content: `
Analyze this content:

Title: ${metadata.title || "N/A"}
Description: ${metadata.description || "N/A"}
Platform: ${platform}

Return STRICT JSON:

{
  "summary": "short summary",
  "hook": "why it grabs attention",
  "target_audience": "who it's for",
  "monetization_angle": "how to make money from this",
  "viral_score": number (1-10)
}
          `
        }
      ]
    });

    const raw = ai.choices?.[0]?.message?.content;

    try {
      analysis = raw ? JSON.parse(raw) : null;
      if (analysis?.viral_score) confidence = "high";
    } catch (parseErr) {
      logger.warn("JSON parse failed");
      analysis = { raw };
    }

  } catch (e) {
    logger.warn("AI failed: " + e.message);
  }
}

/* =========================
   YOUTUBE HANDLER
========================= */
function handleYouTube(url) {
  const idMatch = url.match(/(?:v=|youtu\.be\/)([^&]+)/);
  const videoId = idMatch ? idMatch[1] : null;

  if (!videoId) {
    return {
      title: "YouTube Video",
      description: "Invalid or unsupported YouTube URL",
      image: null,
      thumbnail: null,
      embed: null,
      platform: "youtube",
      url
    };
  }

  return {
    title: "YouTube Video",
    description: "Potential viral video content",
    image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    embed: `https://www.youtube.com/embed/${videoId}`,
    platform: "youtube",
    videoId,
    url
  };
}

/* =========================
   METADATA FALLBACK
========================= */
metadata.title = metadata.title || "Untitled Page";
metadata.description = metadata.description || "No description found";

/* =========================
   SCREENSHOT
========================= */
const screenshot = `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`;

/* =========================
   FINAL RESPONSE
========================= */
return res.json({
  success: true,
  source,
  platform,
  screenshot,
  metadata,
  analysis,
  confidence
});