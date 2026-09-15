import { createAdminToken, json, parseBody } from "./_shared.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const configuredPin = process.env.ADMIN_PIN;
  if (!configuredPin || !process.env.ADMIN_SESSION_SECRET) {
    return json({ error: "Studio admin access is not configured yet." }, 503);
  }
  const body = await parseBody(req);
  if (String(body.pin || "") !== configuredPin) return json({ error: "Incorrect PIN." }, 401);
  const token = createAdminToken();
  return token ? json({ ok: true, token }) : json({ error: "Admin access is not configured yet." }, 503);
};