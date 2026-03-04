jest.mock('../models/Document', () => ({
  findOne: jest.fn()
}));

const request = require('supertest');

describe('E-sign public endpoints', () => {
  it('POST /api/esign/sign/:token returns 400 when signature missing', async () => {
    const app = require('../app');
    const res = await request(app).post('/api/esign/sign/anytoken').send({});
    expect(res.status).toBe(400);
    expect(res.body && res.body.success).toBe(false);
  });

  it('GET /api/esign/sign/:token returns 404 when document not found', async () => {
    const Document = require('../models/Document');
    Document.findOne.mockResolvedValueOnce(null);

    const app = require('../app');
    const res = await request(app).get('/api/esign/sign/missingtoken');
    expect(res.status).toBe(404);
    expect(res.body && res.body.success).toBe(false);
  });
});

