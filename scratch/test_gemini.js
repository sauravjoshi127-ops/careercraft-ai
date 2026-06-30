const { callGemini } = require('../utils/gemini');
require('../utils/env-loader');

async function testGemini() {
  console.log('Testing Gemini API call...');
  const start = Date.now();
  try {
    const apiKey = require('../utils/gemini').getApiKey();
    console.log('API Key starts with:', apiKey.substring(0, 10));
    
    // Test 1: Authorization Header
    console.log('\n--- Trying Authorization Header ---');
    const urlHeader = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent`;
    const responseHeader = await fetch(urlHeader, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello, respond with exactly "Hi there" to test connectivity.' }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 50 }
      })
    });
    console.log('Status:', responseHeader.status);
    console.log('Response:', await responseHeader.text());

    // Test 2: Query Parameter
    console.log('\n--- Trying Query Parameter ---');
    const urlParam = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const responseParam = await fetch(urlParam, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello, respond with exactly "Hi there" to test connectivity.' }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 50 }
      })
    });
    console.log('Status:', responseParam.status);
    console.log('Response:', await responseParam.text());
  } catch (err) {
    console.error('Error calling Gemini:', err);
  }
}

testGemini();
