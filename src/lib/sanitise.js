/**
 * INPUT SANITISATION — MenuLinx Trade
 * Escapes HTML entities to prevent injection attacks.
 */

export function sanitise(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim()
    .slice(0, 1000);
}

export function sanitisePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.replace(/[^\d+\-() ]/g, '').slice(0, 20);
}

export function sanitiseSlug(slug) {
  if (typeof slug !== 'string') return '';
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
}
