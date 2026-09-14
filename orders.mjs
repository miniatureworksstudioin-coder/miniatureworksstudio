import { json, orderStore, parseBody, cleanOrder, validateOrder } from "./_shared.mjs";

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const order = cleanOrder(await parseBody(request));
  const error = validateOrder(order);
  if (error) return json({ error }, 400);
  try {
    const store = orderStore();
    const existing = await store.get(order.orderId, { type: "json" });
    if (existing) return json({ ok: true, orderId: order.orderId, duplicate: true });
    await store.setJSON(order.orderId, order);
    return json({ ok: true, orderId: order.orderId });
  } catch (error) {
    console.error("order_store_failed", error);
    return json({ error: "Order storage is temporarily unavailable." }, 503);
  }
};