import { json, normalizePhone, orderStore, parseBody, publicOrder, validOrderId } from "./_shared.mjs";

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const body = await parseBody(request);
  const orderId = String(body.orderId || "").toUpperCase();
  const phone = normalizePhone(body.phone);
  if (!validOrderId(orderId) || phone.length < 10) {
    return json({ error: "Enter a valid order ID and phone number." }, 400);
  }
  try {
    const order = await orderStore().get(orderId, { type: "json" });
    if (!order || normalizePhone(order.phone) !== phone) {
      return json({ error: "No matching order found." }, 404);
    }
    return json({ ok: true, order: publicOrder(order) });
  } catch (error) {
    console.error("order_lookup_failed", error);
    return json({ error: "Order lookup is temporarily unavailable." }, 503);
  }
};