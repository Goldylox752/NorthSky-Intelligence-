app.get('/rip', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const cachedData = await redisClient.get(url);
    if (cachedData) return res.json({ source: 'cache', ...JSON.parse(cachedData) });

    // ... (Your existing ripping logic here) ...

    // Save to Cache
    await redisClient.setEx(url, 86400, JSON.stringify(ripResult));

    // NEW: Add to Recent List (Limit to 5)
    await redisClient.lPush('recent_rips', url);
    await redisClient.lTrim('recent_rips', 0, 4); 

    return res.json({ source: 'fresh', ...ripResult });
  } catch (error) {
    res.status(500).json({ error: 'Rip failed', details: error.message });
  }
});

// NEW: Add endpoint to fetch the list
app.get('/dashboard/recent', authenticate, async (req, res) => {
  const recent = await redisClient.lRange('recent_rips', 0, 4);
  res.json(recent);
});
