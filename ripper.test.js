const request = require('supertest');
const app = require('./index'); // Export your 'app' in index.js

describe('Meta Ripper API Endpoints', () => {
  
  // Test 1: Check if the API is secured
  it('should return 401 if API key is missing', async () => {
    const res = await request(app).get('/rip?url=https://google.com');
    expect(res.statusCode).toEqual(401);
  });

  // Test 2: Verify Metadata Extraction (Mocking might be needed for CI)
  it('should return metadata for a valid URL', async () => {
    const res = await request(app)
      .get('/rip?url=https://www.youtube.com')
      .set('x-api-key', 'your-super-secret-key');
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('title');
    expect(res.body).toHaveProperty('source');
  });
});
