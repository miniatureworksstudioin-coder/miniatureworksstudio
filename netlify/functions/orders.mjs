import { json, orderStore, parseBody, cleanOrder, validateOrder } from "./_shared.mjs";

const RESEND_API_URL = "https://api.resend.com/emails";

// Builds a simple HTML summary of the order for the notification email.
// Falls back gracefully since we don't assume an exact order schema.
function buildOrderEmailHtml(order) {
  const { orderId, items, ...rest } = order;

  const itemsList = Array.isArray(items)
    ? items
        .map((item) => {
          const name = item.name ?? item.title ?? "Item";
          const qty = item.quantity ?? item.qty ?? 1;
          const price = item.price ?? item.unitPrice ?? "";
          const imageUrl = item.img
            ? `https://miniatureworksstudio.netlify.app${String(item.img)}`
            : "";

          const image = item.img
            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(
                String(name)
              )}" width="100" style="width:100px;margin:4px 8px 4px 0;vertical-align:middle;" />`
            : "";

          return `<li>${image}${qty} x ${escapeHtml(String(name))}${
            price !== "" ? ` — ${escapeHtml(String(price))}` : ""
          }</li>`;
        })
        .join("")
    : "";

  const detailsRows = Object.entries(rest)
    .map(([key, value]) => {
      const displayValue =
        typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value);

      return `<tr><td style="padding:4px 8px;font-weight:bold;">${escapeHtml(
        key
      )}</td><td style="padding:4px 8px;">${escapeHtml(
        displayValue
      )}</td></tr>`;
    })
    .join("");

  return `
    <h2>New Order Received</h2>
    <p><strong>Order ID:</strong> ${escapeHtml(String(orderId))}</p>
    <h3>Customer & Order Details</h3>
    <table>${detailsRows}</table>
    ${itemsList ? `<h3>Items</h3><ul>${itemsList}</ul>` : ""}
  `;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendOrderNotificationEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.error("order_email_skipped_missing_env", {
      hasApiKey: Boolean(apiKey),
      hasRecipient: Boolean(to),
    });
    return;
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "orders@resend.dev",
      to: [to],
      subject: `New Order Received: ${order.orderId}`,
      html: buildOrderEmailHtml(order),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API responded with ${response.status}: ${body}`);
  }
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const order = cleanOrder(await parseBody(req));
  const error = validateOrder(order);

  if (error) return json({ error }, 400);

  try {
    const store = orderStore(context);
    const existing = await store.get(order.orderId, { type: "json" });

    if (existing) {
      return json({
        ok: true,
        orderId: order.orderId,
        duplicate: true,
      });
    }

    await store.setJSON(order.orderId, order);

    try {
      await sendOrderNotificationEmail(order);
    } catch (emailError) {
      // Never let a notification failure affect the successful order response.
      console.error("order_email_failed", emailError);
    }

    return json({ ok: true, orderId: order.orderId });
  } catch (error) {
    console.error("order_store_failed", error);
    return json(
      { error: "Order storage is temporarily unavailable." },
      503
    );
  }
};