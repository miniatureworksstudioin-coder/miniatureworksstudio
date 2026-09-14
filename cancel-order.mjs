import { json, normalizePhone, orderStore, parseBody, validOrderId } from "./_shared.mjs";

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const body = await parseBody(request);
  const orderId = String(body.orderId || "").toUpperCase();
  const phone = normalizePhone(body.phone);
  if (!validOrderId(orderId) || phone.length < 10) {
    return json({ error: "Enter a valid order ID and phone number." }, 400);
  }
  try {
    const store = orderStore();
    const order = await store.get(orderId, { type: "json" });
    if (!order || normalizePhone(order.phone) !== phone) {
      return json({ error: "No matching order found." }, 404);
    }
    if (["Cancelled", "Completed"].includes(order.status)) {
      return json({ error: "This order can no longer be cancelled." }, 409);
    }
    if (Date.now() - new Date(order.createdAt).getTime() > 24 * 60 * 60 * 1000) {
      return json({ error: "The 24-hour cancellation window has closed." }, 409);
    }
    order.status = "Cancelled";
    order.cancelledAt = new Date().toISOString();
    await store.setJSON(orderId, order);
    return json({ ok: true, orderId });
  } catch (error) {
    console.error("order_cancel_failed", error);
    return json({ error: "Cancellation is temporarily unavailable." }, 503);
  }
};