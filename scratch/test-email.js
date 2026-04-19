const handler = require('../api/cold-email');

const req = {
  method: 'POST',
  body: {
    company: 'Stripe',
    recipientTitle: 'Head of Engineering',
    recipientName: 'Alex',
    senderName: 'Saurav',
    background: 'Software engineer with 5 years exp',
    purpose: 'Job inquiry',
    valueProposition: 'Reduced latency by 40%',
    industry: 'Tech',
    tone: 'Professional',
    length: 'Medium'
  },
  headers: {}
};

const res = {
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    console.log('Status:', this.statusCode);
    console.log('Data:', JSON.stringify(data, null, 2));
  }
};

require('dotenv').config();
handler(req, res).catch(console.error);
