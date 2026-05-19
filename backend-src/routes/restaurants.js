// routes/restaurants.js
const express = require('express');
const db      = require('../db');
const router  = express.Router();

// ─── GET /restaurants ─────────────────────────────────────────────────────────
// Query params:
//   ?category_id=1     filter by category
//   ?search=kfc        search by name
//   ?open=true         only open restaurants
router.get('/', async (req, res) => {
  try {
    const { category_id, search, open } = req.query;

    let sql = `
      SELECT
        r.id,
        r.name,
        r.description,
        r.logo_url,
        r.cover_url,
        r.address,
        r.delivery_time_min,
        r.delivery_fee,
        r.min_order_amount,
        r.rating,
        r.rating_count,
        r.is_open,
        c.id   AS category_id,
        c.name AS category_name
      FROM restaurants r
      JOIN categories c ON c.id = r.category_id
      WHERE r.is_active = TRUE
    `;
    const params = [];

    if (category_id) {
      sql += ' AND r.category_id = ?';
      params.push(Number(category_id));
    }
    if (search) {
      sql += ' AND r.name LIKE ?';
      params.push(`%${search}%`);
    }
    if (open === 'true') {
      sql += ' AND r.is_open = TRUE';
    }

    sql += ' ORDER BY r.rating DESC, r.name';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /restaurants/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
        r.*,
        c.name AS category_name
       FROM restaurants r
       JOIN categories c ON c.id = r.category_id
       WHERE r.id = ? AND r.is_active = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Restaurant not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /restaurants/:id/menu ────────────────────────────────────────────────
router.get('/:id/menu', async (req, res) => {
  try {
    // Verify restaurant exists
    const [rest] = await db.query(
      'SELECT id, name FROM restaurants WHERE id = ? AND is_active = TRUE',
      [req.params.id]
    );
    if (!rest.length) return res.status(404).json({ error: 'Restaurant not found' });

    const [items] = await db.query(
      `SELECT id, name, description, price, image_url, is_available
       FROM menu_items
       WHERE restaurant_id = ?
       ORDER BY sort_order, name`,
      [req.params.id]
    );

    res.json({
      restaurant: rest[0],
      menu: items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
