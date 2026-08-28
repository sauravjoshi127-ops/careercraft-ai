'use strict';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy-key';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
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
    assert.match(res.body.fallbackReason, /503|HTTP|error|exception/i);
    assert.equal(res.body.variants.length, 4);
    assert.ok(res.body.variants[0].subject.trim().length > 0);
    assert.ok(Array.isArray(res.body.followUps));
    assert.ok(res.body.followUps.length >= 1);
    assert.ok(typeof res.body.followUps[0].body === 'string');
    assert.ok(res.body.followUps[0].body.trim().length > 0);
  });

  it('succeeds with minimum required fields only (senderName + company + purpose)', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    });

    const res = await request(app)
      .post('/api/cold-email')
      .send({
        company: 'Stripe',
        senderName: 'Alex Johnson',
        purpose: 'Networking'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.fallbackUsed, true);
    assert.equal(res.body.variants.length, 4);
    assert.equal(res.body.variants[0].greeting, 'Hi there,');
    assert.equal(res.body.variants[0].senderName, 'Alex Johnson');
  });

  it('succeeds with successful AI response when all optional fields are empty', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                variants: [
                  { tone: 'Context', subject: 'Connecting with Stripe', greeting: 'Hi there,', paragraphs: ['I follow your work.'], cta: 'Would you be open to a call?', signOff: 'Best,', senderName: 'Alex Johnson' },
                  { tone: 'Question', subject: 'Quick question for Stripe', greeting: 'Hi there,', paragraphs: ['Are you scaling teams?'], cta: 'Happy to chat.', signOff: 'Best,', senderName: 'Alex Johnson' },
                  { tone: 'Direct', subject: 'Stripe outreach', greeting: 'Hi there,', paragraphs: ['Reaching out directly.'], cta: 'Let me know.', signOff: 'Best,', senderName: 'Alex Johnson' },
                  { tone: 'Curiosity', subject: 'Curious about Stripe', greeting: 'Hi there,', paragraphs: ['Love what Stripe is doing.'], cta: 'Would love your take.', signOff: 'Warmly,', senderName: 'Alex Johnson' }
                ],
                subjectLines: [
                  { text: 'Connecting with Stripe', label: 'Direct' }
                ],
                evaluation: { overallScore: 90, strengths: ['Clear'], weaknesses: [], suggestions: [] },
                followUps: []
              })
            }]
          }
        }]
      })
    });

    const res = await request(app)
      .post('/api/cold-email')
      .send({
        action: 'generate',
        minLength: 1,
        maxLength: 500,
        recipient: {
          name: '',
          company: 'Stripe',
          position: ''
        },
        userContext: {
          name: 'Alex Johnson',
          background: '',
          whyContacting: ''
        },
        emailGoal: 'Networking'
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.variants);
    assert.equal(res.body.variants[0].greeting, 'Hi there,');
    assert.equal(res.body.variants[0].senderName, 'Alex Johnson');
    assert.equal(res.body.variants[0].body, 'I follow your work.');
  });

  it('succeeds when recipient role/title is empty and recipientName is provided', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    });

    const res = await request(app)
      .post('/api/cold-email')
      .send({
        company: 'Acme Corp',
        recipientName: 'Sarah',
        senderName: 'Alex',
        purpose: 'Job Opportunity'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.variants[0].greeting, 'Hi Sarah,');
    assert.equal(res.body.variants[0].senderName, 'Alex');
  });

  it('succeeds when recipient role/title is filled', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    });

    const res = await request(app)
      .post('/api/cold-email')
      .send({
        company: 'Acme Corp',
        recipientName: 'Sarah',
        position: 'VP of Engineering',
        senderName: 'Alex',
        purpose: 'Job Opportunity'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.variants[0].greeting, 'Hi Sarah,');
    assert.equal(res.body.variants[0].senderName, 'Alex');
  });

  it('fails with 400 when companyName is missing', async () => {
    const res = await request(app)
      .post('/api/cold-email')
      .send({
        senderName: 'Alex',
        purpose: 'Networking'
      });

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
    assert.ok(res.body.missingFields.some(f => f.includes('companyName')));
  });

  it('fails with 400 when senderName is missing', async () => {
    const res = await request(app)
      .post('/api/cold-email')
      .send({
        company: 'Stripe',
        purpose: 'Networking'
      });

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
    assert.ok(res.body.missingFields.some(f => f.includes('userName')));
  });
});
