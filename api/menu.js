import { getDashboard } from "../lib/dashboard.js";
import { applyRateLimitHeaders, checkRateLimit } from "../lib/rate-limit.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rateLimit = checkRateLimit(req, "menu");
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: "Liiga palju päringuid. Proovi hetke pärast uuesti." });
  }

  try {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(await getDashboard());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Serveri viga", detail: error.message });
  }
}
