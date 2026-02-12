/**
 * POST /api/[slug]/menu/bulk — Bulk add menu items from OCR import (admin)
 */
import { bulkAddMenuItems } from '../../../../lib/kv.js';
import { requireAuth } from '../../../../lib/auth.js';
import { sanitise } from '../../../../lib/sanitise.js';

export async function POST({ params, request, locals }) {
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
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items provided' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.items.length > 200) {
      return new Response(JSON.stringify({ error: 'Maximum 200 items per import' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const sanitisedItems = body.items.map(i => ({
      name: sanitise(i.name),
      description: sanitise(i.description || ''),
      price: i.price,
      category: sanitise(i.category || 'Main'),
    }));

    const added = await bulkAddMenuItems(kv, slug, sanitisedItems);
    return new Response(JSON.stringify({ success: true, count: added.length }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
