// netlify/functions/notify-status.mjs

const STATUS_MESSAGES = {
  received: {
    subject: 'We received your order',
    heading: 'We received your order',
    body: "Thank you for your order! We've received it and will review the details shortly. We'll keep you updated at every step.",
  },
  awaiting_quote: {
    subject: 'Your order is being reviewed',
    heading: 'Your order is being reviewed',
    body: "We're reviewing your order and preparing a quote. We'll get back to you soon with the final price and timeline.",
  },
  confirmed: {
    subject: 'Your order is confirmed',
    heading: 'Your order is confirmed',
    body: "Great news — your order is confirmed! We'll begin work on your piece soon.",
  },
  in_progress: {
    subject: "We've started building your piece",
    heading: "We've started building your piece",
    body: "Your miniature is now in the workshop. Every detail is being crafted by hand, and we'll let you know as soon as it's ready.",
  },
  ready: {
    subject: 'Your order is ready',
    heading: 'Your order is ready',
    body: "Your order is finished and ready! We'll be in touch shortly to arrange pickup or delivery.",
  },
  completed: {
    subject: 'Your order is complete',
    heading: 'Your order is complete',
    body: 'Your order is complete. Thank you for choosing Miniature Works Studio — we hope you love your piece!',
  },
  cancelled: {
    subject: 'Your order has been cancelled',
    heading: 'Your order has been cancelled',
    body: 'Your order has been cancelled. If this was unexpected or you have any questions, please get in touch and we will gladly help.',
  },
};

const STATUS_LABELS = {
  received: 'Received',
  awaiting_quote: 'Awaiting quote',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml({ orderId, status, customerName, orderSummary }) {
  const msg = STATUS_MESSAGES[status];
  const name = escapeHtml(customerName || 'there');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(msg.subject)}</title>
</head>
<body style="margin:0; padding:0; background:#FAF6EC; font-family:Arial, -apple-system, 'Segoe UI', Helvetica, sans-serif; color:#201B14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EC;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px; border-bottom:1px solid #DFD5BB;">
              <div style="font-size:22px; font-weight:bold; color:#201B14;">Miniature Works Studio</div>
              <div style="font-size:13px; color:#201B14; margin-top:4px;">Est. 2020 &middot; Ghaziabad</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 0 8px 0;">
              <p style="margin:0 0 12px 0; font-size:15px; line-height:1.6; color:#201B14;">Hi ${name},</p>
              <h1 style="margin:0 0 12px 0; font-size:20px; color:#201B14;">${escapeHtml(msg.heading)}</h1>
              <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#201B14;">${escapeHtml(msg.body)}</p>
            </td>
          </tr>

          <!-- Order details -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EC; border:1px solid #DFD5BB; border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#201B14;">
                      <tr>
                        <td style="padding:4px 0; width:90px;">Order ID</td>
                        <td style="padding:4px 0; font-weight:bold;">${escapeHtml(orderId)}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;">Status</td>
                        <td style="padding:4px 0; font-weight:bold;">${escapeHtml(STATUS_LABELS[status] || status)}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; vertical-align:top;">Items</td>
                        <td style="padding:4px 0;">${escapeHtml(orderSummary || '—')}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Contact line -->
          <tr>
            <td style="padding:24px 0 8px 0;">
              <p style="margin:0; font-size:14px; line-height:1.6; color:#201B14;">Questions? Reply to this email or WhatsApp +91 92585 99238.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px; border-top:1px solid #DFD5BB;">
              <p style="margin:0; font-size:12px; color:#201B14;">Miniature Works Studio, Ghaziabad &middot; miniatureworksstudio.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const handler = async (event) => {
  const jsonHeaders = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...jsonHeaders, Allow: 'POST' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { orderId, status, customerEmail, customerName, orderSummary } =
      JSON.parse(event.body || '{}');

    if (!orderId || !status || !customerEmail) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    const msg = STATUS_MESSAGES[status];
    if (!msg) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Invalid status' }),
      };
    }

    const html = buildEmailHtml({ orderId, status, customerName, orderSummary });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Miniature Works Studio <contact@miniatureworksstudio.com>',
        to: customerEmail,
        subject: msg.subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', response.status, errorText);
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Email failed', detail: errorText }),
      };
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ success: true, status, sentTo: customerEmail }),
    };
  } catch (err) {
    console.error('notify-status error:', err);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
