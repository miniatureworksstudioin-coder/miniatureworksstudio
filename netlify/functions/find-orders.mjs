import { json, normalizePhone, orderStore, parseBody } from "./_shared.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const body = await parseBody(req);
  const phone = normalizePhone(body.phone);
  if (phone.length < 10) {
    return json({ error: "Enter a valid 10-digit phone number." }, 400);
  }
  try {
    const store = orderStore(context);
    const { blobs } = await store.list();
    const orders = await Promise.all(
      blobs.map((blob) => store.get(blob.key, { type: "json" }))
    );

    const matches = orders
      .filter((order) => order && normalizePhone(order.phone) === phone)
      .map((order) => ({
        orderId: order.orderId,
        createdAt: order.createdAt,
        status: order.status,
        items: order.items || [],
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (!matches.length) {
      return json({ error: "No orders found for that phone number." }, 404);
    }

    return json({ ok: true, orders: matches });
  } catch (error) {
    console.error("find_orders_failed", error);
    return json({ error: "Order lookup is temporarily unavailable." }, 503);
  }
};
