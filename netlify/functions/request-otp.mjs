import { getStore } from "@netlify/blobs";
import { json, orderStore, parseBody, normalizePhone } from "./_shared.mjs";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const otpStore = (context) =>
  getStore({ name: "miniature-works-otps", context });

const generateCode = () => Math.floor(100000 + Math.random() * 900000);

// Loads every stored order so we can find the most recent one for a phone
// number. Orders are keyed by orderId, not phone, so there's no direct lookup.
async function listAllOrders(store) {
  const { blobs } = await store.list();
  const orders = await Promise.all(
    blobs.map(({ key }) => store.get(key, { type: "json" }))
  );
  return orders.filter(Boolean);
}

function latestEmailForPhone(orders, phone) {
  const matches = orders
    .filter((order) => order.phone === phone)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return matches[0]?.email || "";
}

function otpEmailHtml(code) {
  return `
    <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#2b2622;">
      <p>Here&rsquo;s your login code for Miniature Works Studio:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:.08em;">${code}</p>
      <p style="font-size:13px;color:#6f665e;">
        This code expires in 10 minutes. If you didn&rsquo;t request it, you can ignore this email.
      </p>
    </div>
  `;
}

async function sendOtpEmail(email, code) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.error("otp_email_skipped_missing_key");
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
      to: [{ email }],
      subject: "Your login code for Miniature Works Studio",
      htmlContent: otpEmailHtml(code),
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

  const { phone, email: providedEmail } = await parseBody(req);
  const normalizedPhone = normalizePhone(phone);

  let email = String(providedEmail || "").trim();

  if (!email && normalizedPhone) {
    try {
      const orders = await listAllOrders(orderStore(context));
      email = latestEmailForPhone(orders, normalizedPhone);
    } catch (error) {
      console.error("request_otp_order_lookup_failed", error);
      return json({ error: "Order lookup is temporarily unavailable." }, 503);
    }
  }

  // Generic response either way — never reveal whether a phone number has
  // any orders, or an email on file, against it.
  if (!email) {
    return json({ ok: true });
  }

  const store = otpStore(context);

  try {
    const existing = await store.get(normalizedPhone, { type: "json" });

    let attempts = 0;
    if (existing) {
      if (Number(existing.attempts) >= MAX_ATTEMPTS) {
        return json(
          { error: "Too many requests. Please try again later." },
          429
        );
      }
      attempts = Number(existing.attempts) + 1;
    }

    const code = generateCode();

    await store.setJSON(normalizedPhone, {
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts,
    });

    try {
      await sendOtpEmail(email, code);
    } catch (emailError) {
      // Code is already stored — a failed send shouldn't surface as an
      // error and shouldn't break the generic response contract either.
      console.error("otp_email_failed", emailError);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("request_otp_store_failed", error);
    return json({ error: "Unable to process request right now." }, 503);
  }
};
