const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// Connect to Redis (Heroku uses REDIS_URL)
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null
});

// Configure Queue with Retry Backoff
const ripQueue = new Queue('ripper-tasks', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  }
});

module.exports = { ripQueue, connection };


const ripQueue = new Queue('ripper-tasks', {
  connection,
  defaultJobOptions: {
    attempts: 5, // Give it 5 tries (rotating through all proxies)
    backoff: {
      type: 'exponential',
      delay: 10000, // Wait 10s, then 20s, then 40s...
    }
  }
});

const ripQueue = new Queue('ripper-tasks', {
  connection,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: 'exponential', // Wait longer between each failure
      delay: 5000, // Start with a 5-second delay
    },
    removeOnComplete: true, // Clean up Redis after success
  }
});
