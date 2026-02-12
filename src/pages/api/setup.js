/**
 * POST /api/setup — Create a new restaurant
 */
import { createRestaurant } from '../../lib/kv.js';
import { sanitise, sanitiseSlug } from '../../lib/sanitise.js';

export async function POST({ request, locals }) {
  const kv = locals.runtime.env.MENULINX_KV;

  try {
    const body = await request.json();
    const slug = sanitiseSlug(body.slug);
    if (!slug || slug.length < 2) {
      return new Response(JSON.stringify({ error: 'Slug must be at least 2 characters (letters, numbers, hyphens only)' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const restaurant = await createRestaurant(kv, {
      slug,
      name: sanitise(body.name) || 'My Restaurant',
      tagline: sanitise(body.tagline),
      currency: body.currency || '£',
    });

    return new Response(JSON.stringify({ success: true, slug: restaurant.slug }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const status = err.message.includes('already exists') ? 409 : 400;
    return new Response(JSON.stringify({ error: err.message }), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  }
}
