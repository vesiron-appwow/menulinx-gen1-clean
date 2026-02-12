/**
 * PATCH /api/[slug]/orders/[orderId] — Update order status
 */
import { updateOrderStatus, getRestaurant } from '../../../../lib/kv.js';
import { requireAuth } from '../../../../lib/auth.js';
import { sendSMS } from '../../../../lib/sms.js';

const STATUS_TO_EVENT = {
  accepted: 'orderAccepted',
  ready: 'orderReady',
  delivered: 'orderDelivered',
  rejected: 'orderRejected',
};

export async function PATCH({ params, request, locals }) {
  const kv = locals.runtime.env.MENULINX_KV;
  const kvSessions = locals.runtime.env.MENULINX_SESSIONS;
  const { slug, orderId } = params;

  const session = await requireAuth(request, kvSessions);
  if (!session || session.slug !== slug) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { status } = await request.json();
    if (!status || !STATUS_TO_EVENT[status]) {
      return new Response(JSON.stringify({ error: 'Invalid status' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const order = await updateOrderStatus(kv, slug, orderId, status);

    // Fire SMS
    const restaurant = await getRestaurant(kv, slug);
    const event = STATUS_TO_EVENT[status];
    if (event) sendSMS(event, order, restaurant).catch(() => {});

    return new Response(JSON.stringify({ success: true, order }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
}
