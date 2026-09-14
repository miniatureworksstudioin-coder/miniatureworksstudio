import { isAdminRequest, json, orderStore, parseBody } from "./_shared.mjs";

const statuses = ["Received", "Awaiting quote", "Confirmed", "In Progress", "Ready", "Completed", "Cancelled"];

export default async (request) => {
  if (!isAdminRequest(request)) return json({ error: "Unauthorized." }, 401);
  const store = orderStore();
  try {
    if (request.method === "GET") {
      const { blobs } = await store.list();
      const orders = (await Promise.all(blobs.map((blob) => store.get(blob.key, { type: "json" })))).filter(Boolean);
      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ ok: true, orders });
    }
    if (request.method === "PUT") {
      const body = await parseBody(request);
      const orderId = String(body.orderId || "").toUpperCase();
      if (!statuses.includes(body.status)) return json({ error: "Invalid status." }, 400);
      const order = await store.get(orderId, { type: "json" });
      if (!order) return json({ error: "Order not found." }, 404);
      order.status = body.status;
      order.updatedAt = new Date().toISOString();
      await store.setJSON(orderId, order);
      return json({ ok: true, order });
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("admin_orders_failed", error);
    return json({ error: "Admin order storage is temporarily unavailable." }, 503);
  }
};