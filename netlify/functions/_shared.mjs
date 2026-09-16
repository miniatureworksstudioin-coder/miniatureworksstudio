import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export const parseBody = async (request) => {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
};

export const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
};

export const orderStore = (context) =>
  getStore({ name: "miniature-works-orders", context });

export const validOrderId = (value) =>
  /^MWS-\d{6}-\d{4}$/.test(String(value || "").toUpperCase());

export const publicOrder = (order) => ({
  orderId: order.orderId,
  orderType: order.orderType,
  status: order.status,
  createdAt: order.createdAt,
  items: order.items || [],
  subtotal: order.subtotal || 0,
  description: order.description || "",
  sizeCategory: order.sizeCategory || "",
  delivery: order.delivery || null,
  deliveryCharge: order.deliveryCharge || 0,
  total: order.total || 0,
});

const base64url = (value) => Buffer.from(value).toString("base64url");

export const createAdminToken = () => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const payload = base64url(
    JSON.stringify({
      role: "admin",
      exp: Date.now() + 8 * 60 * 60 * 1000,
    })
  );

  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
};

export const isAdminRequest = (request) => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const authorization = request.headers.get("authorization") || "";

  if (!secret || !authorization.startsWith("Bearer ")) return false;

  const token = authorization.slice(7);
  const [payload, signature] = token.split(".");

  if (!payload || !signature) return false;

  const expected = createHmac("sha256", secret).update(payload).digest();

  let received;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return false;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    return decoded.role === "admin" && Number(decoded.exp) > Date.now();
  } catch {
    return false;
  }
};

export const cleanOrder = (body) => ({
  orderId: String(body.orderId || "").toUpperCase(),
  orderType: body.orderType === "custom" ? "custom" : "catalog",
  customerId: normalizePhone(body.phone),
  name: String(body.name || "").trim().slice(0, 120),
  phone: normalizePhone(body.phone),
  email: String(body.email || "").trim().slice(0, 160),
  address: String(body.address || "").trim().slice(0, 500),
  city: String(body.city || "").trim().slice(0, 100),
  pincode: String(body.pincode || "")
    .replace(/\D/g, "")
    .slice(0, 6),
  notes: String(body.notes || "").trim().slice(0, 1000),
  items: Array.isArray(body.items)
    ? body.items.slice(0, 30).map((item) => ({
        name: String(item.name || "").slice(0, 160),
        size: String(item.size || "").slice(0, 30),
        qty: Math.max(1, Math.min(99, Number(item.qty) || 1)),
        price: Math.max(0, Number(item.price) || 0),
        quote: Boolean(item.quote),
        img: String(item.img || "").slice(0, 500),
      }))
    : [],
  subtotal: Math.max(0, Number(body.subtotal) || 0),
  description: String(body.description || "").trim().slice(0, 2000),
  sizeCategory: String(body.sizeCategory || "").trim().slice(0, 40),
  delivery:
    body.delivery && typeof body.delivery === "object"
      ? {
          method: body.delivery.method === "pickup" ? "pickup" : "delivery",
          charge: Math.max(0, Number(body.delivery.charge) || 0),
        }
      : null,
  deliveryCharge: Math.max(0, Number(body.deliveryCharge) || 0),
  total: Math.max(0, Number(body.total) || 0),
  createdAt: new Date().toISOString(),
  status:
    body.status ||
    (body.orderType === "custom" ? "Awaiting quote" : "Received"),
});

// Deliberately loose: we only reject addresses that clearly can't be delivered to.
export const validEmail = (value) => {
  const email = String(value || "").trim();
  return email.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validateOrder = (order) => {
  if (!validOrderId(order.orderId)) return "Invalid order ID.";

  if (!order.name || order.phone.length < 10) {
    return "Name and a valid phone number are required.";
  }

  if (!validEmail(order.email)) {
    return "A valid email is required.";
  }

  if (order.orderType === "catalog") {
    if (!order.items.length) {
      return "A catalog order needs at least one item.";
    }

    // Studio pickup carries no address — the customer collects from Modinagar,
    // so only home delivery has to supply one.
    const isPickup = order.delivery && order.delivery.method === "pickup";

    if (
      !isPickup &&
      (!order.address || !order.city || !/^\d{6}$/.test(order.pincode))
    ) {
      return "A home delivery order needs an address, a city and a 6-digit pincode.";
    }
  }

  if (order.orderType === "custom" && !order.description) {
    return "A custom order needs a description.";
  }

  return null;
};