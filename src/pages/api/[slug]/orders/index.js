/**
 * POST /api/[slug]/orders — Create a new order (customer, no auth)
 * GET  /api/[slug]/orders — List active orders (admin, session required)
 */
import { createOrder, getOrders, getRestaurant } from '../../../../lib/kv.js';
import { requireAuth } from '../../../../lib/auth.js';
import { sendSMS } from '../../../../lib/sms.js';
import { sanitise, sanitisePhone } from '../../../../lib/sanitise.js';

export async function POST({ params, request, locals }) {
  const kv = locals.runtime.env.MENULINX_KV;
  const { slug } = params;

  try {
    const body = await request.json();

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items in order' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!body.customerName || !body.customerPhone) {
      return new Response(JSON.stringify({ error: 'Name and phone number are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const sanitisedData = {
      items: body.items.map(i => ({
        id: i.id,
        name: sanitise(i.name),
        price: parseFloat(i.price) || 0,
        qty: parseInt(i.qty) || 1,
      })),
      customerName: sanitise(body.customerName),
      customerPhone: sanitisePhone(body.customerPhone),
      orderType: ['collection', 'delivery'].includes(body.orderType) ? body.orderType : 'collection',
      notes: sanitise(body.notes || ''),
      deliveryFee: parseFloat(body.deliveryFee) || 0,
    };

    const order = await createOrder(kv, slug, sanitisedData);

    // Fire SMS notification (non-blocking)
    const restaurant = await getRestaurant(kv, slug);
    sendSMS('orderReceived', order, restaurant).catch(() => {});

    return new Response(JSON.stringify({ success: true, order }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET({ params, request, locals }) {
  const kv = locals.runtime.env.MENULINX_KV;
  const kvSessions = locals.runtime.env.MENULINX_SESSIONS;
  const { slug } = params;

  const session = await requireAuth(request, kvSessions);
  if (!session || session.slug !== slug) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const orders = await getOrders(kv, slug);
  return new Response(JSON.stringify(orders), {
    headers: { 'Content-Type': 'application/json' },
  });
}
