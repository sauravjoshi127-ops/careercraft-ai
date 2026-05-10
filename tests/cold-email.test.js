'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy-key';
const app = require('../server');

const originalFetch = global.fetch;

describe('POST /api/cold-email', () => {
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns fallback drafts when Gemini returns 503', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    });

    const res = await request(app)
      .post('/api/cold-email')
      .send({
        company: 'Acme Labs',
        recipientTitle: 'Head of Product',
        recipientName: 'Sarah',
        senderName: 'Alex',
        background: 'I build practical outreach and shipping workflows.',
        purpose: 'Job Inquiry',
        valueProposition: 'I improved response rates by tightening messaging.',
        industry: 'Tech & Software',
        tone: 'Professional',
        length: 'Medium'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.fallbackUsed, true);
    assert.match(res.body.fallbackReason, /503/);
    assert.equal(res.body.variants.length, 3);
    assert.ok(res.body.variants[0].subject.trim().length > 0);
    assert.ok(res.body.followUp.trim().length > 0);
  });
});
