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

  it('successfully generates 6 variants and subject lines (action: generate)', async () => {
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
                  { tone: 'Professional', subject: 'sub A.', body: 'body A.', approach: 'PAS' },
                  { tone: 'Friendly', subject: 'sub B.', body: 'body B.', approach: 'AIDA' },
                  { tone: 'Executive', subject: 'sub C.', body: 'body C.', approach: 'Executive' },
                  { tone: 'Startup', subject: 'sub D.', body: 'body D.', approach: 'Startup' },
                  { tone: 'Technical', subject: 'sub E.', body: 'body E.', approach: 'Technical' },
                  { tone: 'Networking', subject: 'sub F.', body: 'body F.', approach: 'Networking' }
                ],
                subjectLines: [
                  { text: 'sub A.', label: 'Conservative', openRate: '90%' },
                  { text: 'sub B.', label: 'Curiosity', openRate: '80%' }
                ],
                evaluation: {
                  overallScore: 88,
                  personalizationScore: 90,
                  openRatePrediction: 85,
                  recruiterEngagementScore: 80,
                  professionalToneScore: 95,
                  spamRiskScore: 10,
                  grammarScore: 98,
                  clarityScore: 90,
                  strengths: ['Strength 1'],
                  weaknesses: ['Weakness 1'],
                  suggestions: ['Suggestion 1']
                },
                followUp: 'follow-up text.',
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
        lengthType: 'Custom',
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
          keySkills: 'Node.js, AWS, Kubernetes',
          experience: '2 years as cloud engineer.',
          whyContacting: 'I want to discuss high-scale performance engineering.'
        }
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.variants);
    assert.equal(res.body.variants[0].subject, 'sub A.');
    assert.equal(res.body.variants[4].tone, 'Technical');
    assert.equal(res.body.variants[5].tone, 'Networking');
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
        position: 'CEO',
        lengthType: 'Custom',
        minLength: 1,
        maxLength: 500
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.optimizedBody, 'This is the optimized email body.');
    assert.equal(res.body.evaluation.overallScore, 94);
  });

  it('triggers validation retry and successfully recovers when first attempt fails length constraint', async () => {
    let fetchCallCount = 0;
    global.fetch = async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    variants: [
                      { tone: 'Professional', subject: 'sub A', body: 'too short body', approach: 'PAS' },
                      { tone: 'Friendly', subject: 'sub B', body: 'too short body', approach: 'AIDA' },
                      { tone: 'Executive', subject: 'sub C', body: 'too short body', approach: 'PAS' },
                      { tone: 'Startup', subject: 'sub D', body: 'too short body', approach: 'PAS' },
                      { tone: 'Technical', subject: 'sub E', body: 'too short body', approach: 'PAS' },
                      { tone: 'Networking', subject: 'sub F', body: 'too short body', approach: 'PAS' }
                    ],
                    subjectLines: [{ text: 'sub A', label: 'Conservative', openRate: '80%' }],
                    evaluation: { overallScore: 85, personalizationScore: 80, openRatePrediction: 80, recruiterEngagementScore: 80, professionalToneScore: 80, spamRiskScore: 10, grammarScore: 90, clarityScore: 90, strengths: ['s'], weaknesses: ['w'], suggestions: ['s'] },
                    followUp: 'followup text.',
                    spamWords: []
                  })
                }]
              }
            }]
          })
        };
      } else {
        const validBody = Array(90).fill('word').join(' ') + '.';
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
                      { tone: 'Executive', subject: 'sub C', body: validBody, approach: 'PAS' },
                      { tone: 'Startup', subject: 'sub D', body: validBody, approach: 'PAS' },
                      { tone: 'Technical', subject: 'sub E', body: validBody, approach: 'PAS' },
                      { tone: 'Networking', subject: 'sub F', body: validBody, approach: 'PAS' }
                    ],
                    subjectLines: [{ text: 'sub A', label: 'Conservative', openRate: '80%' }],
                    evaluation: { overallScore: 85, personalizationScore: 80, openRatePrediction: 80, recruiterEngagementScore: 80, professionalToneScore: 80, spamRiskScore: 10, grammarScore: 90, clarityScore: 90, strengths: ['s'], weaknesses: ['w'], suggestions: ['s'] },
                    followUp: 'followup text.',
                    spamWords: []
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
        lengthType: 'Short', // 80 - 100 words range
        recipient: {
          name: 'Sarah',
          company: 'Stripe',
          position: 'VP'
        },
        userContext: {
          name: 'Alex',
          background: 'Full stack development',
          keySkills: 'Node.js',
          experience: '2 years',
          whyContacting: 'I want to discuss engineering.'
        }
      });

    assert.equal(res.status, 200);
    assert.equal(fetchCallCount, 2); // Confirm retry was made
    assert.ok(res.body.variants);
    assert.equal(res.body.variants[0].body.split(/\s+/).length, 90); // Confirms correct length was returned
  });
});
