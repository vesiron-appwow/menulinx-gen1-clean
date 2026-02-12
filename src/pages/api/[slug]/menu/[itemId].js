/**
 * DELETE /api/[slug]/menu/[itemId] — Delete a menu item (admin)
 */
import { deleteMenuItem } from '../../../../lib/kv.js';
import { requireAuth } from '../../../../lib/auth.js';

export async function DELETE({ params, request, locals }) {
  const kv = locals.runtime.env.MENULINX_KV;
  const kvSessions = locals.runtime.env.MENULINX_SESSIONS;
  const { slug, itemId } = params;

  const session = await requireAuth(request, kvSessions);
  if (!session || session.slug !== slug) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await deleteMenuItem(kv, slug, itemId);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
}
