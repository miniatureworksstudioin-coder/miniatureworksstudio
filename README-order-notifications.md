# Order notifications and secure order storage

The checkout now stores orders in Netlify Blobs and also submits them to the
Netlify Form named `orders`. Customers stay on the website, see an order
confirmation, and do not need to open WhatsApp to send anything.

## Required Netlify setup

1. Deploy this folder to the same Netlify site.
2. In **Site configuration → Environment variables**, add:
   - `ADMIN_PIN`: a new private PIN for the studio dashboard.
   - `ADMIN_SESSION_SECRET`: a long random private string. Do not put this in
     the website source or share it publicly.
3. Open the site in Netlify and go to **Forms**. Confirm that the `orders`,
   `custom-orders`, `order-cancellations`, and `reviews` forms appear after the
   first deploy.
4. Open **Project configuration → Notifications → Emails and webhooks → Form
   submission notifications** and choose the email address where order alerts
   should arrive.

The order notification contains the order ID, customer details, address,
selected products, estimated total, notes, and delivery information. A
custom-order reference photo is submitted with the Netlify form when the
customer selects one.

## What is now server-side

- Orders are stored centrally in Netlify Blobs.
- Track Order requires both the order ID and the original phone number.
- Cancellation changes the central order status and sends a notification.
- The Studio sign-in PIN is checked by a server function; it is not included
  in the page source.
- The studio dashboard reads and updates shared orders.

The site still stores only the cart locally in the browser. It no longer stores
full customer orders or reviews in localStorage.