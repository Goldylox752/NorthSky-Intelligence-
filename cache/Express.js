const express = require('express');
const { createClient } = require('redis');
// ... (keep your previous imports for axios, metascraper, yt-dlp-wrap)

const app = express();
const redisClient = createClient(); // Connects to localhost:6379 by default
const PORT = 3000;
const fs = require('fs-extra');
const path = require('path');

// GET /dashboard/stats - Real-time pipeline health
app.get('/dashboard/stats', authenticate, async (req, res) => {
  try {
    const keys = await redisClient.keys('*'); // Find all cached rips
    const totalCached = keys.filter(k => !k.startsWith('ripper_limit')).length;
    
    res.json({
      status: 'online',
      total_cached_rips: totalCached,
      uptime: process.uptime(),
      memory_usage: process.memoryUsage().rss
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /dashboard/logs - Fetch recent audit history
app.get('/dashboard/logs', authenticate, async (req, res) => {
  try {
    const logPath = path.join(__dirname, 'audit.log');
    if (!fs.existsSync(logPath)) return res.json([]);

    const data = await fs.readFile(logPath, 'utf8');
    // Convert newline-delimited JSON into a proper array
    const logs = data.trim().split('\n').map(line => JSON.parse(line)).reverse();
    
    res.json(logs.slice(0, 50)); // Return last 50 entries
  } catch (err) {
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// DELETE /dashboard/cache - Clear specific or all cache
app.get('/dashboard/clear-cache', authenticate, async (req, res) => {
  await redisClient.flushAll(); // Warning: Clears everything
  logger.info('Audit: Cache Cleared Manually', { action: 'admin_clear' });
  res.json({ message: 'Cache cleared' });
});

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
