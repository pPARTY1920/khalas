// routes/categories.js
const express = require('express');
const db      = require('../db');
const router  = express.Router();

// GET /categories — list all active categories
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, icon_url FROM categories WHERE is_active = TRUE ORDER BY sort_order, name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
