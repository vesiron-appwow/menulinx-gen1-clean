/**
 * PUT /api/[slug]/settings — Update restaurant settings (admin)
 */
import { updateRestaurant } from '../../../lib/kv.js';
import { requireAuth } from '../../../lib/auth.js';
import { sanitise } from '../../../lib/sanitise.js';

export async function PUT({ params, request, locals }) {
  const kv = locals.runtime.env.MENULINX_KV;
  const kvSessions = locals.runtime.env.MENULINX_SESSIONS;
  const { slug } = params;

  const session = await requireAuth(request, kvSessions);
  if (!session || session.slug !== slug) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();

    const updates = {
      name: sanitise(body.name),
      tagline: sanitise(body.tagline || ''),
      currency: ['£', '€', '$'].includes(body.currency) ? body.currency : '£',
      deliveryFee: Math.max(0, parseFloat(body.deliveryFee) || 0),
      minOrder: Math.max(0, parseFloat(body.minOrder) || 0),
    };

    // SMS settings
    if (body.sms) {
      updates.sms = {
        enabled: !!body.sms.enabled,
        apiKey: (body.sms.apiKey || '').slice(0, 200),
        events: {
          orderReceived: body.sms.events?.orderReceived !== false,
          orderAccepted: body.sms.events?.orderAccepted !== false,
          orderReady: body.sms.events?.orderReady !== false,
          orderDelivered: body.sms.events?.orderDelivered !== false,
        },
      };
    }

    const updated = await updateRestaurant(kv, slug, updates);
    return new Response(JSON.stringify({ success: true, restaurant: updated }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
}
