// routes/payment.js
//
// Payment flow:
//   1. POST /payments/initiate  → call provider, get redirect URL or prompt user for USSD PIN
//   2. Provider calls back      → POST /payments/webhook (server-to-server)
//   3. Webhook verifies & updates order status
//
// The `PaymentProvider` class below is a thin wrapper you swap out
// for your actual provider (MTN MoMo, Airtel Money, Flutterwave, etc.)

const express  = require('express');
const crypto   = require('crypto');
const db       = require('../db');
const { auth } = require('../middleware/auth');
const router   = express.Router();

// ════════════════════════════════════════════════════════════════════════════
// PAYMENT PROVIDER ADAPTER — swap this class for your real integration
// ════════════════════════════════════════════════════════════════════════════
class PaymentProvider {
  constructor() {
    this.name        = process.env.PAYMENT_PROVIDER  || 'mtn_momo';
    this.apiKey      = process.env.PAYMENT_API_KEY;
    this.secret      = process.env.PAYMENT_SECRET;
    this.baseUrl     = process.env.PAYMENT_BASE_URL;
    this.callbackUrl = process.env.PAYMENT_CALLBACK_URL;
    this.currency    = process.env.PAYMENT_CURRENCY  || 'UGX';
  }

  /**
   * Initiate a payment request.
   * Returns { providerTxId, redirectUrl?, instructions? }
   *
   * ── MTN MoMo example (Collections API) ──
   * Replace the fetch call below with your real provider's SDK / HTTP call.
   */
  async initiate({ orderId, amount, phone, description }) {
    const referenceId = crypto.randomUUID();

    // ── Uncomment and adapt for MTN MoMo ──────────────────────────────────
    // const response = await fetch(`${this.baseUrl}/collection/v1_0/requesttopay`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization':          `Bearer ${await this.#getAccessToken()}`,
    //     'X-Reference-Id':         referenceId,
    //     'X-Target-Environment':   'sandbox',      // 'production' in prod
    //     'Content-Type':           'application/json',
    //     'Ocp-Apim-Subscription-Key': this.apiKey,
    //   },
    //   body: JSON.stringify({
    //     amount:       String(amount),
    //     currency:     this.currency,
    //     externalId:   String(orderId),
    //     payer:        { partyIdType: 'MSISDN', partyId: phone },
    //     payerMessage: description,
    //     payeeNote:    `Order #${orderId}`,
    //   })
    // });
    // if (!response.ok) throw new Error(`MoMo error: ${response.status}`);
    // return { providerTxId: referenceId, instructions: 'Check your phone for USSD prompt' };

    // ── SIMULATION (remove in production) ─────────────────────────────────
    console.log(`[PaymentProvider] Simulating payment for order ${orderId}, amount ${amount} ${this.currency}`);
    return {
      providerTxId:  referenceId,
      instructions: 'A USSD prompt has been sent to your phone. Enter your PIN to confirm.',
    };
  }

  /**
   * Verify a payment from the webhook payload.
   * Returns { success: boolean, providerTxId: string }
   */
  verifyWebhook(payload, signature, rawBody) {
    // ── Flutterwave example ────────────────────────────────────────────────
    // const hash = crypto.createHmac('sha256', this.secret).update(rawBody).digest('hex');
    // if (hash !== signature) return { success: false };
    // return { success: payload.status === 'successful', providerTxId: payload.data?.id };

    // ── MTN MoMo example ──────────────────────────────────────────────────
    // (MoMo doesn't sign webhooks by default; instead poll the API to confirm)
    // return { success: payload.status === 'SUCCESSFUL', providerTxId: payload.referenceId };

    // ── SIMULATION ────────────────────────────────────────────────────────
    return { success: payload.status === 'SUCCESSFUL', providerTxId: payload.referenceId };
  }
}

const provider = new PaymentProvider();

// ─── POST /payments/initiate ─────────────────────────────────────────────────
// Body: { order_id, phone }
router.post('/initiate', auth, async (req, res) => {
  const { order_id, phone } = req.body;
  if (!order_id || !phone) {
    return res.status(400).json({ error: 'order_id and phone are required' });
  }

  try {
    // Load order & verify ownership
    const [orders] = await db.query(
      'SELECT id, total_amount, payment_status, status FROM orders WHERE id = ? AND user_id = ?',
      [order_id, req.user.id]
    );
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });

    const order = orders[0];
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot pay for a cancelled order' });
    }

    // Initiate payment with provider
    const { providerTxId, redirectUrl, instructions } = await provider.initiate({
      orderId:     order.id,
      amount:      order.total_amount,
      phone,
      description: `Food order #${order.id}`
    });

    // Log payment attempt
    await db.query(
      `INSERT INTO payments (order_id, provider, provider_tx_id, amount, currency, status)
       VALUES (?, ?, ?, ?, ?, 'initiated')`,
      [order.id, provider.name, providerTxId, order.total_amount, provider.currency]
    );

    res.json({
      message: 'Payment initiated',
      provider_tx_id: providerTxId,
      redirect_url:   redirectUrl  || null,
      instructions:   instructions || null,
    });
  } catch (err) {
    console.error('payment initiate error:', err);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// ─── POST /payments/webhook ──────────────────────────────────────────────────
// Called by the payment provider server-to-server
// No JWT auth — provider posts here directly; we verify via signature instead
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-signature'] || req.headers['verif-hash'] || '';
  const rawBody   = JSON.stringify(req.body);  // works because express.json() already parsed

  try {
    const { success, providerTxId } = provider.verifyWebhook(req.body, signature, rawBody);

    if (!providerTxId) {
      return res.status(400).json({ error: 'Missing provider transaction id' });
    }

    // Find the payment record
    const [payments] = await db.query(
      'SELECT id, order_id FROM payments WHERE provider_tx_id = ? LIMIT 1',
      [providerTxId]
    );
    if (!payments.length) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    const payment = payments[0];
    const newPaymentStatus = success ? 'success' : 'failed';

    // Update payment record
    await db.query(
      'UPDATE payments SET status = ?, raw_response = ? WHERE id = ?',
      [newPaymentStatus, JSON.stringify(req.body), payment.id]
    );

    if (success) {
      // Mark order as paid & confirmed
      await db.query(
        `UPDATE orders
         SET payment_status = 'paid', payment_reference = ?, status = 'paid', payment_method = ?
         WHERE id = ?`,
        [providerTxId, provider.name, payment.order_id]
      );
      console.log(`✅  Order #${payment.order_id} marked as PAID`);
    } else {
      console.log(`❌  Payment failed for order #${payment.order_id}`);
    }

    // Always respond 200 to the provider to acknowledge receipt
    res.sendStatus(200);
  } catch (err) {
    console.error('webhook error:', err);
    res.sendStatus(500);
  }
});

// ─── GET /payments/status/:order_id ──────────────────────────────────────────
// Poll payment status (useful for providers that push USSD prompts)
router.get('/status/:order_id', auth, async (req, res) => {
  try {
    const [orders] = await db.query(
      'SELECT id, payment_status, status FROM orders WHERE id = ? AND user_id = ?',
      [req.params.order_id, req.user.id]
    );
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });

    const [payments] = await db.query(
      'SELECT provider_tx_id, status, created_at FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.order_id]
    );

    res.json({
      order_id:       Number(req.params.order_id),
      order_status:   orders[0].status,
      payment_status: orders[0].payment_status,
      last_payment:   payments[0] || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
