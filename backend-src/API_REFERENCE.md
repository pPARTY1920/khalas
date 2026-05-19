# Food Ordering API — Reference

## Base URL
```
http://localhost:3000/api
```

## Authentication
All protected routes require:
```
Authorization: Bearer <accessToken>
```

Access tokens expire in **15 minutes**. Use the refresh endpoint to get a new one.

---

## Auth  `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | ❌ | Register a new user |
| POST | `/login` | ❌ | Login and receive tokens |
| POST | `/refresh` | ❌ | Rotate access + refresh token |
| POST | `/logout` | ✅ | Invalidate refresh token |
| GET | `/me` | ✅ | Get current user profile |
| PATCH | `/me` | ✅ | Update name / phone / address |

### POST `/auth/register`
```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "phone": "0771234567",
  "password": "securePass1",
  "delivery_address": "Kololo, Kampala"   // optional
}
```
**Response 201**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": 1, "name": "Alice", "email": "alice@example.com", "phone": "0771234567" }
}
```

### POST `/auth/login`
```json
{ "email": "alice@example.com", "password": "securePass1" }
```

### POST `/auth/refresh`
```json
{ "refreshToken": "eyJ..." }
```

---

## Categories  `/api/categories`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | ❌ | List all active categories |

**Response**
```json
[
  { "id": 1, "name": "Fast Food", "icon_url": "/icons/fastfood.png" },
  { "id": 2, "name": "Pizza",     "icon_url": "/icons/pizza.png" }
]
```

---

## Restaurants  `/api/restaurants`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | ❌ | List restaurants (with filters) |
| GET | `/:id` | ❌ | Get single restaurant |
| GET | `/:id/menu` | ❌ | Get restaurant menu |

### GET `/restaurants?category_id=1&search=kfc&open=true`

**Response**
```json
[
  {
    "id": 2,
    "name": "KFC",
    "description": "Finger lickin' good chicken",
    "logo_url": null,
    "address": "Garden City Mall, Kampala",
    "delivery_time_min": 30,
    "delivery_fee": 3500,
    "min_order_amount": 15000,
    "rating": 4.10,
    "rating_count": 0,
    "is_open": true,
    "category_id": 1,
    "category_name": "Fast Food"
  }
]
```

### GET `/restaurants/2/menu`
```json
{
  "restaurant": { "id": 2, "name": "KFC" },
  "menu": [
    { "id": 8, "name": "Zinger Burger", "description": "...", "price": 17000, "image_url": null, "is_available": true },
    { "id": 9, "name": "Original Recipe 3pc", "price": 22000, "is_available": true }
  ]
}
```

---

## Cart  `/api/cart`  *(requires auth)*

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | ✅ | Get current cart |
| POST | `/items` | ✅ | Add / update / remove item |
| DELETE | `/` | ✅ | Clear entire cart |

### POST `/cart/items`
```json
{ "menu_item_id": 8, "quantity": 2 }
```
- `quantity: 0` removes the item
- Adding from a **different restaurant** returns HTTP 409

**Response** — full cart object:
```json
{
  "id": 1,
  "restaurant_id": 2,
  "restaurant_name": "KFC",
  "delivery_fee": 3500,
  "min_order_amount": 15000,
  "items": [
    { "id": 1, "quantity": 2, "menu_item_id": 8, "name": "Zinger Burger", "price": 17000 }
  ],
  "subtotal": 34000,
  "total": 37500
}
```

---

## Orders  `/api/orders`  *(requires auth)*

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | ✅ | Place order from cart |
| GET | `/` | ✅ | List my orders |
| GET | `/:id` | ✅ | Get order details |
| PATCH | `/:id/cancel` | ✅ | Cancel a pending order |

### POST `/orders`
```json
{
  "delivery_address": "Plot 10, Kampala Road",   // optional if set in profile
  "notes": "Extra napkins please"
}
```
**Response 201**
```json
{
  "order_id": 5,
  "subtotal": 34000,
  "delivery_fee": 3500,
  "total_amount": 37500,
  "status": "pending"
}
```

### Order statuses
```
pending → paid → confirmed → preparing → out_for_delivery → delivered
                                                     ↘ cancelled
```

---

## Payments  `/api/payments`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/initiate` | ✅ | Start payment for an order |
| POST | `/webhook` | ❌ | Provider callback (server→server) |
| GET | `/status/:order_id` | ✅ | Poll payment status |

### POST `/payments/initiate`
```json
{ "order_id": 5, "phone": "0771234567" }
```
**Response**
```json
{
  "provider_tx_id": "uuid-from-provider",
  "instructions": "A USSD prompt has been sent to your phone. Enter your PIN to confirm."
}
```

### GET `/payments/status/5`
```json
{
  "order_id": 5,
  "order_status": "paid",
  "payment_status": "paid",
  "last_payment": { "provider_tx_id": "uuid", "status": "success", "created_at": "..." }
}
```

---

## Typical User Flow

```
1. GET  /categories              → show category list
2. GET  /restaurants?category_id=1  → user picks KFC
3. GET  /restaurants/2/menu      → show menu
4. POST /auth/register           → user creates account
5. POST /cart/items              → add items to cart
6. GET  /cart                    → review cart
7. POST /orders                  → place order (gets order_id)
8. POST /payments/initiate       → start payment
9. GET  /payments/status/:id     → poll until paid
10. GET /orders/:id              → show confirmation
```

---

## Error format
All errors follow:
```json
{ "error": "Human readable message" }
```

## HTTP status codes used
| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict (e.g. cart restaurant mismatch) |
| 429 | Rate limited |
| 500 | Server error |
