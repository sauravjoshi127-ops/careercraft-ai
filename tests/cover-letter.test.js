'use strict';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy-key';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

const originalFetch = global.fetch;

describe('POST /api/cover-letter', () => {
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects the request with 401 when no authorization token is provided', async () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app)
        .post('/api/cover-letter')
        .send({
          jobTitle: 'Software Engineer',
          companyName: 'Acme',
          jobDescription: 'Code clean JS.'
        });
      assert.equal(res.status, 401);
      assert.match(res.body.error, /authentication/i);
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/cover-letter')
      .send({
        jobTitle: '',
        companyName: 'Acme Labs',
        jobDescription: 'Write code.'
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /missing required fields/i);
  });

  it('successfully generates cover letter, variants, scores, and recommendations', async () => {
    const mockGeminiJson = {
      letter: 'Dear Acme, I am applying for the Frontend Engineer position. Sincerely, Alex',
      variants: [
        'Variant A: Dear Acme, I want to code. Best, Alex',
        'Variant B: Dear Acme, Frontend is my passion. Yours, Alex',
        'Variant C: Dear Acme, React is cool. Cheers, Alex'
      ],
      keywords_used: ['React', 'CSS', 'JavaScript'],
      ats_score: 85,
      relevance_score: 90,
      detailed_scores: {
        personalization: 88,
        professionalism: 92,
        grammar: 95,
        readability: 85,
        overall: 90
      },
      suggestions: [
        {
          id: 's1',
          category: 'ATS',
          explanation: 'Add keyword "React".',
          priority: 'High',
          originalText: 'code clean',
          suggestedText: 'code clean with React'
        }
      ]
    };

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify(mockGeminiJson)
            }]
          }
        }]
      })
    });

    const res = await request(app)
      .post('/api/cover-letter')
      .send({
        jobTitle: 'Frontend Engineer',
        companyName: 'Acme Labs',
        jobDescription: 'We need a Frontend Engineer who writes clean JavaScript and React.',
        highlights: 'I write clean JavaScript.',
        tone: 'Professional',
        length: 'Short'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.letter, mockGeminiJson.letter);
    assert.ok(Array.isArray(res.body.variants));
    assert.equal(res.body.variants[0], mockGeminiJson.variants[0]);
    assert.equal(typeof res.body.ats_score, 'number');
    assert.equal(typeof res.body.relevance_score, 'number');
    assert.equal(res.body.detailed_scores.personalization, 88);
    assert.equal(res.body.suggestions[0].category, 'ATS');
  });
});
