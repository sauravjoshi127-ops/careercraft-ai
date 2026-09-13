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
                  { tone: 'Professional', subject: 'sub 1.', body: 'body 1.', approach: 'Recipient-first' },
                  { tone: 'Friendly', subject: 'sub 2.', body: 'body 2.', approach: 'Value-first' },
                  { tone: 'Direct', subject: 'sub 3.', body: 'body 3.', approach: 'Question-first' },
                  { tone: 'Networking', subject: 'sub 4.', body: 'body 4.', approach: 'Curiosity-first' }
                ],
                subjectLines: [
                  { text: 'sub 1.', label: 'Direct' },
                  { text: 'sub 2.', label: 'Curiosity' }
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
    assert.equal(res.body.variants[0].subject, 'sub 1.');
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
        // First attempt: bodies too short — will fail validation with minLength=55
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    variants: [
                      { tone: 'Context', subject: 'sub 1', body: 'too short.', approach: 'Recipient-first' },
                      { tone: 'Question', subject: 'sub 2', body: 'too short.', approach: 'Question-first' },
                      { tone: 'Direct', subject: 'sub 3', body: 'too short.', approach: 'Direct' },
                      { tone: 'Curiosity', subject: 'sub 4', body: 'too short.', approach: 'Curiosity' }
                    ],
                    subjectLines: [{ text: 'sub 1', label: 'Direct' }],
                    evaluation: { overallScore: 85, strengths: ['s'], weaknesses: ['w'], suggestions: ['s'] },
                    followUps: []
                  })
                }]
              }
            }]
          })
        };
      } else {
        // Second attempt: 100 words — passes Standard validation (90–120 words)
        const validBody = Array(99).fill('word').join(' ') + '.';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    variants: [
                      { tone: 'Context', subject: 'sub 1', body: validBody, approach: 'Recipient-first' },
                      { tone: 'Question', subject: 'sub 2', body: validBody, approach: 'Question-first' },
                      { tone: 'Direct', subject: 'sub 3', body: validBody, approach: 'Direct' },
                      { tone: 'Curiosity', subject: 'sub 4', body: validBody, approach: 'Curiosity' }
                    ],
                    subjectLines: [{ text: 'sub 1', label: 'Direct' }],
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
    // Word count: 100 words (within Standard 90–120) ending with period
    const wordCount = res.body.variants[0].body.trim().split(/\s+/).length;
    assert.ok(wordCount >= 90 && wordCount <= 120, `Expected 90–120 words (Standard), got ${wordCount}`);
  });

  // -- Regression tests: sender/recipient bug and truncation ----------------

  it('CASE 1 - sender name must NOT appear in any variant greeting', async () => {
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          variants: [
            { tone: 'Context',   subject: 'Khaitan worth connecting',   greeting: 'Hi Rahul,', paragraphs: ['Reaching out regarding an internship at Khaitan.', 'Completed a corporate law internship at a top firm.'], cta: 'Would you be open to a brief conversation?',          signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 25, approach: 'Recipient-first'  },
            { tone: 'Question',  subject: 'Khaitan internship query',   greeting: 'Hi Rahul,', paragraphs: ['Is your team currently considering interns?', 'Prior corporate law experience backs this interest.'],      cta: 'Would a quick call make sense?',                       signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 20, approach: 'Question-first'   },
            { tone: 'Direct',    subject: 'Khaitan internship enquiry', greeting: 'Hi Rahul,', paragraphs: ['Third-year law student interested in an internship at Khaitan.'],                                           cta: 'Would you be able to point me to the right person?',  signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 18, approach: 'Direct'           },
            { tone: 'Curiosity', subject: 'curious about Khaitan',      greeting: 'Hi Rahul,', paragraphs: ['Following Khaitan corporate practice closely.', 'Prior internship gives useful context.'],                  cta: 'Would you be open to a short conversation?',          signOff: 'Warmly,', senderName: 'Saurav Joshi', wordCount: 22, approach: 'Curiosity-first' }
          ],
          subjectLines: [{ text: 'Khaitan worth connecting', label: 'Direct' }],
          evaluation: { overallScore: 85, strengths: [], weaknesses: [], suggestions: [] },
          followUps: []
        }) }] } }]
      })
    });

    const res = await request(app).post('/api/cold-email').send({
      action: 'generate', emailGoal: 'Internship', minLength: 1, maxLength: 500,
      recipient: { name: 'Rahul', company: 'Khaitan', position: 'Partner' },
      userContext: { name: 'Saurav Joshi', background: 'Completed a corporate law internship at a top firm.', whyContacting: '' }
    });

    assert.equal(res.status, 200);
    for (const v of res.body.variants) {
      const g = v.greeting || '';
      assert.ok(!g.toLowerCase().includes('saurav'), 'Sender name must not appear in greeting. Got: ' + g);
    }
    assert.ok(res.body.variants[0].greeting.includes('Rahul'), 'Greeting must address recipient Rahul');
  });

  it('CASE 2 - no recipient: AI echoed sender name, guardGreeting must fix it', async () => {
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          variants: [
            { tone: 'Context',   subject: 'Khaitan',   greeting: 'Hi Saurav Joshi,', paragraphs: ['Reaching out about internship opportunities at Khaitan.', 'Completed a corporate law internship.'], cta: 'Would you be open to a brief conversation?', signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 20, approach: 'test' },
            { tone: 'Question',  subject: 'Khaitan q', greeting: 'Hi Saurav Joshi,', paragraphs: ['Is your team considering interns?', 'Prior corporate law experience.'],                               cta: 'Would a quick call make sense?',             signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 16, approach: 'test' },
            { tone: 'Direct',    subject: 'Khaitan d', greeting: 'Hi Saurav Joshi,', paragraphs: ['Law student interested in Khaitan.'],                                                                 cta: 'Can you point me to the right person?',      signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 12, approach: 'test' },
            { tone: 'Curiosity', subject: 'Khaitan c', greeting: 'Hi Saurav Joshi,', paragraphs: ['Following Khaitan work.', 'Internship aligns with your practice.'],                                  cta: 'Would you be open to chatting?',             signOff: 'Warmly,', senderName: 'Saurav Joshi', wordCount: 18, approach: 'test' }
          ],
          subjectLines: [{ text: 'Khaitan', label: 'Direct' }],
          evaluation: { overallScore: 70, strengths: [], weaknesses: [], suggestions: [] },
          followUps: []
        }) }] } }]
      })
    });

    const res = await request(app).post('/api/cold-email').send({
      action: 'generate', emailGoal: 'Internship', minLength: 1, maxLength: 500,
      recipient: { name: '', company: 'Khaitan', position: 'Partner' },
      userContext: { name: 'Saurav Joshi', background: 'Corporate law internship at a top firm.', whyContacting: '' }
    });

    assert.equal(res.status, 200);
    for (const v of res.body.variants) {
      const g = v.greeting || '';
      assert.ok(!g.toLowerCase().includes('saurav'), 'guardGreeting failed. Got: ' + g);
    }
  });

  it('CASE (truncation) - truncated degree B. triggers fallback, not broken output', async () => {
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          variants: [
            { tone: 'Context',   subject: 'Khaitan',   greeting: 'Hi there,', paragraphs: ['A highly motivated third-year B.'], cta: 'Would you connect?', signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 10, approach: 'test' },
            { tone: 'Question',  subject: 'Khaitan q', greeting: 'Hi there,', paragraphs: ['A highly motivated third-year B.'], cta: 'Can we talk?',       signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 10, approach: 'test' },
            { tone: 'Direct',    subject: 'Khaitan d', greeting: 'Hi there,', paragraphs: ['A highly motivated third-year B.'], cta: 'Open to connect?',   signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 10, approach: 'test' },
            { tone: 'Curiosity', subject: 'Khaitan c', greeting: 'Hi there,', paragraphs: ['A highly motivated third-year B.'], cta: 'Worth connecting?',  signOff: 'Warmly,', senderName: 'Saurav Joshi', wordCount: 10, approach: 'test' }
          ],
          subjectLines: [{ text: 'Khaitan internship', label: 'Direct' }],
          evaluation: { overallScore: 70, strengths: [], weaknesses: [], suggestions: [] },
          followUps: []
        }) }] } }]
      })
    });

    const res = await request(app).post('/api/cold-email').send({
      action: 'generate', emailGoal: 'Internship', minLength: 1, maxLength: 500,
      recipient: { name: '', company: 'Khaitan', position: 'Partner' },
      userContext: { name: 'Saurav Joshi', background: 'A highly motivated third-year B.', whyContacting: '' }
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.variants, 'Fallback should return variants');
    for (const v of res.body.variants) {
      const text = [(v.paragraphs || []).join(' '), v.cta || ''].join(' ');
      assert.ok(!text.includes('third-year B.'), 'Truncated text must not appear in fallback output');
    }
  });
});
