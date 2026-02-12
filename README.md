# MenuLinx Trade

White-label restaurant ordering system — Astro + Cloudflare Pages + KV.

Each restaurant gets its own isolated instance with customer menu, admin dashboard, OCR menu import, order management, and SMS notifications via Connect98.

---

## What's Inside

| Area | What It Does |
|------|-------------|
| Customer menu | Browse menu, add to cart, checkout with name/phone |
| Admin dashboard | Orders, menu management, stats, settings — password gated |
| OCR import | Photograph a paper menu → auto-extract items → review → save to live |
| Order flow | New → Accepted → Ready → Delivered (enforced sequence) |
| SMS | Connect98 integration — toggleable per-event notifications |
| White-label | Each `/setup` creates an isolated restaurant instance |

---

## Security

- Passwords hashed with PBKDF2 (100,000 iterations, SHA-256)
- Session tokens in separate KV namespace, 8-hour auto-expiry
- HttpOnly + SameSite=Strict cookies
- All user input sanitised before storage
- Order status enforced as a state machine (no skipping steps)
- Orders auto-expire from KV after 7 days

---

## Deploy (5 Steps)

### 1. Prerequisites
- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI: `npm install -g wrangler`
- Login: `wrangler login`

### 2. Install
```bash
cd menulinx-trade
npm install
```

### 3. Create KV Namespaces
```bash
wrangler kv namespace create MENULINX_KV
wrangler kv namespace create MENULINX_SESSIONS
```
Each command outputs an ID — copy them.

### 4. Update wrangler.toml
Paste the KV IDs into `wrangler.toml` replacing the placeholder values.

### 5. Build & Deploy
```bash
npm run deploy
```
Cloudflare gives you a live URL like `https://menulinx-trade.pages.dev`

---

## Usage

1. Visit `/` → Create a restaurant (e.g. slug: `cozy-corner`)
2. Visit `/cozy-corner/admin/login` → Set password on first visit
3. Add menu items manually or via OCR photo import
4. Share `/cozy-corner` with customers
5. Orders appear in real-time on the admin dashboard (15-second polling)

---

## KV Data Structure

```
restaurant:{slug}              → Config (name, hours, fees, SMS settings)
restaurant:{slug}:menu         → Array of menu items
restaurant:{slug}:orders       → Array of active orders
restaurant:{slug}:order:{id}   → Individual order (TTL: 7 days)
restaurant:{slug}:stats:{date} → Daily stats (TTL: 90 days)
admin:{slug}:hash              → PBKDF2 password hash + salt
session:{token}                → Session data (TTL: 8 hours)
```

---

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/setup` | None | Create restaurant |
| POST | `/api/[slug]/orders` | None | Place order (customer) |
| GET | `/api/[slug]/orders` | Admin | List active orders |
| PATCH | `/api/[slug]/orders/[id]` | Admin | Update order status |
| POST | `/api/[slug]/menu` | Admin | Add menu item |
| DELETE | `/api/[slug]/menu/[id]` | Admin | Delete menu item |
| POST | `/api/[slug]/menu/bulk` | Admin | Bulk import from OCR |
| PUT | `/api/[slug]/settings` | Admin | Update settings |
| POST | `/api/[slug]/logout` | Admin | End session |
