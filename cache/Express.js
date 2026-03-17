const express = require('express');
const { createClient } = require('redis');
// ... (keep your previous imports for axios, metascraper, yt-dlp-wrap)

const app = express();
const redisClient = createClient(); // Connects to localhost:6379 by default
const PORT = 3000;

// Connect to Redis on startup
(async () => {
  redisClient.on('error', (err) => console.error('Redis Error:', err));
  await redisClient.connect();
  console.log('Connected to Redis');
})();

app.get('/rip', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    // 1. Check Redis Cache
    const cachedData = await redisClient.get(url);
    if (cachedData) {
      console.log('Cache Hit!');
      return res.json({ source: 'cache', ...JSON.parse(cachedData) });
    }

    // 2. Cache Miss: Run Ripper Logic
    console.log('Cache Miss - Ripping fresh data...');
    let ripResult;
    
    const isVideoPlatform = /youtube\.com|youtu\.be|tiktok\.com/.test(url);
    if (isVideoPlatform) {
      ripResult = await ytDlpWrap.getVideoInfo(url);
    } else {
      const { data: html } = await axios.get(url);
      ripResult = await metascraper({ html, url });
    }

    // 3. Save to Redis with an Expiry (e.g., 24 hours / 86400 seconds)
    await redisClient.setEx(url, 86400, JSON.stringify(ripResult));

    return res.json({ source: 'fresh', ...ripResult });
  } catch (error) {
    res.status(500).json({ error: 'Rip failed', details: error.message });
  }
});

app.listen(PORT, () => console.log(`Ripper API with Cache at http://localhost:${PORT}`));
