/**
 * SMS LIBRARY — Connect98 Integration
 * Sends SMS notifications for order lifecycle events.
 * Non-blocking: failures are logged but never break order flow.
 */

const CONNECT98_URL = 'https://api.connect98.com/sms/send';

const TEMPLATES = {
  orderReceived: (order, rest) =>
    `Hi ${order.customerName}, your order #${order.id.slice(-4)} has been received by ${rest.name}! We'll update you when it's accepted.`,

  orderAccepted: (order, rest) =>
    `Great news! ${rest.name} has accepted your order #${order.id.slice(-4)} and is preparing it now.`,

  orderReady: (order, rest) =>
    order.orderType === 'delivery'
      ? `Your order #${order.id.slice(-4)} from ${rest.name} is on its way!`
      : `Your order #${order.id.slice(-4)} is ready for collection at ${rest.name}!`,

  orderDelivered: (order, rest) =>
    `Your order #${order.id.slice(-4)} from ${rest.name} has been delivered. Enjoy your meal!`,

  orderRejected: (order, rest) =>
    `Sorry, ${rest.name} was unable to fulfil your order #${order.id.slice(-4)} at this time. Please contact them directly for details.`,
};

export async function sendSMS(event, order, restaurant) {
  if (!restaurant.sms || !restaurant.sms.enabled || !restaurant.sms.apiKey) return;
  if (restaurant.sms.events && restaurant.sms.events[event] === false) return;
  if (!order.customerPhone) return;

  const template = TEMPLATES[event];
  if (!template) return;

  const message = template(order, restaurant);

  try {
    await fetch(CONNECT98_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${restaurant.sms.apiKey}`,
      },
      body: JSON.stringify({
        to: order.customerPhone,
        message,
        from: restaurant.name.slice(0, 11),
      }),
    });
  } catch (err) {
    console.error(`SMS send failed (${event}):`, err.message);
  }
}
