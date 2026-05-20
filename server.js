import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDashboard, readRestaurantConfig } from "./lib/dashboard.js";
import { applyRateLimitHeaders, checkRateLimit } from "./lib/rate-limit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PUBLIC_DIR = path.join(__dirname, "public");
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/menu") {
      const rateLimit = checkRateLimit(req, "menu");
      applyNodeRateLimitHeaders(res, rateLimit);
      if (!rateLimit.allowed) {
        return sendJson(res, { error: "Liiga palju päringuid. Proovi hetke pärast uuesti." }, 429);
      }
      return sendJson(res, await getDashboard());
    }

    if (url.pathname === "/api/restaurants") {
      const rateLimit = checkRateLimit(req, "restaurants");
      applyNodeRateLimitHeaders(res, rateLimit);
      if (!rateLimit.allowed) {
        return sendJson(res, { error: "Liiga palju päringuid. Proovi hetke pärast uuesti." }, 429);
      }
      return sendJson(res, await readRestaurantConfig());
    }

    if (url.pathname === "/health") {
      return sendJson(res, { ok: true });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: "Serveri viga", detail: error.message }, 500);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} on juba kasutusel. Käivita näiteks: PORT=3001 npm run dev`);
    process.exit(1);
  }

  throw error;
});

server.listen(PORT, () => {
  console.log(`Food dashboard running on http://localhost:${PORT}`);
});

async function serveStatic(urlPath, res) {
  const safePath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(res, "Forbidden", 403);
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": STATIC_TYPES[ext] || "application/octet-stream",
      "cache-control": IS_PRODUCTION && ![".html", ".css", ".js"].includes(ext)
        ? "public, max-age=31536000, immutable"
        : "no-cache"
    });
    res.end(body);
  } catch {
    sendText(res, "Not found", 404);
  }
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, body, status = 200) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function applyNodeRateLimitHeaders(res, result) {
  applyRateLimitHeaders({
    setHeader: (key, value) => res.setHeader(key, value)
  }, result);
}
