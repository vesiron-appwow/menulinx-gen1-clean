/**
 * KV DATA LAYER — MenuLinx Trade
 * All Cloudflare KV read/write operations.
 *
 * Key structure:
 *   restaurant:{slug}              → Restaurant config
 *   restaurant:{slug}:menu         → Array of menu items
 *   restaurant:{slug}:orders       → Array of active order summaries
 *   restaurant:{slug}:order:{id}   → Individual order detail (TTL 7 days)
 *   restaurant:{slug}:stats:{date} → Daily stats (TTL 90 days)
 *   admin:{slug}:hash              → PBKDF2 password hash + salt
 */

// ── HELPERS ──

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

async function getJSON(kv, key) {
  const raw = await kv.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function putJSON(kv, key, data, opts) {
  await kv.put(key, JSON.stringify(data), opts);
}

// ── RESTAURANT ──

export async function getRestaurant(kv, slug) {
  return getJSON(kv, `restaurant:${slug}`);
}

export async function createRestaurant(kv, data) {
  const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  const existing = await getRestaurant(kv, slug);
  if (existing) throw new Error('Restaurant slug already exists');

  const restaurant = {
    slug,
    name: data.name || 'My Restaurant',
    tagline: data.tagline || '',
    currency: data.currency || '£',
    deliveryFee: data.deliveryFee || 0,
    minOrder: data.minOrder || 0,
    orderTypes: data.orderTypes || ['collection', 'delivery'],
    themeColor: data.themeColor || '#28A745',
    sms: { enabled: false, apiKey: '', events: {} },
    createdAt: new Date().toISOString(),
  };

  await putJSON(kv, `restaurant:${slug}`, restaurant);
  await putJSON(kv, `restaurant:${slug}:menu`, []);
  await putJSON(kv, `restaurant:${slug}:orders`, []);
  return restaurant;
}

export async function updateRestaurant(kv, slug, updates) {
  const restaurant = await getRestaurant(kv, slug);
  if (!restaurant) throw new Error('Restaurant not found');
  const updated = { ...restaurant, ...updates, slug };
  await putJSON(kv, `restaurant:${slug}`, updated);
  return updated;
}

// ── MENU ──

export async function getMenu(kv, slug) {
  return (await getJSON(kv, `restaurant:${slug}:menu`)) || [];
}

export async function addMenuItem(kv, slug, item) {
  const menu = await getMenu(kv, slug);
  const newItem = {
    id: uid(),
    name: item.name || 'Unnamed Item',
    description: item.description || '',
    price: parseFloat(item.price) || 0,
    category: item.category || 'Main',
    available: item.available !== false,
    createdAt: new Date().toISOString(),
  };
  menu.push(newItem);
  await putJSON(kv, `restaurant:${slug}:menu`, menu);
  return newItem;
}

export async function bulkAddMenuItems(kv, slug, items) {
  const menu = await getMenu(kv, slug);
  const newItems = items.map(item => ({
    id: uid(),
    name: item.name || 'Unnamed Item',
    description: item.description || '',
    price: parseFloat(item.price) || 0,
    category: item.category || 'Main',
    available: true,
    createdAt: new Date().toISOString(),
  }));
  menu.push(...newItems);
  await putJSON(kv, `restaurant:${slug}:menu`, menu);
  return newItems;
}

export async function updateMenuItem(kv, slug, itemId, updates) {
  const menu = await getMenu(kv, slug);
  const idx = menu.findIndex(i => i.id === itemId);
  if (idx === -1) throw new Error('Item not found');
  menu[idx] = { ...menu[idx], ...updates, id: itemId };
  await putJSON(kv, `restaurant:${slug}:menu`, menu);
  return menu[idx];
}

export async function deleteMenuItem(kv, slug, itemId) {
  const menu = await getMenu(kv, slug);
  const filtered = menu.filter(i => i.id !== itemId);
  await putJSON(kv, `restaurant:${slug}:menu`, filtered);
}

// ── ORDERS ──

const ORDER_TTL = 60 * 60 * 24 * 7; // 7 days

export async function getOrders(kv, slug) {
  return (await getJSON(kv, `restaurant:${slug}:orders`)) || [];
}

export async function createOrder(kv, slug, data) {
  const order = {
    id: uid(),
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    orderType: data.orderType || 'collection',
    items: data.items,
    subtotal: data.items.reduce((sum, i) => sum + (i.price * (i.qty || 1)), 0),
    deliveryFee: data.deliveryFee || 0,
    total: 0,
    notes: data.notes || '',
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  order.total = order.subtotal + order.deliveryFee;

  // Store full order with TTL
  await putJSON(kv, `restaurant:${slug}:order:${order.id}`, order, { expirationTtl: ORDER_TTL });

  // Add summary to active list
  const orders = await getOrders(kv, slug);
  orders.unshift(order);
  await putJSON(kv, `restaurant:${slug}:orders`, orders);

  // Update stats
  await incrementStats(kv, slug, order.total);

  return order;
}

export async function updateOrderStatus(kv, slug, orderId, newStatus) {
  const validFlow = {
    new: ['accepted', 'rejected'],
    accepted: ['ready', 'rejected'],
    ready: ['delivered'],
  };

  const orders = await getOrders(kv, slug);
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx === -1) throw new Error('Order not found');

  const current = orders[idx].status;
  if (!validFlow[current] || !validFlow[current].includes(newStatus)) {
    throw new Error(`Cannot move from "${current}" to "${newStatus}"`);
  }

  orders[idx].status = newStatus;
  orders[idx].updatedAt = new Date().toISOString();

  // If delivered or rejected, remove from active list after short delay
  if (newStatus === 'delivered' || newStatus === 'rejected') {
    const completed = orders.splice(idx, 1)[0];
    await putJSON(kv, `restaurant:${slug}:order:${completed.id}`, completed, { expirationTtl: ORDER_TTL });
  }

  await putJSON(kv, `restaurant:${slug}:orders`, orders);
  return orders[idx] || { id: orderId, status: newStatus };
}

// ── STATS ──

async function incrementStats(kv, slug, orderTotal) {
  const dateKey = today();
  const key = `restaurant:${slug}:stats:${dateKey}`;
  const stats = (await getJSON(kv, key)) || { date: dateKey, orders: 0, revenue: 0 };
  stats.orders += 1;
  stats.revenue += orderTotal;
  await putJSON(kv, key, stats, { expirationTtl: 60 * 60 * 24 * 90 });
}

export async function getDailyStats(kv, slug) {
  const dateKey = today();
  return (await getJSON(kv, `restaurant:${slug}:stats:${dateKey}`)) || { date: dateKey, orders: 0, revenue: 0 };
}

// ── ADMIN PASSWORD ──

export async function getAdminHash(kv, slug) {
  return getJSON(kv, `admin:${slug}:hash`);
}

export async function setAdminHash(kv, slug, hashData) {
  await putJSON(kv, `admin:${slug}:hash`, hashData);
}
