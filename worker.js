const { io } = require('./app'); // Import the io instance

const worker = new Worker('ripper-tasks', async (job) => {
  // ... your ripping logic ...
  const result = await performRip(job.data.url);

  // PUSH the result to the specific user via Socket.io
  io.to(`job-${job.id}`).emit('job-completed', result);

  return result;
}, { connection });
const worker = new Worker('ripper-tasks', async (job) => {
  // Step 1: Initializing
  await job.updateProgress({ status: 'Initializing Ripper...' });
  
  // Step 2: Ripping (e.g., Axios or yt-dlp)
  await job.updateProgress({ status: 'Scraping HTML & Metadata...' });
  const result = await performRip(job.data.url);
  
  // Step 3: Caching
  await job.updateProgress({ status: 'Uploading to Redis Cache...' });
  await connection.set(`result:${job.id}`, JSON.stringify(result), 'EX', 3600);

  return result;
}, { connection });
