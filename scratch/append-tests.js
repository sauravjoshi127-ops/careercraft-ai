// Script to append regression tests to cold-email-advanced.test.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'tests', 'cold-email-advanced.test.js');
let content = fs.readFileSync(file, 'utf8');

// Find the last closing '});' and insert before it
const closingMarker = '\r\n});\r\n';
const lastIdx = content.lastIndexOf(closingMarker);
if (lastIdx === -1) {
  console.error('ERROR: Could not find closing marker');
  process.exit(1);
}

const newTests = [
  '',
  '  // -- Regression tests: sender/recipient bug and truncation ----------------',
  '',
  "  it('CASE 1 - sender name must NOT appear in any variant greeting', async () => {",
  "    global.fetch = async () => ({",
  "      ok: true, status: 200,",
  "      json: async () => ({",
  "        candidates: [{ content: { parts: [{ text: JSON.stringify({",
  "          variants: [",
  "            { tone: 'Context',   subject: 'Khaitan worth connecting',   greeting: 'Hi Rahul,', paragraphs: ['Reaching out regarding an internship at Khaitan.', 'Completed a corporate law internship at a top firm.'], cta: 'Would you be open to a brief conversation?',          signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 25, approach: 'Recipient-first'  },",
  "            { tone: 'Question',  subject: 'Khaitan internship query',   greeting: 'Hi Rahul,', paragraphs: ['Is your team currently considering interns?', 'Prior corporate law experience backs this interest.'],      cta: 'Would a quick call make sense?',                       signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 20, approach: 'Question-first'   },",
  "            { tone: 'Direct',    subject: 'Khaitan internship enquiry', greeting: 'Hi Rahul,', paragraphs: ['Third-year law student interested in an internship at Khaitan.'],                                           cta: 'Would you be able to point me to the right person?',  signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 18, approach: 'Direct'           },",
  "            { tone: 'Curiosity', subject: 'curious about Khaitan',      greeting: 'Hi Rahul,', paragraphs: ['Following Khaitan corporate practice closely.', 'Prior internship gives useful context.'],                  cta: 'Would you be open to a short conversation?',          signOff: 'Warmly,', senderName: 'Saurav Joshi', wordCount: 22, approach: 'Curiosity-first' }",
  "          ],",
  "          subjectLines: [{ text: 'Khaitan worth connecting', label: 'Direct' }],",
  "          evaluation: { overallScore: 85, strengths: [], weaknesses: [], suggestions: [] },",
  "          followUps: []",
  "        }) }] } }]",
  "      })",
  "    });",
  "",
  "    const res = await request(app).post('/api/cold-email').send({",
  "      action: 'generate', emailGoal: 'Internship', minLength: 1, maxLength: 500,",
  "      recipient: { name: 'Rahul', company: 'Khaitan', position: 'Partner' },",
  "      userContext: { name: 'Saurav Joshi', background: 'Completed a corporate law internship at a top firm.', whyContacting: '' }",
  "    });",
  "",
  "    assert.equal(res.status, 200);",
  "    for (const v of res.body.variants) {",
  "      const g = v.greeting || '';",
  "      assert.ok(!g.toLowerCase().includes('saurav'), 'Sender name must not appear in greeting. Got: ' + g);",
  "    }",
  "    assert.ok(res.body.variants[0].greeting.includes('Rahul'), 'Greeting must address recipient Rahul');",
  "  });",
  "",
  "  it('CASE 2 - no recipient: AI echoed sender name, guardGreeting must fix it', async () => {",
  "    global.fetch = async () => ({",
  "      ok: true, status: 200,",
  "      json: async () => ({",
  "        candidates: [{ content: { parts: [{ text: JSON.stringify({",
  "          variants: [",
  "            { tone: 'Context',   subject: 'Khaitan',   greeting: 'Hi Saurav Joshi,', paragraphs: ['Reaching out about internship opportunities at Khaitan.', 'Completed a corporate law internship.'], cta: 'Would you be open to a brief conversation?', signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 20, approach: 'test' },",
  "            { tone: 'Question',  subject: 'Khaitan q', greeting: 'Hi Saurav Joshi,', paragraphs: ['Is your team considering interns?', 'Prior corporate law experience.'],                               cta: 'Would a quick call make sense?',             signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 16, approach: 'test' },",
  "            { tone: 'Direct',    subject: 'Khaitan d', greeting: 'Hi Saurav Joshi,', paragraphs: ['Law student interested in Khaitan.'],                                                                 cta: 'Can you point me to the right person?',      signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 12, approach: 'test' },",
  "            { tone: 'Curiosity', subject: 'Khaitan c', greeting: 'Hi Saurav Joshi,', paragraphs: ['Following Khaitan work.', 'Internship aligns with your practice.'],                                  cta: 'Would you be open to chatting?',             signOff: 'Warmly,', senderName: 'Saurav Joshi', wordCount: 18, approach: 'test' }",
  "          ],",
  "          subjectLines: [{ text: 'Khaitan', label: 'Direct' }],",
  "          evaluation: { overallScore: 70, strengths: [], weaknesses: [], suggestions: [] },",
  "          followUps: []",
  "        }) }] } }]",
  "      })",
  "    });",
  "",
  "    const res = await request(app).post('/api/cold-email').send({",
  "      action: 'generate', emailGoal: 'Internship', minLength: 1, maxLength: 500,",
  "      recipient: { name: '', company: 'Khaitan', position: 'Partner' },",
  "      userContext: { name: 'Saurav Joshi', background: 'Corporate law internship at a top firm.', whyContacting: '' }",
  "    });",
  "",
  "    assert.equal(res.status, 200);",
  "    for (const v of res.body.variants) {",
  "      const g = v.greeting || '';",
  "      assert.ok(!g.toLowerCase().includes('saurav'), 'guardGreeting failed. Got: ' + g);",
  "    }",
  "  });",
  "",
  "  it('CASE (truncation) - truncated degree B. triggers fallback, not broken output', async () => {",
  "    global.fetch = async () => ({",
  "      ok: true, status: 200,",
  "      json: async () => ({",
  "        candidates: [{ content: { parts: [{ text: JSON.stringify({",
  "          variants: [",
  "            { tone: 'Context',   subject: 'Khaitan',   greeting: 'Hi there,', paragraphs: ['A highly motivated third-year B.'], cta: 'Would you connect?', signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 10, approach: 'test' },",
  "            { tone: 'Question',  subject: 'Khaitan q', greeting: 'Hi there,', paragraphs: ['A highly motivated third-year B.'], cta: 'Can we talk?',       signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 10, approach: 'test' },",
  "            { tone: 'Direct',    subject: 'Khaitan d', greeting: 'Hi there,', paragraphs: ['A highly motivated third-year B.'], cta: 'Open to connect?',   signOff: 'Best,',   senderName: 'Saurav Joshi', wordCount: 10, approach: 'test' },",
  "            { tone: 'Curiosity', subject: 'Khaitan c', greeting: 'Hi there,', paragraphs: ['A highly motivated third-year B.'], cta: 'Worth connecting?',  signOff: 'Warmly,', senderName: 'Saurav Joshi', wordCount: 10, approach: 'test' }",
  "          ],",
  "          subjectLines: [{ text: 'Khaitan internship', label: 'Direct' }],",
  "          evaluation: { overallScore: 70, strengths: [], weaknesses: [], suggestions: [] },",
  "          followUps: []",
  "        }) }] } }]",
  "      })",
  "    });",
  "",
  "    const res = await request(app).post('/api/cold-email').send({",
  "      action: 'generate', emailGoal: 'Internship', minLength: 1, maxLength: 500,",
  "      recipient: { name: '', company: 'Khaitan', position: 'Partner' },",
  "      userContext: { name: 'Saurav Joshi', background: 'A highly motivated third-year B.', whyContacting: '' }",
  "    });",
  "",
  "    assert.equal(res.status, 200);",
  "    assert.ok(res.body.variants, 'Fallback should return variants');",
  "    for (const v of res.body.variants) {",
  "      const text = [(v.paragraphs || []).join(' '), v.cta || ''].join(' ');",
  "      assert.ok(!text.includes('third-year B.'), 'Truncated text must not appear in fallback output');",
  "    }",
  "  });"
].join('\r\n');

const before = content.slice(0, lastIdx);
const newContent = before + '\r\n' + newTests + '\r\n});\r\n';
fs.writeFileSync(file, newContent, 'utf8');
console.log('Done. New file length:', newContent.length);
