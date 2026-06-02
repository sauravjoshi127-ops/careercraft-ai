'use strict';

process.env.NODE_ENV = 'test';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

describe('POST /api/interview-coach', () => {
  it('returns 400 when action is missing', async () => {
    const res = await request(app)
      .post('/api/interview-coach')
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Missing required field: action');
  });

  it('builds a resume-aware practice set locally', async () => {
    const res = await request(app)
      .post('/api/interview-coach')
      .send({
        action: 'generate_questions',
        jobTitle: 'Frontend Engineer',
        companyName: 'Acme Labs',
        jobDescription: 'Build customer-facing product features with React, collaboration, and performance.',
        experienceLevel: 'Mid',
        interviewType: 'Technical',
        resumeText: 'Built reusable UI components and shipped product experiments.',
        focusAreas: 'React, performance, collaboration'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.action, 'generate_questions');
    assert.equal(res.body.questions.length, 5);
    assert.match(res.body.interview_summary, /resume and job details/i);
    assert.ok(Array.isArray(res.body.prep_notes));
    assert.ok(res.body.questions[2].question.toLowerCase().includes('resume'));
    assert.ok(res.body.questions.every(question => Array.isArray(question.scoring_criteria)));
    assert.ok(res.body.questions.every(question => question.time_limit_seconds > 0));
    assert.match(res.body.questions[1].question, /React|performance|collaboration/i);
  });

  it('scores answers using resume and job context', async () => {
    const res = await request(app)
      .post('/api/interview-coach')
      .send({
        action: 'evaluate_answer',
        question: 'Tell me about a project you shipped.',
        answer: 'I led a UI refresh for a customer dashboard, improved performance by 20%, and worked with design and product to tighten the rollout. I owned the implementation, handled the tricky bugs, and used feedback from the team to keep the experience simple for users.',
        jobTitle: 'Frontend Engineer',
        companyName: 'Acme Labs',
        jobDescription: 'Build customer-facing product features with React, collaboration, and performance.',
        experienceLevel: 'Mid',
        interviewType: 'Technical',
        resumeText: 'Built reusable UI components and shipped product experiments.',
        focusAreas: 'React, performance, collaboration'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.action, 'evaluate_answer');
    assert.ok(res.body.score >= 60);
    assert.ok(res.body.strengths.length > 0);
    assert.ok(res.body.improvements.length > 0);
    assert.ok(res.body.weaknesses.length > 0);
    assert.ok(res.body.better_answer.length > 0);
    assert.equal(typeof res.body.score_breakdown.clarity, 'number');
    assert.equal(typeof res.body.rubric.relevance, 'number');
  });
});
