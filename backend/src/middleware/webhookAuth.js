const crypto = require('crypto');
const winston = require('winston');

/**
 * Webhook Authentication Middleware
 * Implements secure webhook signature verification
 */

// Webhook security logger
const webhookLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/webhook-security.log' }),
    new winston.transports.Console({ 
      format: winston.format.simple(),
      level: 'warn'
    })
  ]
});

/**
 * Ramp Webhook Signature Verification
 */
const verifyRampWebhook = (req, res, next) => {
  try {
    const signature = req.headers['x-ramp-signature'];
    const timestamp = req.headers['x-ramp-timestamp'];
    
    if (!signature || !timestamp) {
      webhookLogger.warn('Ramp webhook missing security headers', {
        ip: req.ip,
        headers: Object.keys(req.headers)
      });
      return res.status(401).json({ error: 'Missing security headers' });
    }

    // Verify timestamp (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    const webhookTimestamp = parseInt(timestamp);
    
    if (Math.abs(now - webhookTimestamp) > 300) { // 5 minutes tolerance
      webhookLogger.warn('Ramp webhook timestamp too old', {
        now,
        webhookTimestamp,
        difference: now - webhookTimestamp,
        ip: req.ip
      });
      return res.status(401).json({ error: 'Request timestamp too old' });
    }

    // Verify signature
    const secret = process.env.RAMP_WEBHOOK_SECRET;
    if (!secret) {
      webhookLogger.error('Ramp webhook secret not configured');
      return res.status(500).json({ error: 'Webhook configuration error' });
    }

    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(timestamp + '.' + payload)
      .digest('hex');
    
    const providedSignature = signature.replace('sha256=', '');
    
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    )) {
      webhookLogger.warn('Invalid Ramp webhook signature', {
        ip: req.ip,
        providedSignature: providedSignature.substring(0, 8) + '...',
        timestamp
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    webhookLogger.info('Valid Ramp webhook received', {
      timestamp,
      ip: req.ip
    });

    next();
  } catch (error) {
    webhookLogger.error('Ramp webhook verification error', {
      error: error.message,
      ip: req.ip
    });
    return res.status(500).json({ error: 'Signature verification failed' });
  }
};

/**
 * MoonPay Webhook Signature Verification
 */
const verifyMoonPayWebhook = (req, res, next) => {
  try {
    const signature = req.headers['moonpay-signature'];
    
    if (!signature) {
      webhookLogger.warn('MoonPay webhook missing signature', {
        ip: req.ip
      });
      return res.status(401).json({ error: 'Missing signature header' });
    }

    const secret = process.env.MOONPAY_WEBHOOK_SECRET;
    if (!secret) {
      webhookLogger.error('MoonPay webhook secret not configured');
      return res.status(500).json({ error: 'Webhook configuration error' });
    }

    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    )) {
      webhookLogger.warn('Invalid MoonPay webhook signature', {
        ip: req.ip,
        providedSignature: signature.substring(0, 8) + '...'
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    webhookLogger.info('Valid MoonPay webhook received', {
      ip: req.ip
    });

    next();
  } catch (error) {
    webhookLogger.error('MoonPay webhook verification error', {
      error: error.message,
      ip: req.ip
    });
    return res.status(500).json({ error: 'Signature verification failed' });
  }
};

/**
 * Generic webhook rate limiter
 */
const webhookRateLimit = require('express-rate-limit')({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhooks per minute per IP
  message: { error: 'Too many webhook requests' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    webhookLogger.warn('Webhook rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({ error: 'Too many webhook requests' });
  }
});

module.exports = {
  verifyRampWebhook,
  verifyMoonPayWebhook,
  webhookRateLimit
};