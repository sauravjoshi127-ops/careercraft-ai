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

  it('successfully generates 4 variants and subject lines (action: generate)', async () => {
    // Mock successful Gemini response — 4 spec-compliant variants
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                variants: [
                  { tone: 'Professional', subject: 'sub A.', body: 'body A.', approach: 'Recipient-first' },
                  { tone: 'Friendly', subject: 'sub B.', body: 'body B.', approach: 'Value-first' },
                  { tone: 'Direct', subject: 'sub C.', body: 'body C.', approach: 'Question-first' },
                  { tone: 'Networking', subject: 'sub D.', body: 'body D.', approach: 'Curiosity-first' }
                ],
                subjectLines: [
                  { text: 'sub A.', label: 'Direct' },
                  { text: 'sub B.', label: 'Curiosity' }
                ],
                evaluation: {
                  overallScore: 88,
                  strengths: ['Strength 1'],
                  weaknesses: ['Weakness 1'],
                  suggestions: ['Suggestion 1']
                },
                followUps: [
                  { index: 1, timing: '3–5 days', subject: 'follow-up sub.', body: 'follow-up body.' }
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
        action: 'generate',
        emailGoal: 'Job Application',
        // Use integer minLength/maxLength overrides to avoid word-count validation rejection
        minLength: 1,
        maxLength: 500,
        recipient: {
          name: 'Sarah',
          company: 'Stripe',
          position: 'VP of Engineering'
        },
        userContext: {
          name: 'Alex',
          background: 'Full stack development and DevOps infrastructure.',
          whyContacting: 'I want to discuss high-scale performance engineering.'
        }
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.variants);
    // New spec: 4 variants
    assert.equal(res.body.variants.length, 4);
    assert.equal(res.body.variants[0].subject, 'sub A.');
    assert.equal(res.body.variants[0].tone, 'Professional');
    assert.equal(res.body.variants[2].tone, 'Direct');
    assert.equal(res.body.variants[3].tone, 'Networking');
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
                  { text: 'regen sub 1', label: 'Direct' },
                  { text: 'regen sub 2', label: 'Curiosity' }
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
    // Revised text must be >= 20 words to pass validateOptimizeOutput
    const revisedText = 'The work your team is doing at Google caught my attention. ' +
      'I have spent the past two years building high-scale distributed systems — ' +
      'and I believe there is a genuine fit worth exploring. Would a short call next week make sense?';

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              // New API: returns revisedText (not optimizedBody)
              text: JSON.stringify({
                revisedText,
                reason: 'Removed filler words and tightened the opening.'
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
        emailBody: 'This is a draft email that needs to be improved and made shorter.',
        feedback: 'make it punchier and shorter',
        companyName: 'Google',
        recipientName: 'Sundar',
        position: 'CEO'
      });

    assert.equal(res.status, 200);
    // New API returns revisedText, not optimizedBody
    assert.equal(res.body.revisedText, revisedText);
    assert.ok(res.body.reason);
  });

  it('triggers validation retry and successfully recovers when first attempt fails word count', async () => {
    let fetchCallCount = 0;

    global.fetch = async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // First attempt: bodies too short — will fail validation with minLength=80
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    variants: [
                      { tone: 'Professional', subject: 'sub A', body: 'too short.', approach: 'PAS' },
                      { tone: 'Friendly', subject: 'sub B', body: 'too short.', approach: 'AIDA' },
                      { tone: 'Direct', subject: 'sub C', body: 'too short.', approach: 'PAS' },
                      { tone: 'Networking', subject: 'sub D', body: 'too short.', approach: 'PAS' }
                    ],
                    subjectLines: [{ text: 'sub A', label: 'Direct' }],
                    evaluation: { overallScore: 85, strengths: ['s'], weaknesses: ['w'], suggestions: ['s'] },
                    followUps: []
                  })
                }]
              }
            }]
          })
        };
      } else {
        // Second attempt: exactly 90 words — passes validation (80–100 word Standard range)
        const validBody = Array(89).fill('word').join(' ') + '.';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    variants: [
                      { tone: 'Professional', subject: 'sub A', body: validBody, approach: 'PAS' },
                      { tone: 'Friendly', subject: 'sub B', body: validBody, approach: 'AIDA' },
                      { tone: 'Direct', subject: 'sub C', body: validBody, approach: 'PAS' },
                      { tone: 'Networking', subject: 'sub D', body: validBody, approach: 'PAS' }
                    ],
                    subjectLines: [{ text: 'sub A', label: 'Direct' }],
                    evaluation: { overallScore: 85, strengths: ['s'], weaknesses: ['w'], suggestions: ['s'] },
                    followUps: []
                  })
                }]
              }
            }]
          })
        };
      }
    };

    const res = await request(app)
      .post('/api/cold-email')
      .send({
        action: 'generate',
        emailGoal: 'Job Application',
        // Standard length = 80–100 words; first attempt returns 2 words → fails → retries
        recipient: {
          name: 'Sarah',
          company: 'Stripe',
          position: 'VP'
        },
        userContext: {
          name: 'Alex',
          background: 'Full stack development',
          whyContacting: 'I want to discuss engineering.'
        }
      });

    assert.equal(res.status, 200);
    assert.equal(fetchCallCount, 2); // One failed attempt + one successful retry
    assert.ok(res.body.variants);
    // 4 variants returned
    assert.equal(res.body.variants.length, 4);
    // Word count: 89 words + '.' at end = body ends with period (valid)
    const wordCount = res.body.variants[0].body.trim().split(/\s+/).length;
    assert.ok(wordCount >= 80 && wordCount <= 100, `Expected 80–100 words, got ${wordCount}`);
  });
});
