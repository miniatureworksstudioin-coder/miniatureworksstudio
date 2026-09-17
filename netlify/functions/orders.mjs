import { json, orderStore, parseBody, cleanOrder, validateOrder } from "./_shared.mjs";

const SITE_URL = "https://miniatureworksstudio.netlify.app";
const DEFAULT_DELIVERY_CHARGE = 100;

const formatINR = (value) =>
  `\u20b9${Number(value || 0).toLocaleString("en-IN")}`;

// Item images are stored as site-relative paths; email clients need absolute ones.
const absoluteImageUrl = (path) => {
  let imagePath = String(path || "");
  // Replace localhost URLs with the real domain
  if (/^https?:\/\/localhost(:\d+)?\//i.test(imagePath)) {
    imagePath = imagePath.replace(/^https?:\/\/localhost(:\d+)?/i, SITE_URL);
  }
  return /^https?:\/\//i.test(imagePath) ? imagePath : `${SITE_URL}${imagePath}`;
};

const formatAddress = (order) =>
  [order.address, order.city, order.pincode]
    .filter((part) => part != null && String(part).trim() !== "")
    .join(", ");

const deliveryChargeOf = (order) => {
  if (order.delivery && order.delivery.method === "pickup") return 0;
  if (order.delivery && order.delivery.charge != null) {
    return Number(order.delivery.charge) || 0;
  }
  if (order.deliveryCharge != null) return Number(order.deliveryCharge) || 0;
  return DEFAULT_DELIVERY_CHARGE;
};

// Renders the one-line delivery summary shown at the top of the email, so the
// order can be actioned without reading the details table.
function formatDeliveryLine(order) {
  const delivery = order.delivery;
  const method = delivery && delivery.method;

  if (method === "pickup") {
    return "Delivery: Local Pickup (Free) \u2014 Customer will pick up from studio. Send them the address.";
  }

  if (method === "delivery") {
    const address = formatAddress(order);

    return `Delivery: Home Delivery (${formatINR(deliveryChargeOf(order))})${
      address ? ` \u2014 ${address}` : ""
    }`;
  }

  // Older orders, or anything that didn't carry a delivery method.
  const address = formatAddress(order);

  return address ? `Delivery: ${address}` : "";
}

// Builds a simple HTML summary of the order for the notification email.
// Falls back gracefully since we don't assume an exact order schema.
function buildOrderEmailHtml(order) {
  // delivery/address/city/pincode are pulled out of `rest` on purpose: they are
  // rendered by formatDeliveryLine() above, so they'd otherwise appear twice.
  const {
    orderId,
    items,
    delivery,
    address,
    city,
    pincode,
    ...rest
  } = order;

  const deliveryLine = formatDeliveryLine(order);

  const itemsList = Array.isArray(items)
    ? items
        .map((item) => {
          const name = item.name ?? item.title ?? "Item";
          const qty = item.quantity ?? item.qty ?? 1;
          const price = item.price ?? item.unitPrice ?? "";
         const imageUrl = absoluteImageUrl(item.img);
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
    ${
      deliveryLine
        ? `<p><strong>${escapeHtml(deliveryLine)}</strong></p>`
        : ""
    }
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

// Warm, plain-HTML confirmation sent to the customer. Kept to tables and inline
// styles so it renders the same in Gmail, Outlook and the usual mobile clients.
function buildCustomerEmailHtml(order) {
  const isPickup = order.delivery && order.delivery.method === "pickup";
  const charge = deliveryChargeOf(order);
  const subtotal = Number(order.subtotal) || 0;
  const total = order.total != null ? Number(order.total) : subtotal + charge;
  const hasQuoteItem =
    Array.isArray(order.items) && order.items.some((item) => item.quote);

  const itemRows = (Array.isArray(order.items) ? order.items : [])
    .map((item) => {
      const name = escapeHtml(String(item.name || "Item"));
      const size = item.size ? escapeHtml(String(item.size)) : "";
      const qty = Number(item.qty) || 1;
      const lineTotal = item.quote
        ? "Price on quote"
        : formatINR((Number(item.price) || 0) * qty);

      const image = item.img
        ? `<img src="${escapeHtml(
            absoluteImageUrl(item.img)
          )}" alt="${name}" width="72" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block;" />`
        : "";

      return `
        <tr>
          <td style="padding:12px 12px 12px 0;vertical-align:top;width:84px;">${image}</td>
          <td style="padding:12px 0;vertical-align:top;font-size:14px;color:#2b2622;">
            <div style="font-weight:600;">${name}</div>
            <div style="color:#6f665e;font-size:13px;padding-top:2px;">${
              size ? `Size: ${size} &middot; ` : ""
            }Qty: ${qty}</div>
          </td>
          <td style="padding:12px 0;vertical-align:top;text-align:right;font-size:14px;color:#2b2622;white-space:nowrap;">${escapeHtml(
            lineTotal
          )}</td>
        </tr>`;
    })
    .join("");

  const deliveryBlock = isPickup
    ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#2b2622;">
         <strong>Local Pickup from our Modinagar studio</strong><br />
         We&rsquo;ll email you the studio address and a pickup time slot within 24 hours.
       </p>`
    : `<p style="margin:0;font-size:14px;line-height:1.6;color:#2b2622;">
         <strong>Home Delivery</strong><br />
         ${escapeHtml(formatAddress(order)) || "Address to be confirmed"}
       </p>`;

  const summaryRow = (label, value, bold) => `
    <tr>
      <td style="padding:6px 0;font-size:14px;color:${
        bold ? "#2b2622" : "#6f665e"
      };${bold ? "font-weight:600;border-top:1px solid #e6dfd6;" : ""}">${label}</td>
      <td style="padding:6px 0;text-align:right;font-size:14px;color:#2b2622;${
        bold ? "font-weight:600;border-top:1px solid #e6dfd6;" : ""
      }">${value}</td>
    </tr>`;

  return `
  <div style="background:#f7f3ed;padding:24px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6dfd6;border-radius:12px;overflow:hidden;">
      <div style="padding:26px 26px 18px;">
        <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a7f74;">Miniature Works Studio</p>
        <h1 style="margin:0 0 10px;font-size:22px;color:#2b2622;">Thank you, ${escapeHtml(
          String(order.name || "there")
        )}!</h1>
        <p style="margin:0;font-size:14px;line-height:1.65;color:#5b5249;">
          Your order has been received. I&rsquo;ll go through the details and get back to you personally
          to confirm the final price, the timeline and the advance payment before any work begins.
        </p>
      </div>

      <div style="margin:0 26px;padding:16px;background:#f7f3ed;border-radius:10px;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a7f74;">Your Order ID</p>
        <p style="margin:0;font-size:24px;font-weight:700;letter-spacing:.04em;color:#2b2622;">${escapeHtml(
          String(order.orderId)
        )}</p>
      </div>

      ${
        itemRows
          ? `<div style="padding:22px 26px 0;">
               <h2 style="margin:0 0 4px;font-size:15px;color:#2b2622;">Your order</h2>
               <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${itemRows}</table>
             </div>`
          : ""
      }

      <div style="padding:14px 26px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${summaryRow("Subtotal", formatINR(subtotal))}
          ${summaryRow(
            "Delivery",
            isPickup ? "Free (Pickup)" : formatINR(charge)
          )}
          ${summaryRow("Total", formatINR(total), true)}
        </table>
        ${
          hasQuoteItem
            ? `<p style="margin:10px 0 0;font-size:12.5px;line-height:1.6;color:#8a7f74;">
                 Items marked &ldquo;price on quote&rdquo; aren&rsquo;t included in this total yet &mdash; I&rsquo;ll confirm those with you.
               </p>`
            : ""
        }
      </div>

      <div style="padding:20px 26px 0;">
        <h2 style="margin:0 0 8px;font-size:15px;color:#2b2622;">Delivery</h2>
        ${deliveryBlock}
      </div>

      <div style="margin:22px 26px 0;padding:14px 16px;background:#f7f3ed;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:13.5px;line-height:1.6;color:#2b2622;">
          <strong>Save this email</strong> &mdash; you&rsquo;ll need your Order ID and phone number to track your order on our website.
        </p>
        <p style="margin:0;font-size:13.5px;line-height:1.6;color:#5b5249;">
          Phone used for tracking: <strong>${escapeHtml(
            String(order.phone || "")
          )}</strong><br />
          Track your order: <a href="${SITE_URL}/#track" style="color:#6b4e2e;">${SITE_URL}/#track</a>
        </p>
      </div>

      <div style="padding:20px 26px 26px;">
        <p style="margin:0;font-size:13.5px;line-height:1.65;color:#5b5249;">
          You can cancel free of charge within 24 hours from the Track Order page. If anything above looks
          wrong, just reply to this email and I&rsquo;ll sort it out.
        </p>
        <p style="margin:14px 0 0;font-size:13.5px;line-height:1.65;color:#5b5249;">
          Warm regards,<br /><strong style="color:#2b2622;">Aakash</strong><br />
          <span style="color:#8a7f74;">Miniature Works Studio, Modinagar</span>
        </p>
      </div>
    </div>
  </div>
  `;
}

async function sendCustomerConfirmationEmail(order) {
  const apiKey = process.env.BREVO_API_KEY;
  const to = String(order.email || "").trim();

  if (!apiKey || !to) {
    console.error("customer_email_skipped", {
      hasApiKey: Boolean(apiKey),
      hasRecipient: Boolean(to),
    });
    return;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: "Miniature Works Studio",
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: to }],
      subject: `Order Received: ${order.orderId} \u2014 Miniature Works Studio`,
      htmlContent: buildCustomerEmailHtml(order),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Brevo API responded with ${response.status}: ${body}`);
  }
}

async function sendOrderNotificationEmail(order) {
  const apiKey = process.env.BREVO_API_KEY;
  const to = process.env.NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.error("order_email_skipped_missing_env", {
      hasApiKey: Boolean(apiKey),
      hasRecipient: Boolean(to),
    });
    return;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: "Miniature Works Studio",
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: to }],
      subject: `New Order Received: ${order.orderId}`,
      htmlContent: buildOrderEmailHtml(order),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Brevo API responded with ${response.status}: ${body}`);
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

    try {
      await sendCustomerConfirmationEmail(order);
    } catch (customerEmailError) {
      // Same rule: the order is already saved, so a failed confirmation email
      // must not turn a successful order into an error for the customer.
      console.error("customer_email_failed", customerEmailError);
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