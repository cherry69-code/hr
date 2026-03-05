const request = require('supertest');

describe('API health', () => {
  it('GET / returns the API status message', async () => {
    const app = require('../app');
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('HR Prop Ninja API is running');
  });
});
