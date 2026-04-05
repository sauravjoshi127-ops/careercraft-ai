'use strict';

/**
 * Backend tests for POST /api/upload-resume
 * Run with: npm test
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
const PDFKit = require('pdfkit');

// Load the app without starting the HTTP server
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy-key';
const app = require('../server');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a minimal valid PDF buffer using PDFKit (already in project deps).
 */
function buildPdfBuffer(text) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFKit({ margin: 50 });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.text(text || 'Sample resume content for testing.');
    doc.end();
  });
}

/**
 * Pre-built minimal DOCX fixture.
 * Content: "Jane Smith Product Manager 8 years experience in Agile and roadmap planning"
 */
const DOCX_BUFFER = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'sample-resume.docx')
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/upload-resume', () => {
  let pdfBuffer;

  before(async () => {
    pdfBuffer = await buildPdfBuffer(
      'John Doe\nSoftware Engineer\nSkills: JavaScript, Node.js, React\nExperience: 5 years'
    );
  });

  it('returns 400 when no file is uploaded (empty multipart body)', async () => {
    const res = await request(app)
      .post('/api/upload-resume')
      .field('_dummy', 'value'); // multipart with no file field
    assert.equal(res.status, 400);
    assert.ok(res.body.error, 'Response should contain an error message');
  });

  it('returns 400 for unsupported file type (text/plain)', async () => {
    const res = await request(app)
      .post('/api/upload-resume')
      .attach('resume', Buffer.from('hello world'), {
        filename: 'notes.txt',
        contentType: 'text/plain'
      });
    assert.equal(res.status, 400);
    assert.ok(res.body.error, 'Response should contain an error message');
    assert.match(res.body.error, /pdf|docx|accepted/i);
  });

  it('returns 413 when file exceeds 5 MB', async () => {
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 0x41);
    const res = await request(app)
      .post('/api/upload-resume')
      .attach('resume', bigBuffer, {
        filename: 'big.pdf',
        contentType: 'application/pdf'
      });
    assert.equal(res.status, 413);
    assert.ok(res.body.error, 'Response should contain an error message');
    assert.match(res.body.error, /5 mb|too large|size/i);
  });

  it('returns 200 and extracted text for a valid PDF', async () => {
    const res = await request(app)
      .post('/api/upload-resume')
      .attach('resume', pdfBuffer, {
        filename: 'resume.pdf',
        contentType: 'application/pdf'
      });
    assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${res.body.error || ''}`);
    assert.ok(typeof res.body.resumeText === 'string', 'resumeText should be a string');
    assert.ok(res.body.resumeText.length > 0, 'resumeText should not be empty');
    assert.match(res.body.resumeText, /John Doe/i);
  });

  it('returns 200 and extracted text for a valid DOCX', async () => {
    const res = await request(app)
      .post('/api/upload-resume')
      .attach('resume', DOCX_BUFFER, {
        filename: 'resume.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
    assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${res.body.error || ''}`);
    assert.ok(typeof res.body.resumeText === 'string', 'resumeText should be a string');
    assert.ok(res.body.resumeText.length > 0, 'resumeText should not be empty');
    assert.match(res.body.resumeText, /Jane Smith/i);
  });

  it('accepts a PDF sent as application/octet-stream (mobile browser behaviour)', async () => {
    const res = await request(app)
      .post('/api/upload-resume')
      .attach('resume', pdfBuffer, {
        filename: 'resume.pdf',
        contentType: 'application/octet-stream'
      });
    assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${res.body.error || ''}`);
    assert.ok(res.body.resumeText.length > 0, 'resumeText should not be empty');
  });

  it('accepts a DOCX sent as application/octet-stream (mobile browser behaviour)', async () => {
    const res = await request(app)
      .post('/api/upload-resume')
      .attach('resume', DOCX_BUFFER, {
        filename: 'resume.docx',
        contentType: 'application/octet-stream'
      });
    assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${res.body.error || ''}`);
    assert.ok(res.body.resumeText.length > 0, 'resumeText should not be empty');
  });

  it('returns a JSON error body (never HTML or empty) for all error cases', async () => {
    const cases = [
      {
        buf: Buffer.from('not a pdf'),
        filename: 'bad.txt',
        mime: 'text/plain',
        expectedStatus: 400
      },
      {
        buf: Buffer.alloc(6 * 1024 * 1024),
        filename: 'huge.pdf',
        mime: 'application/pdf',
        expectedStatus: 413
      }
    ];

    for (const { buf, filename, mime, expectedStatus } of cases) {
      const res = await request(app)
        .post('/api/upload-resume')
        .attach('resume', buf, { filename, contentType: mime });

      assert.equal(
        res.status, expectedStatus,
        `File "${filename}": expected ${expectedStatus}, got ${res.status}`
      );
      assert.ok(
        res.body && typeof res.body.error === 'string' && res.body.error.length > 0,
        `File "${filename}": response body should have a non-empty "error" string, got: ${JSON.stringify(res.body)}`
      );
    }
  });

  it('never returns 500 for a corrupt PDF — returns 422 with error message', async () => {
    const corruptPdf = Buffer.from('%PDF-1.4 corrupt data that cannot be parsed xyz!@#');
    const res = await request(app)
      .post('/api/upload-resume')
      .attach('resume', corruptPdf, {
        filename: 'corrupt.pdf',
        contentType: 'application/pdf'
      });
    assert.notEqual(res.status, 500, 'Must never return 500 for a parse error');
    assert.ok(res.body.error, 'Response should contain an error message');
  });
});
