import { getStore } from "@netlify/blobs";
import {
  json,
  orderStore,
  parseBody,
  normalizePhone,
  publicOrder,
} from "./_shared.mjs";

const otpStore = (context) =>
  getStore({ name: "miniature-works-otps", context });

// Loads every stored order so we can find all of them for a phone number.
// Orders are keyed by orderId, not phone, so there's no direct lookup.
async function listAllOrders(store) {
  const { blobs } = await store.list();
  const orders = await Promise.all(
    blobs.map(({ key }) => store.get(key, { type: "json" }))
  );
  return orders.filter(Boolean);
}

function ordersForPhone(orders, phone) {
  return orders
    .filter((order) => order.phone === phone)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const { phone, code, purpose } = await parseBody(req);
  const normalizedPhone = normalizePhone(phone);
  const otps = otpStore(context);

  let record;
  try {
    record = await otps.get(normalizedPhone, { type: "json" });
  } catch (error) {
    console.error("verify_otp_lookup_failed", error);
    return json({ error: "Verification is temporarily unavailable." }, 503);
  }

  if (!record || Date.now() > record.expiresAt) {
    return json({ error: "Code expired or invalid." }, 400);
  }

  if (String(code) !== String(record.code)) {
    return json({ error: "Incorrect code." }, 401);
  }

  try {
    // Single-use: clear the record now that it's been verified successfully.
    await otps.delete(normalizedPhone);
  } catch (error) {
    // Don't fail the login over a cleanup error — the code has already
    // been consumed correctly from the customer's point of view.
    console.error("verify_otp_delete_failed", error);
  }

  if (purpose === "checkout") {
    return json({ ok: true });
  }

  try {
    const orders = await listAllOrders(orderStore(context));
    const matches = ordersForPhone(orders, normalizedPhone);

    return json({ ok: true, orders: matches.map(publicOrder) });
  } catch (error) {
    console.error("verify_otp_order_lookup_failed", error);
    return json({ error: "Order lookup is temporarily unavailable." }, 503);
  }
};