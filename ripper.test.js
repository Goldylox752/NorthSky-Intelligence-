const request = require('supertest');
const app = require('./app'); // Ensure you export 'app' in your main file
const redis = require('redis-mock');

// Mock the redis client used in your app
jest.mock('redis', () => ({
  createClient: () => redis.createClient()
}));

const API_KEY = 'your-secret-key-123'; // Must match the key in your app

describe('Ripper API Endpoints', () => {
  
  describe('GET /rip', () => {
    it('should return 400 if URL is missing', async () => {
      const res = await request(app).get('/rip');
      expect(res.statusCode).toBe(400);
    });

    it('should rip metadata when a valid URL is provided', async () => {
      const testUrl = 'https://example.com';
      const res = await request(app).get(`/rip?url=${testUrl}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('source');
    });
  });

  describe('Admin Dashboard (Protected)', () => {
    it('should return 401 if API Key is missing', async () => {
      const res = await request(app).get('/dashboard/stats');
      expect(res.statusCode).toBe(401);
    });

    it('should return 200 for stats when valid API Key is provided', async () => {
      const res = await request(app)
        .get('/dashboard/stats')
        .set('x-api-key', API_KEY); // Sending the custom header

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('online');
    });

    it('should clear cache and log the action', async () => {
      const res = await request(app)
        .get('/dashboard/clear-cache')
        .set('x-api-key', API_KEY);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Cache cleared');
    });
  });
});
