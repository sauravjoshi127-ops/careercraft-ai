'use strict';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy-key';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

const originalFetch = global.fetch;

describe('POST /api/cold-email (Advanced Actions)', () => {
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('successfully generates 5 variants and subject lines (action: generate)', async () => {
    // Mock successful Gemini response
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                variants: [
                  { tone: 'Professional', subject: 'sub A', body: 'body A', approach: 'PAS' },
                  { tone: 'Friendly', subject: 'sub B', body: 'body B', approach: 'AIDA' },
                  { tone: 'Direct', subject: 'sub C', body: 'body C', approach: 'Ultra-Short' },
                  { tone: 'Formal', subject: 'sub D', body: 'body D', approach: 'Formal' },
                  { tone: 'High-Response Optimized', subject: 'sub E', body: 'body E', approach: 'Pattern Interrupt' }
                ],
                subjectLines: [
                  { text: 'sub A', probability: '90%', recommended: true },
                  { text: 'sub B', probability: '80%', recommended: false }
                ],
                evaluation: {
                  overallScore: 88,
                  strengths: ['Strength 1'],
                  weaknesses: ['Weakness 1'],
                  suggestions: ['Suggestion 1']
                },
                followUp: 'follow-up text',
                spamWords: []
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
        emailGoal: 'Job Application',
        recipient: {
          name: 'Sarah',
          company: 'Stripe',
          position: 'VP of Engineering'
        },
        userContext: {
          name: 'Alex',
          background: 'Full stack development and DevOps infrastructure.',
          keySkills: 'Node.js, AWS, Kubernetes',
          experience: '2 years as cloud engineer.',
          whyContacting: 'I want to discuss high-scale performance engineering.'
        }
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.variants);
    assert.equal(res.body.variants[0].subject, 'sub A');
    assert.equal(res.body.variants[4].tone, 'High-Response Optimized');
    assert.equal(res.body.subjectLines.length, 2);
    assert.equal(res.body.evaluation.overallScore, 88);
  });

  it('successfully regenerates subject lines (action: regenerate-subjects)', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                subjectLines: [
                  { text: 'regen sub 1', probability: '92%', recommended: true },
                  { text: 'regen sub 2', probability: '78%', recommended: false }
                ]
              })
            }]
          }
        }]
      })
    });

    const res = await request(app)
      .post('/api/cold-email')
      .send({
        action: 'regenerate-subjects',
        emailBody: 'This is the main email body.',
        companyName: 'OpenAI',
        recipientName: 'Sam',
        position: 'CEO',
        emailGoal: 'Partnership'
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.subjectLines);
    assert.equal(res.body.subjectLines.length, 2);
    assert.equal(res.body.subjectLines[0].text, 'regen sub 1');
  });

  it('successfully optimizes tone and length (action: optimize)', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                optimizedBody: 'This is the optimized email body.',
                evaluation: {
                  overallScore: 94,
                  strengths: ['Much more punchy'],
                  weaknesses: [],
                  suggestions: []
                }
              })
            }]
          }
        }]
      })
    });

    const res = await request(app)
      .post('/api/cold-email')
      .send({
        action: 'optimize',
        emailBody: 'This is a boring draft email.',
        feedback: 'make it punchier and shorter',
        companyName: 'Google',
        recipientName: 'Sundar',
        position: 'CEO'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.optimizedBody, 'This is the optimized email body.');
    assert.equal(res.body.evaluation.overallScore, 94);
  });
});
