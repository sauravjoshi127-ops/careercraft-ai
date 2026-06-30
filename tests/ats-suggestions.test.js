'use strict';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy-key';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

const originalFetch = global.fetch;

describe('POST /api/ats-suggestions', () => {
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
        .post('/api/ats-suggestions')
        .send({
          letter: 'Dear Hiring Manager, I am writing to apply...',
          jobDescription: 'Seeking a detail-oriented analyst...'
        });
      assert.equal(res.status, 401);
      assert.match(res.body.error, /authentication/i);
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/ats-suggestions')
      .send({
        letter: '',
        jobDescription: 'Write code.'
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /missing required fields/i);
  });

  it('successfully analyzes the cover letter and returns structured suggestions', async () => {
    const mockGeminiJson = {
      overallATSScore: 87,
      keywordMatch: 82,
      recruiterReadability: 91,
      professionalTone: 89,
      personalization: 84,
      suggestions: [
        {
          id: 'ats-s-1',
          category: 'Missing Keyword',
          priority: 'High',
          title: 'Add Contract Drafting',
          description: 'The job description emphasizes contract drafting, but it is missing from the cover letter.',
          currentText: 'I worked on legal agreements.',
          suggestedText: 'My experience includes drafting, reviewing, and negotiating commercial contracts while ensuring regulatory compliance.',
          reason: 'Improves ATS keyword matching.',
          estimatedATSGain: '+4%',
          oneClickApplicable: true
        }
      ],
      summary: {
        overallATSScore: 87,
        topImprovements: ["Add contract drafting", "Quantify legal achievements"],
        estimatedATSAfterApplying: 95,
        recruiterLikelihood: "High",
        confidenceLevel: "High"
      }
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
      .post('/api/ats-suggestions')
      .send({
        letter: 'Dear Hiring Manager, I worked on legal agreements. Sincerely, Alex',
        jobDescription: 'Must have experience in contract drafting.',
        jobTitle: 'Legal Counsel',
        companyName: 'Acme Corp',
        resumeText: 'Legal Assistant at XYZ',
        industry: 'Legal',
        experienceLevel: 'Mid'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.overallATSScore, 87);
    assert.equal(res.body.keywordMatch, 82);
    assert.equal(res.body.recruiterReadability, 91);
    assert.equal(res.body.professionalTone, 89);
    assert.equal(res.body.personalization, 84);
    assert.equal(res.body.suggestions.length, 1);
    assert.equal(res.body.suggestions[0].title, 'Add Contract Drafting');
    assert.equal(res.body.suggestions[0].oneClickApplicable, true);
    assert.equal(res.body.summary.estimatedATSAfterApplying, 95);
  });
});
