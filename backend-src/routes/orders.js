// routes/orders.js
const express  = require('express');
const db       = require('../db');
const { auth } = require('../middleware/auth');
const router   = express.Router();

router.use(auth);

// ─── POST /orders ─────────────────────────────────────────────────────────────
// Converts the cart into a confirmed order (payment happens separately)
// Body: { delivery_address?, notes? }
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const userId = req.user.id;

    // 1. Load cart
    const [carts] = await conn.query(
      'SELECT id, restaurant_id FROM carts WHERE user_id = ?',
      [userId]
    );
    if (!carts.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Your cart is empty' });
    }

    const cart = carts[0];

    // 2. Load cart items with current prices
    const [cartItems] = await conn.query(
      `SELECT ci.quantity, mi.id AS menu_item_id, mi.name, mi.price, mi.is_available
       FROM cart_items ci
       JOIN menu_items mi ON mi.id = ci.menu_item_id
       WHERE ci.cart_id = ?`,
      [cart.id]
    );
    if (!cartItems.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Your cart is empty' });
    }

    // 3. Validate items are still available
    const unavailable = cartItems.filter(i => !i.is_available).map(i => i.name);
    if (unavailable.length) {
      await conn.rollback();
      return res.status(400).json({ error: `These items are no longer available: ${unavailable.join(', ')}` });
    }

    // 4. Load restaurant (delivery fee, min order)
    const [rests] = await conn.query(
      'SELECT id, name, delivery_fee, min_order_amount, is_open FROM restaurants WHERE id = ?',
      [cart.restaurant_id]
    );
    const restaurant = rests[0];
    if (!restaurant.is_open) {
      await conn.rollback();
      return res.status(400).json({ error: 'Restaurant is currently closed' });
    }

    // 5. Calculate totals
    const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (subtotal < restaurant.min_order_amount) {
      await conn.rollback();
      return res.status(400).json({
        error: `Minimum order amount is ${restaurant.min_order_amount}. Current subtotal: ${subtotal.toFixed(2)}`
      });
    }
    const delivery_fee   = parseFloat(restaurant.delivery_fee);
    const total_amount   = parseFloat((subtotal + delivery_fee).toFixed(2));

    // 6. Resolve delivery address (body > user profile)
    let deliveryAddress = req.body.delivery_address;
    if (!deliveryAddress) {
      const [user] = await conn.query(
        'SELECT delivery_address FROM users WHERE id = ?',
        [userId]
      );
      deliveryAddress = user[0].delivery_address;
    }
    if (!deliveryAddress) {
      await conn.rollback();
      return res.status(400).json({ error: 'delivery_address is required' });
    }

    // 7. Create order
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (user_id, restaurant_id, delivery_address, subtotal, delivery_fee, total_amount, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        userId, cart.restaurant_id, deliveryAddress,
        parseFloat(subtotal.toFixed(2)), delivery_fee, total_amount,
        req.body.notes || null
      ]
    );
    const orderId = orderResult.insertId;

    // 8. Insert order items (price snapshot)
    const orderItems = cartItems.map(i => [
      orderId, i.menu_item_id, i.name, i.price, i.quantity,
      parseFloat((i.price * i.quantity).toFixed(2))
    ]);
    await conn.query(
      'INSERT INTO order_items (order_id, menu_item_id, name, unit_price, quantity, line_total) VALUES ?',
      [orderItems]
    );

    // 9. Clear the cart
    await conn.query('DELETE FROM carts WHERE id = ?', [cart.id]);

    await conn.commit();

    res.status(201).json({
      message: 'Order created — proceed to payment',
      order_id: orderId,
      subtotal: parseFloat(subtotal.toFixed(2)),
      delivery_fee,
      total_amount,
      status: 'pending'
    });
  } catch (err) {
    await conn.rollback();
    console.error('order error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// ─── GET /orders ──────────────────────────────────────────────────────────────
// List the current user's orders (most recent first)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         o.id, o.status, o.payment_status, o.total_amount,
         o.delivery_fee, o.subtotal, o.created_at,
         r.id AS restaurant_id, r.name AS restaurant_name, r.logo_url
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /orders/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT
         o.*,
         r.name AS restaurant_name, r.logo_url, r.phone AS restaurant_phone
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.id = ? AND o.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });

    const order = orders[0];

    const [items] = await db.query(
      'SELECT name, unit_price, quantity, line_total FROM order_items WHERE order_id = ?',
      [order.id]
    );

    res.json({ ...order, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /orders/:id/cancel ─────────────────────────────────────────────────
// Only allow cancellation when still pending / unpaid
router.patch('/:id/cancel', async (req, res) => {
  try {
    const [orders] = await db.query(
      'SELECT id, status, payment_status FROM orders WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });

    const { status, payment_status } = orders[0];
    if (!['pending', 'paid'].includes(status)) {
      return res.status(400).json({ error: `Cannot cancel an order with status: ${status}` });
    }
    if (payment_status === 'paid' && status !== 'pending') {
      return res.status(400).json({ error: 'Paid orders can only be cancelled before restaurant confirms' });
    }

    await db.query(
      "UPDATE orders SET status = 'cancelled' WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Order cancelled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
