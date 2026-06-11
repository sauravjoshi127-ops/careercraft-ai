'use strict';

const crypto = require('crypto');
const { authenticateRequest } = require('../utils/supabase');

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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment details' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({ success: false, message: "Razorpay billing credentials are not configured on the server." });
    }

    // Verify signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", keySecret)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    console.log(`Payment successful for order: ${razorpay_order_id}, Plan: ${planId}`);

    // Authenticate the user from authorization header
    const { user, supabase } = await authenticateRequest(req);

    // Perform metadata upgrade
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // If service role is available, use the admin API
      const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { plan: 'pro', isPro: true }
      });
      if (updateErr) {
        throw new Error(`Failed to update user via admin API: ${updateErr.message}`);
      }
      console.log(`Successfully upgraded user ${user.id} to Pro via service role admin API.`);
    } else {
      // Fallback to updating via the authenticated client (using setSession token)
      const { error: updateErr } = await supabase.auth.updateUser({
        data: { plan: 'pro', isPro: true }
      });
      if (updateErr) {
        throw new Error(`Failed to update user via client API: ${updateErr.message}`);
      }
      console.log(`Successfully upgraded user ${user.id} to Pro via client updateUser.`);
    }

    return res.status(200).json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    console.error("Razorpay verification error:", error);
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Server error during verification" });
  }
};
