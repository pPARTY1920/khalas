# Khalas Food Ordering App

A polished food ordering web application with landing, restaurant browsing, menu ordering, cart checkout, and authentication screens.

## Application Flow

              ┌───────────────┐
              │  index.html   │ ◄─────────────────────────┐
              │ (Landing Page)│                           │
              └───────┬───────┘                           │
                      │ (Browse / Get Started)            │
                      ▼                                   │
            ┌──────────────────┐                          │
            │  restaurant.html │                          │
            │(Directory Grid)  │                          │
            └─────────┬────────┘                          │
                      │ (Select Restaurant)               │
                      ▼                                   │
            ┌──────────────────┐ ◄─────────────────┐      │
            │    order.html    │                   │      │
            │  (Menu Page)     │                   │      │
            └─────────┬────────┘                   │      │
                      │ (Cart Nav / View)          │      │
                      ▼                            │      │
            ┌──────────────────┐                   │      │
            │    cart.html     │ ──────────────────┘      │
            │ (Checkout View)  │ (Continue Shopping)      │
            └──────────────────┘                          │
                                                          │
    =================== AUTH STREAM ===================   │
                                                          │
     ┌───────────────┐           ┌──────────────────┐     │
     │login (1).html │ ◄───────► │   signin.html    │     │
     │  (Sign In)    │           │ (Create Account) │     │
     └───────┬───────┘           └────────┬─────────┘     │
             │                            │               │
             └────────────────────────────┴───────────────┘
                 (On Success Form Validation Redirect)

---

## ✨ Features

### 💻 Client UI & Layout
- Landing page entry with clear navigation from `index.html`.
- Restaurant directory in `restaurant.html` for browsing a grid of options.
- Menu ordering flow in `order.html`.
- Cart checkout flow in `cart.html`.
- Authentication screens in `login (1).html` and `signin.html`.

### ⚙️ Application Logic
- Page-to-page routing using direct HTML navigation links.
- Order flow that moves from restaurant selection to menu and cart.
- Authentication form flow that can validate input and redirect on success.
- Restaurant card flow linking into the menu view.
- Client-side cart updates and order review.

### 🛠 Improvements
- Connected core pages with explicit route anchors.
- Added auth redirect flow support for login and sign-in.
- Stabilized menu/back-navigation behavior.
- Documented current app flow, features, and changelog.

---

## 📋 Change Log

### [v1.1.1] 2026-05-21
**Added**
- `README.md` with application flow diagram, feature list, and changelog.
- Clear explanation of page relationships and behavior.

**Changed**
- Reintroduced the app documentation after removal.

**Fixed**
- No code changes in this update; this commit restores workspace documentation.

---

## Notes

- This file is on branch `test16`.
- Pushed to `https://github.com/pPARTY1920/khalas.git`.
