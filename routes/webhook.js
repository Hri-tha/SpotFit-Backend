// routes/webhook.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

router.post('/razorpay-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');
  
  if (expectedSignature === signature) {
    const event = JSON.parse(req.body);
    
    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        // Update order status
        break;
      case 'payment.failed':
        // Handle failed payment
        break;
      case 'order.paid':
        // Handle order paid
        break;
    }
    
    res.json({ status: 'ok' });
  } else {
    res.status(400).json({ status: 'invalid signature' });
  }
});

module.exports = router;