'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy-key';
const app = require('../server');

const originalFetch = global.fetch;

function mockGemini(text) {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text }]
          }
        }
      ]
    })
  });
}

describe('POST /api/interview-coach', () => {
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns 400 when action is missing', async () => {
    const res = await request(app)
      .post('/api/interview-coach')
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Missing required field: action');
  });

  it('generates structured interview questions', async () => {
    mockGemini(JSON.stringify({
      interview_title: 'Frontend Engineer Interview',
      interview_summary: 'Practice product and technical questions for this role.',
      questions: [
        {
          id: 'q1',
          question: 'Tell me about a UI you shipped that improved user experience.',
          category: 'technical',
          difficulty: 'medium',
          why_it_matters: 'Shows product thinking and delivery.',
          sample_points: ['Problem', 'Approach', 'Impact']
        },
        {
          id: 'q2',
          question: 'How do you handle feedback from design and product at the same time?',
          category: 'collaboration',
          difficulty: 'medium',
          why_it_matters: 'Checks cross-functional communication.',
          sample_points: ['Listening', 'Tradeoffs', 'Alignment']
        },
        {
          id: 'q3',
          question: 'Describe a bug you tracked down that took a while to isolate.',
          category: 'problem-solving',
          difficulty: 'hard',
          why_it_matters: 'Tests debugging depth.',
          sample_points: ['Investigation', 'Tools', 'Outcome']
        },
        {
          id: 'q4',
          question: 'Why do you want this role at the company?',
          category: 'motivation',
          difficulty: 'easy',
          why_it_matters: 'Measures fit and intent.',
          sample_points: ['Mission', 'Product', 'Growth']
        },
        {
          id: 'q5',
          question: 'What would you prioritize in your first 30 days?',
          category: 'strategy',
          difficulty: 'medium',
          why_it_matters: 'Shows prioritization and onboarding thinking.',
          sample_points: ['Learning', 'Quick wins', 'Relationships']
        }
      ]
    }));

    const res = await request(app)
      .post('/api/interview-coach')
      .send({
        action: 'generate_questions',
        jobTitle: 'Frontend Engineer',
        companyName: 'Acme Labs',
        jobDescription: 'Build customer-facing product features.',
        experienceLevel: 'Mid',
        interviewType: 'Technical'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.action, 'generate_questions');
    assert.equal(res.body.questions.length, 5);
    assert.equal(res.body.questions[0].id, 'q1');
    assert.match(res.body.interview_summary, /practice/i);
  });

  it('evaluates an answer with coaching feedback', async () => {
    mockGemini(JSON.stringify({
      score: 84,
      summary: 'Strong example with good structure, but the result could be quantified more clearly.',
      strengths: ['Clear storytelling', 'Relevant experience', 'Good ownership'],
      improvements: ['Add metrics', 'Tighten the opening', 'End with impact'],
      better_answer: 'I led the work ...',
      follow_up_question: 'What metric moved as a result of your work?'
    }));

    const res = await request(app)
      .post('/api/interview-coach')
      .send({
        action: 'evaluate_answer',
        question: 'Tell me about a project you shipped.',
        answer: 'I led a UI refresh and improved the experience for customers.',
        jobTitle: 'Frontend Engineer',
        companyName: 'Acme Labs',
        jobDescription: 'Build customer-facing product features.',
        experienceLevel: 'Mid',
        interviewType: 'Technical'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.action, 'evaluate_answer');
    assert.equal(res.body.score, 84);
    assert.equal(res.body.strengths.length, 3);
    assert.equal(res.body.follow_up_question, 'What metric moved as a result of your work?');
  });
});
