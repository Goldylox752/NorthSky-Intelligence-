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
