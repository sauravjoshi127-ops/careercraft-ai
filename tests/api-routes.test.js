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

  it('serves /interview locally', async () => {
    const res = await request(app).get('/interview');

    assert.equal(res.status, 200);
    assert.match(res.type, /html/);
    assert.match(res.text, /Interview Coach/i);
  });
});
