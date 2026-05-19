-- ============================================================
-- FOOD ORDERING SYSTEM — DATABASE SCHEMA
-- Compatible with MySQL 8.0+
-- ============================================================

CREATE DATABASE IF NOT EXISTS food_ordering CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE food_ordering;

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100)        NOT NULL,
  email           VARCHAR(150)        NOT NULL UNIQUE,
  phone           VARCHAR(20)         NOT NULL UNIQUE,
  password_hash   VARCHAR(255)        NOT NULL,
  delivery_address TEXT               NULL,
  role            ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  is_active       BOOLEAN             NOT NULL DEFAULT TRUE,
  created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- REFRESH TOKENS  (JWT rotation)
-- ─────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED    NOT NULL,
  token_hash  VARCHAR(255)    NOT NULL UNIQUE,
  expires_at  DATETIME        NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- CATEGORIES  (e.g. Fast Food, Pizza, Burgers …)
-- ─────────────────────────────────────────────
CREATE TABLE categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)     NOT NULL UNIQUE,
  icon_url    VARCHAR(500)    NULL,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- RESTAURANTS
-- ─────────────────────────────────────────────
CREATE TABLE restaurants (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id      INT UNSIGNED    NOT NULL,
  name             VARCHAR(120)    NOT NULL,
  description      TEXT            NULL,
  logo_url         VARCHAR(500)    NULL,
  cover_url        VARCHAR(500)    NULL,
  address          VARCHAR(300)    NOT NULL,
  latitude         DECIMAL(9,6)    NULL,
  longitude        DECIMAL(9,6)    NULL,
  phone            VARCHAR(20)     NULL,
  delivery_time_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,  -- minutes
  delivery_fee     DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  min_order_amount DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  rating           DECIMAL(3,2)    NOT NULL DEFAULT 0.00,
  rating_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  is_open          BOOLEAN         NOT NULL DEFAULT TRUE,
  is_active        BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- ─────────────────────────────────────────────
-- MENU ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE menu_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED    NOT NULL,
  name          VARCHAR(150)    NOT NULL,
  description   TEXT            NULL,
  price         DECIMAL(10,2)   NOT NULL,
  image_url     VARCHAR(500)    NULL,
  is_available  BOOLEAN         NOT NULL DEFAULT TRUE,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  INDEX idx_restaurant (restaurant_id)
);

-- ─────────────────────────────────────────────
-- CARTS  (one active cart per user)
-- ─────────────────────────────────────────────
CREATE TABLE carts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED    NOT NULL UNIQUE,   -- one cart per user
  restaurant_id INT UNSIGNED    NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE cart_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cart_id      INT UNSIGNED    NOT NULL,
  menu_item_id INT UNSIGNED    NOT NULL,
  quantity     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cart_item (cart_id, menu_item_id),
  FOREIGN KEY (cart_id)      REFERENCES carts(id)      ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE orders (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED    NOT NULL,
  restaurant_id     INT UNSIGNED    NOT NULL,
  status            ENUM(
                      'pending',      -- created, waiting for payment
                      'paid',         -- payment confirmed
                      'confirmed',    -- restaurant accepted
                      'preparing',    -- kitchen working
                      'out_for_delivery',
                      'delivered',
                      'cancelled'
                    ) NOT NULL DEFAULT 'pending',
  delivery_address  TEXT            NOT NULL,
  subtotal          DECIMAL(10,2)   NOT NULL,
  delivery_fee      DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total_amount      DECIMAL(10,2)   NOT NULL,
  notes             TEXT            NULL,
  payment_method    VARCHAR(50)     NULL,
  payment_status    ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
  payment_reference VARCHAR(200)    NULL,   -- provider transaction ID
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE RESTRICT,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE RESTRICT,
  INDEX idx_user   (user_id),
  INDEX idx_status (status)
);

CREATE TABLE order_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED    NOT NULL,
  menu_item_id INT UNSIGNED    NOT NULL,
  name         VARCHAR(150)    NOT NULL,   -- snapshot at order time
  unit_price   DECIMAL(10,2)   NOT NULL,  -- snapshot at order time
  quantity     TINYINT UNSIGNED NOT NULL,
  line_total   DECIMAL(10,2)   NOT NULL,
  FOREIGN KEY (order_id)     REFERENCES orders(id)     ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
);

-- ─────────────────────────────────────────────
-- PAYMENTS  (log every payment attempt)
-- ─────────────────────────────────────────────
CREATE TABLE payments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id          INT UNSIGNED    NOT NULL,
  provider          VARCHAR(50)     NOT NULL,   -- e.g. 'mtn_momo', 'flutterwave'
  provider_tx_id    VARCHAR(200)    NULL,
  amount            DECIMAL(10,2)   NOT NULL,
  currency          VARCHAR(10)     NOT NULL DEFAULT 'UGX',
  status            ENUM('initiated','success','failed','pending') NOT NULL DEFAULT 'initiated',
  raw_response      JSON            NULL,       -- store full provider response
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order (order_id)
);

-- ─────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────
INSERT INTO categories (name, icon_url, sort_order) VALUES
  ('Fast Food',  '/icons/fastfood.png',  1),
  ('Pizza',      '/icons/pizza.png',     2),
  ('Burgers',    '/icons/burger.png',    3),
  ('Chicken',    '/icons/chicken.png',   4),
  ('Drinks',     '/icons/drinks.png',    5);

INSERT INTO restaurants
  (category_id, name, description, address, delivery_time_min, delivery_fee, min_order_amount, rating, is_open)
VALUES
  (1, 'McDonald''s', 'World famous burgers & fries',
   'Kampala Road, Kampala', 25, 3000, 10000, 4.20, TRUE),

  (1, 'KFC', 'Finger lickin'' good chicken',
   'Garden City Mall, Kampala', 30, 3500, 15000, 4.10, TRUE);

-- McDonald's menu
INSERT INTO menu_items (restaurant_id, name, description, price, sort_order) VALUES
  (1, 'Big Mac',             'Two beef patties, special sauce, lettuce, cheese',  15000, 1),
  (1, 'McChicken',           'Crispy chicken fillet burger',                       15000, 2),
  (1, 'Cheeseburger',        'Classic single beef with cheese',                   10000, 3),
  (1, 'Chicken McNuggets 6', 'Six crispy nuggets with dipping sauce',             12000, 4),
  (1, 'Large Fries',         'Golden crispy fries',                                7000, 5),
  (1, 'McFlurry Oreo',       'Creamy ice cream with Oreo crumbles',                9000, 6),
  (1, 'Coke 500ml',          'Ice cold Coca-Cola',                                 5000, 7);

-- KFC menu
INSERT INTO menu_items (restaurant_id, name, description, price, sort_order) VALUES
  (2, 'Zinger Burger',       'Spicy chicken fillet burger',                        17000, 1),
  (2, 'Original Recipe 3pc', 'Three pieces of the Colonel''s original chicken',   22000, 2),
  (2, 'Hot Wings 5pc',       'Five spicy fried chicken wings',                    15000, 3),
  (2, 'Streetwise 2',        'Two pieces chicken with chips',                     18000, 4),
  (2, 'Coleslaw',            'Creamy coleslaw side',                               4000, 5),
  (2, 'Pepsi 500ml',         'Ice cold Pepsi',                                     5000, 6),
  (2, 'Krushers Vanilla',    'Creamy blended vanilla drink',                       9000, 7);
