'use strict';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy-key';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

describe('local API route wiring', () => {
  it('serves /api/ai-suggestions locally with JSON validation errors', async () => {
    const res = await request(app)
      .post('/api/ai-suggestions')
      .send({});

    assert.equal(res.status, 400);
    assert.match(res.type, /json/);
    assert.equal(res.body.error, 'Missing required field: section');
  });

  it('serves /api/delete-user locally with JSON validation errors', async () => {
    const res = await request(app)
      .post('/api/delete-user')
      .send({});

    assert.equal(res.status, 400);
    assert.match(res.type, /json/);
    assert.equal(res.body.error, 'User ID is required');
  });

  it('rejects /api/delete-user with 403 Forbidden when userId does not match authenticated user', async () => {
    const res = await request(app)
      .post('/api/delete-user')
      .send({ userId: 'different-uuid-value' });

    assert.equal(res.status, 403);
    assert.match(res.type, /json/);
    assert.equal(res.body.error, 'Forbidden: You can only delete your own account');
  });

  it('serves /interview locally', async () => {
    const res = await request(app).get('/interview');

    assert.equal(res.status, 200);
    assert.match(res.type, /html/);
    assert.match(res.text, /Interview Coach/i);
  });

  it('returns runtime Supabase config only when env vars are defined', async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalAnon = process.env.SUPABASE_ANON_KEY;

    try {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'public-anon-key';
      let res = await request(app).get('/api/config');
      assert.equal(res.status, 200);
      assert.equal(res.body.supabaseUrl, 'https://example.supabase.co');
      assert.equal(res.body.supabaseKey, 'public-anon-key');

      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      res = await request(app).get('/api/config');
      assert.equal(res.status, 503);
      assert.match(res.type, /json/);
      assert.match(res.body.error, /Missing SUPABASE_URL or SUPABASE_ANON_KEY/);
    } finally {
      originalUrl !== undefined ? process.env.SUPABASE_URL = originalUrl : delete process.env.SUPABASE_URL;
      originalAnon !== undefined ? process.env.SUPABASE_ANON_KEY = originalAnon : delete process.env.SUPABASE_ANON_KEY;
    }
  });
});
