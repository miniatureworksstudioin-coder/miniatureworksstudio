// netlify/functions/notify-cancellation.mjs

const STUDIO_EMAIL = 'miniatureworksstudio.in@gmail.com';
const SENDER = { name: 'Miniature Works Studio', email: 'contact@miniatureworksstudio.com' };
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strip line breaks so user input can never inject extra headers into a subject line
function cleanSubject(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function buildCustomerEmail({ orderId, customerName, reason }) {
  const safeOrderId = escapeHtml(orderId);
  const safeName = escapeHtml(customerName || 'there');
  const safeReason = reason ? escapeHtml(reason) : '';

  const reasonBlock = safeReason
    ? `<tr>
        <td style="padding:0 0 16px 0;font-size:15px;line-height:1.6;color:#201B14;">
          Reason you provided: ${safeReason}
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Order cancelled</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF6EC;color:#201B14;font-family:Arial,-apple-system,'Segoe UI',Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAF6EC;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#FAF6EC;">
          <tr>
            <td style="padding:0 0 24px 0;border-bottom:1px solid #E4DAC4;">
              <div style="font-size:22px;font-weight:bold;color:#201B14;font-family:Arial,-apple-system,'Segoe UI',Helvetica,sans-serif;">Miniature Works Studio</div>
              <div style="font-size:13px;color:#201B14;font-family:Arial,-apple-system,'Segoe UI',Helvetica,sans-serif;">Est. 2020 &middot; Ghaziabad</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 8px 0;font-size:15px;line-height:1.6;color:#201B14;">
              Hi ${safeName},
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 16px 0;font-size:20px;font-weight:bold;color:#201B14;">
              Order cancelled
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 16px 0;font-size:15px;line-height:1.6;color:#201B14;">
              Your order ${safeOrderId} has been cancelled as requested.
            </td>
          </tr>
          ${reasonBlock}
          <tr>
            <td style="padding:0 0 24px 0;font-size:15px;line-height:1.6;color:#201B14;">
              If this was a mistake, reply to this email and we'll help you reorder.
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0 0 0;border-top:1px solid #E4DAC4;font-size:12px;line-height:1.6;color:#201B14;">
              Miniature Works Studio, Ghaziabad &middot; miniatureworksstudio.com
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildStudioEmail({ orderId, customerName, customerEmail, reason }) {
  const safeReason = reason ? escapeHtml(reason) : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:16px;font-family:Arial,-apple-system,'Segoe UI',Helvetica,sans-serif;color:#201B14;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:0 0 12px 0;font-size:16px;font-weight:bold;">Order cancelled by customer</td>
    </tr>
    <tr>
      <td style="padding:0 0 4px 0;font-size:14px;"><strong>Order ID:</strong> ${escapeHtml(orderId)}</td>
    </tr>
    <tr>
      <td style="padding:0 0 4px 0;font-size:14px;"><strong>Customer name:</strong> ${escapeHtml(customerName || 'Not provided')}</td>
    </tr>
    <tr>
      <td style="padding:0 0 4px 0;font-size:14px;"><strong>Customer email:</strong> ${escapeHtml(customerEmail)}</td>
    </tr>
    ${safeReason ? `<tr><td style="padding:0 0 4px 0;font-size:14px;"><strong>Reason:</strong> ${safeReason}</td></tr>` : ''}
    <tr>
      <td style="padding:12px 0 0 0;font-size:14px;">Log into your admin dashboard to review.</td>
    </tr>
  </table>
</body>
</html>`;
}

// Never throws: logs failures so one failed email can't block the other or the response
async function sendEmail({ toEmail, toName, subject, htmlContent }) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`Brevo error sending "${subject}" to ${toEmail}: ${res.status} ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Failed to send "${subject}" to ${toEmail}:`, err);
    return false;
  }
}

// Fetches rows from the Supabase REST API using the service role key (server-side only)
async function supabaseSelect(pathAndQuery) {
  const SUPABASE_URL = process.env["SUPABASE" + "_URL"];
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE" + "_SERVICE_ROLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are not configured');
  }

  const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${pathAndQuery}`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase request failed (${res.status}): ${detail}`);
  }

  return res.json();
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { orderId, reason } = JSON.parse(event.body || '{}');

    if (!orderId) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    // 1. Fetch the order to get its customer_id
    const orders = await supabaseSelect(
      `orders?id=eq.${encodeURIComponent(orderId)}&select=id,customer_id&limit=1`
    );
    const order = orders[0];

    if (!order || !order.customer_id) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Order not found' }),
      };
    }

    // 2. Fetch the customer to get their email and name
    const customers = await supabaseSelect(
      `customers?id=eq.${encodeURIComponent(order.customer_id)}&select=email,name&limit=1`
    );
    const customer = customers[0];

    if (!customer || !customer.email) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Customer not found' }),
      };
    }

    const customerEmail = customer.email;
    const customerName = customer.name;

    const customerHtml = buildCustomerEmail({ orderId, customerName, reason });
    const studioHtml = buildStudioEmail({ orderId, customerName, customerEmail, reason });

    // Wait for both; failures are logged inside sendEmail and don't affect the response
    await Promise.all([
      sendEmail({
        toEmail: customerEmail,
        toName: customerName || 'Customer',
        subject: `Order cancelled — ${cleanSubject(orderId)}`,
        htmlContent: customerHtml,
      }),
      sendEmail({
        toEmail: STUDIO_EMAIL,
        toName: 'Studio Owner',
        subject: `[Action] Order cancelled — ${cleanSubject(orderId)}`,
        htmlContent: studioHtml,
      }),
    ]);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ success: true, cancelledOrderId: orderId }),
    };
  } catch (err) {
    console.error('notify-cancellation error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
