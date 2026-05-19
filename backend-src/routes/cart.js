// routes/cart.js
const express  = require('express');
const db       = require('../db');
const { auth } = require('../middleware/auth');
const router   = express.Router();

// All cart routes require authentication
router.use(auth);

// ─── helper: fetch full cart for a user ──────────────────────────────────────
async function getCart(userId) {
  const [carts] = await db.query(
    `SELECT c.id, c.restaurant_id, r.name AS restaurant_name,
            r.delivery_fee, r.min_order_amount
     FROM carts c
     JOIN restaurants r ON r.id = c.restaurant_id
     WHERE c.user_id = ?`,
    [userId]
  );
  if (!carts.length) return null;

  const cart = carts[0];

  const [items] = await db.query(
    `SELECT ci.id, ci.quantity,
            mi.id AS menu_item_id, mi.name, mi.price, mi.image_url
     FROM cart_items ci
     JOIN menu_items mi ON mi.id = ci.menu_item_id
     WHERE ci.cart_id = ?
     ORDER BY ci.id`,
    [cart.id]
  );

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return {
    id:               cart.id,
    restaurant_id:    cart.restaurant_id,
    restaurant_name:  cart.restaurant_name,
    delivery_fee:     cart.delivery_fee,
    min_order_amount: cart.min_order_amount,
    items,
    subtotal:         parseFloat(subtotal.toFixed(2)),
    total:            parseFloat((subtotal + cart.delivery_fee).toFixed(2))
  };
}

// ─── GET /cart ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const cart = await getCart(req.user.id);
    res.json(cart || { items: [], subtotal: 0, total: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /cart/items ─────────────────────────────────────────────────────────
// Body: { menu_item_id, quantity }
// Rules:
//   - If user has no cart → create one for that restaurant
//   - If user adds item from a DIFFERENT restaurant → reject with clear message
//   - quantity = 0 → remove the item
router.post('/items', async (req, res) => {
  const { menu_item_id, quantity } = req.body;

  if (!menu_item_id) return res.status(400).json({ error: 'menu_item_id required' });
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'quantity must be >= 0' });

  try {
    // Fetch the menu item (to know its restaurant)
    const [items] = await db.query(
      'SELECT id, restaurant_id, name, price, is_available FROM menu_items WHERE id = ?',
      [menu_item_id]
    );
    if (!items.length) return res.status(404).json({ error: 'Menu item not found' });

    const item = items[0];
    if (!item.is_available) return res.status(400).json({ error: 'This item is currently unavailable' });

    // Does the user already have a cart?
    const [carts] = await db.query(
      'SELECT id, restaurant_id FROM carts WHERE user_id = ?',
      [req.user.id]
    );

    let cartId;
    if (carts.length === 0) {
      // Create new cart for this restaurant
      if (qty === 0) return res.status(400).json({ error: 'Cannot add 0 items' });
      const [result] = await db.query(
        'INSERT INTO carts (user_id, restaurant_id) VALUES (?,?)',
        [req.user.id, item.restaurant_id]
      );
      cartId = result.insertId;
    } else {
      const cart = carts[0];
      // Enforce single-restaurant rule
      if (cart.restaurant_id !== item.restaurant_id) {
        return res.status(409).json({
          error: 'Your cart contains items from a different restaurant. Clear your cart first.',
          current_restaurant_id: cart.restaurant_id
        });
      }
      cartId = cart.id;
    }

    if (qty === 0) {
      // Remove item
      await db.query(
        'DELETE FROM cart_items WHERE cart_id = ? AND menu_item_id = ?',
        [cartId, menu_item_id]
      );
    } else {
      // Upsert
      await db.query(
        `INSERT INTO cart_items (cart_id, menu_item_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = ?`,
        [cartId, menu_item_id, qty, qty]
      );
    }

    // Auto-delete empty cart
    const [remaining] = await db.query(
      'SELECT COUNT(*) AS cnt FROM cart_items WHERE cart_id = ?',
      [cartId]
    );
    if (remaining[0].cnt === 0) {
      await db.query('DELETE FROM carts WHERE id = ?', [cartId]);
    }

    const cart = await getCart(req.user.id);
    res.json(cart || { items: [], subtotal: 0, total: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /cart ─────────────────────────────────────────────────────────────
// Clear the entire cart (e.g. user wants to switch restaurant)
router.delete('/', async (req, res) => {
  try {
    const [carts] = await db.query(
      'SELECT id FROM carts WHERE user_id = ?',
      [req.user.id]
    );
    if (carts.length) {
      await db.query('DELETE FROM carts WHERE id = ?', [carts[0].id]);
    }
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
