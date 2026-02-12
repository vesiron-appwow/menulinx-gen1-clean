/**
 * POST /api/[slug]/logout — Destroy admin session
 */
import { destroySession, clearSessionCookie } from '../../../lib/auth.js';

export async function POST({ request, locals }) {
  const kvSessions = locals.runtime.env.MENULINX_SESSIONS;
  await destroySession(request, kvSessions);

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}
