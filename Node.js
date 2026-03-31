// Private Node endpoint to get metadata
app.get('/get-metadata', async (req, res) => {
    const { url } = req.query;
    try {
        // Fetches all available formats, title, and thumbnails
        const info = await ytdlp.getInfoAsync(url);
        
        // Filter to find the best 4K VP9 video and best audio
        const videoStream = info.formats.find(f => f.vcodec.includes('vp9') && f.height >= 2160);
        const audioStream = info.formats.find(f => f.acodec !== 'none' && !f.vcodec);

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            videoUrl: videoStream?.url,
            audioUrl: audioStream?.url
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch metadata" });
    }
});

# Use Node.js LTS version
FROM node:20-bullseye-slim

# Install system dependencies: python3 (for yt-dlp) and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally
RUN curl -L https://github.com -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source and dashboard
COPY . .

EXPOSE 3000
CMD [ "node", "index.js" ]
