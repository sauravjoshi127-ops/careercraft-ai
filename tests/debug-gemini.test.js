'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

describe('GET /api/debug/gemini', () => {
  it('verifies configuration state based on GEMINI_API_KEY presence and format', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.GEMINI_API_KEY;
    const app = require('../server');

    try {
      // Case 1: Missing key in production mode
      process.env.NODE_ENV = 'production';
      delete process.env.GEMINI_API_KEY;
      let res = await request(app).get('/api/debug/gemini');
      assert.equal(res.status, 200);
      assert.equal(res.body.configured, false);

      // Case 2: Placeholder key in production mode
      process.env.GEMINI_API_KEY = 'your_placeholder_key_here';
      res = await request(app).get('/api/debug/gemini');
      assert.equal(res.status, 200);
      assert.equal(res.body.configured, false);

      // Case 3: Valid format key in production mode
      process.env.GEMINI_API_KEY = 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6';
      res = await request(app).get('/api/debug/gemini');
      assert.equal(res.status, 200);
      assert.equal(res.body.configured, true);
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.GEMINI_API_KEY = originalKey;
    }
  });
});
