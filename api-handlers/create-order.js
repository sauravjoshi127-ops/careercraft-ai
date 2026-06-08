'use strict';

const Razorpay = require('razorpay');
const { authenticateRequest } = require('../utils/supabase');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_TEST_KEY',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_TEST_SECRET'
});

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate the user requesting order creation
    await authenticateRequest(req);

    const { amount, planId } = req.body || {};
    
    if (!amount || !planId) {
      return res.status(400).json({ error: 'Amount and planId are required' });
    }

    const options = {
      amount: amount * 100, // amount in the smallest currency unit (paise for INR)
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    
    return res.status(200).json({
      id: order.id,
      currency: order.currency,
      amount: order.amount,
      key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_TEST_KEY'
    });
  } catch (error) {
    console.error("Razorpay create order error:", error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to create payment order' });
  }
};
