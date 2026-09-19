# Miniature Works Studio

A full-stack e-commerce platform for a handmade miniature art business. Built and deployed as a live production site.

**Live site:** [miniatureworksstudio.netlify.app](https://miniatureworksstudio.netlify.app/)

## Features

- Dynamic product catalog (Supabase)
- Shopping cart with S/M/L variable pricing
- Checkout with OTP phone verification
- Order tracking and 24-hour cancellation
- Automated customer + studio email notifications (Brevo)
- Customer reviews with star ratings
- Private admin dashboard with PIN auth and order management
- Home delivery vs local studio pickup

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (no build step)
- **Backend:** Netlify Serverless Functions
- **Database:** Supabase (products) · Netlify Blobs (orders, OTPs, reviews)
- **Email:** Brevo (transactional), Resend (cancellations)
- **Hosting:** Netlify with Git-based deploys
- **Auth:** HMAC-signed admin tokens with `timingSafeEqual`

## Project Structure
