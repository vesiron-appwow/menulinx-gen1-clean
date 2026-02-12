/**
 * POST /api/[slug]/menu — Add a single menu item (admin)
 */
import { addMenuItem } from '../../../../lib/kv.js';
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
    const item = await addMenuItem(kv, slug, {
      name: sanitise(body.name),
      description: sanitise(body.description || ''),
      price: body.price,
      category: sanitise(body.category || 'Main'),
    });
    return new Response(JSON.stringify({ success: true, item }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
}
