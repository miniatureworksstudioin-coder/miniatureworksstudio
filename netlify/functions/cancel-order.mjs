import { json, normalizePhone, orderStore, parseBody, validOrderId } from "./_shared.mjs";

const RESEND_API_URL = "https://api.resend.com/emails";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCancellationEmailHtml(order, orderId) {
  return `
    <h2>Order Cancelled</h2>
    <p>Order <strong>${escapeHtml(String(orderId))}</strong> has been successfully cancelled.</p>
    <table>
      <tr><td style="padding:4px 8px;font-weight:bold;">Order ID</td><td style="padding:4px 8px;">${escapeHtml(String(orderId))}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Cancelled At</td><td style="padding:4px 8px;">${escapeHtml(String(order.cancelledAt))}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Original Order Date</td><td style="padding:4px 8px;">${escapeHtml(String(order.createdAt))}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold;">Phone</td><td style="padding:4px 8px;">${escapeHtml(String(order.phone ?? ""))}</td></tr>
    </table>
  `;
}

async function sendCancellationEmail(order, orderId) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.error("cancel_email_skipped_missing_env", {
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
      subject: `Order Cancelled: ${orderId}`,
      html: buildCancellationEmailHtml(order, orderId),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API responded with ${response.status}: ${body}`);
  }
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const body = await parseBody(req);
  const orderId = String(body.orderId || "").toUpperCase();
  const phone = normalizePhone(body.phone);
  if (!validOrderId(orderId) || phone.length < 10) {
    return json({ error: "Enter a valid order ID and phone number." }, 400);
  }
  try {
    const store = orderStore(context);
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

    try {
      await sendCancellationEmail(order, orderId);
    } catch (emailError) {
      // Never let a notification failure affect the successful cancellation response.
      console.error("cancel_email_failed", emailError);
    }

    return json({ ok: true, orderId });
  } catch (error) {
    console.error("order_cancel_failed", error);
    return json({ error: "Cancellation is temporarily unavailable." }, 503);
  }
};
