// server.js — entry point
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

// Route handlers
const authRouter        = require('./routes/auth');
const categoriesRouter  = require('./routes/categories');
const restaurantsRouter = require('./routes/restaurants');
const cartRouter        = require('./routes/cart');
const ordersRouter      = require('./routes/orders');
const paymentRouter     = require('./routes/payment');

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',  // tighten in production
  methods: ['GET', 'POST', 'PATCH', 'DELETE']
}));

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,  // tighter limit for auth endpoints
  message: { error: 'Too many auth attempts, please try again later' }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRouter);
app.use('/api/categories',  categoriesRouter);
app.use('/api/restaurants', restaurantsRouter);
app.use('/api/cart',        cartRouter);
app.use('/api/orders',      ordersRouter);
app.use('/api/payments',    paymentRouter);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`🚀  Server running on http://localhost:${PORT}`);
  console.log(`📋  API base: http://localhost:${PORT}/api`);
});
