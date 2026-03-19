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
