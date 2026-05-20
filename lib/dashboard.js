import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");

const CACHE_VERSION = "v2";
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 60 * 30);
const SOURCE_BASE_URL = process.env.SOURCE_BASE_URL || "https://xn--pevapakkumised-5hb.ee";
const DEFAULT_DB_PATH = process.env.VERCEL
  ? path.join("/tmp", "food-dashboard-cache.json")
  : path.join(ROOT_DIR, "data", "cache.json");
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;
const RESTAURANTS_PATH = process.env.RESTAURANTS_PATH || path.join(ROOT_DIR, "data", "restaurants.json");

let cacheWrite = Promise.resolve();
const inFlight = new Map();

export async function getDashboard() {
  const config = await readRestaurantConfig();
  const seen = new Map();

  for (const environment of config.environments) {
    for (const restaurant of environment.restaurants) {
      const key = restaurantKey(restaurant);
      if (!seen.has(key)) {
        seen.set(key, restaurant);
      }
    }
  }

  const fetched = await Promise.all(
    [...seen.values()].map((restaurant) => getRestaurantSnapshot(restaurant))
  );
  const byKey = new Map(fetched.map((item) => [restaurantKey(item.restaurant), item]));

  return {
    generatedAt: new Date().toISOString(),
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    environments: config.environments.map((environment) => ({
      ...environment,
      restaurants: environment.restaurants.map((restaurant) => byKey.get(restaurantKey(restaurant)))
    }))
  };
}

export async function readRestaurantConfig() {
  const raw = await readFile(RESTAURANTS_PATH, "utf8");
  const config = JSON.parse(raw);

  if (!Array.isArray(config.environments)) {
    throw new Error("restaurants.json peab sisaldama environments massiivi");
  }

  for (const environment of config.environments) {
    if (!environment.id || !environment.name || !Array.isArray(environment.restaurants)) {
      throw new Error("Igal environmentil peab olema id, name ja restaurants");
    }
    environment.restaurants.forEach(validateRestaurant);
  }

  return config;
}

async function getRestaurantSnapshot(restaurant) {
  validateRestaurant(restaurant);
  const key = restaurantKey(restaurant);
  const cached = await readFreshCache(key);

  if (cached) {
    return {
      restaurant,
      ...cached.data,
      cached: true,
      cacheAgeSeconds: Math.floor((Date.now() - cached.fetchedAt) / 1000)
    };
  }

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const request = fetchRestaurant(restaurant)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

async function fetchRestaurant(restaurant) {
  const startedAt = Date.now();
  const sourceUrl = `${SOURCE_BASE_URL}/${encodeURIComponent(restaurant.city)}/${encodeRestaurantSlug(restaurant.slug)}`;

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "food-dashboard/1.0 (+personal lunch dashboard)"
      }
    });

    if (!response.ok) {
      throw new Error(`Allikas vastas staatusega ${response.status}`);
    }

    const html = await response.text();
    const parsed = parseRestaurantPage(html, restaurant, sourceUrl);
    const snapshot = {
      restaurant,
      sourceUrl,
      fetchedAt: new Date(startedAt).toISOString(),
      ...parsed,
      cached: false,
      cacheAgeSeconds: 0
    };

    await writeCacheEntry(restaurantKey(restaurant), snapshot, startedAt);
    return snapshot;
  } catch (error) {
    const stale = await readAnyCache(restaurantKey(restaurant));
    if (stale) {
      return {
        restaurant,
        ...stale.data,
        cached: true,
        stale: true,
        error: error.message,
        cacheAgeSeconds: Math.floor((Date.now() - stale.fetchedAt) / 1000)
      };
    }

    return {
      restaurant,
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      title: restaurant.name,
      dateText: null,
      offerTime: null,
      parking: null,
      footer: null,
      offers: [],
      cached: false,
      stale: false,
      error: error.message
    };
  }
}

function parseRestaurantPage(html, restaurant, sourceUrl) {
  const selectedMeal = matchFirst(html, /(<div[^>]+class="[^"]*\bmeal\b[^"]*\bselected\b[^"]*"[\s\S]*?)(?=<div[^>]+id="svelte-filter-panel"|<div[^>]+class="[^"]*\bmeal\b|<footer|<\/body>)/i);

  if (!selectedMeal) {
    return {
      title: restaurant.name,
      dateText: null,
      offerTime: null,
      parking: null,
      footer: "Detailvaadet ei leitud. Kontrolli restorani koodi data/restaurants.json failis.",
      offers: [],
      isEmpty: true,
      sourceUrl
    };
  }

  const title = textFromHtml(matchFirst(selectedMeal, /<h3>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i)) || restaurant.name;
  const dateText = textFromHtml(matchFirst(selectedMeal, /<h4>\s*Kuupäev:\s*([\s\S]*?)<\/h4>/i));
  const footer = textFromHtml(matchFirst(selectedMeal, /<div[^>]+class="offerFooter"[^>]*>([\s\S]*?)<\/div>/i));
  const offerTime = valueAfterHeading(selectedMeal, "Pakkumiste aeg");
  const parking = valueAfterHeading(selectedMeal, "Parkimine");
  const offers = [...selectedMeal.matchAll(/<div[^>]+class="[^"]*\boffer\b[^"]*"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/gi)]
    .map((match) => parseOffer(match[1]))
    .filter((offer) => offer.text);

  return {
    title,
    dateText: dateText || null,
    offerTime: offerTime || null,
    parking: parking || null,
    footer: footer || null,
    offers,
    isEmpty: offers.length === 0,
    sourceUrl
  };
}

function parseOffer(html) {
  const price = textFromHtml(matchFirst(html, /<strong[^>]*>([\s\S]*?)<\/strong>/i));
  const text = textFromHtml(html).replace(price, "").replace(/\s+([,.])/g, "$1").trim();
  return {
    text,
    price: price || null
  };
}

function valueAfterHeading(html, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return textFromHtml(matchFirst(html, new RegExp(`<h4[^>]*>\\s*${escaped}\\s*<\\/h4>\\s*<div[^>]+class="value"[^>]*>([\\s\\S]*?)<\\/div>`, "i")));
}

function textFromHtml(value) {
  if (!value) return "";
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
    euro: "€",
    auml: "ä",
    Auml: "Ä",
    ouml: "ö",
    Ouml: "Ö",
    uuml: "ü",
    Uuml: "Ü",
    otilde: "õ",
    Otilde: "Õ",
    scaron: "š",
    Scaron: "Š",
    zcaron: "ž",
    Zcaron: "Ž",
    eacute: "é",
    Eacute: "É"
  };

  const withNumericEntities = value.replace(/&#(x?[0-9a-f]+);/gi, (_, entity) => {
    const code = entity[0]?.toLowerCase() === "x"
      ? Number.parseInt(entity.slice(1), 16)
      : Number.parseInt(entity, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : `&#${entity};`;
  });

  const entityNames = Object.keys(named).sort((a, b) => b.length - a.length).join("|");
  const namedEntityPattern = new RegExp(`&(${entityNames});?`, "g");

  return withNumericEntities.replace(namedEntityPattern, (_, entity) => named[entity]);
}

function matchFirst(value, regex) {
  return regex.exec(value)?.[1] || "";
}

function validateRestaurant(restaurant) {
  if (!restaurant?.name || !restaurant?.city || !restaurant?.slug) {
    throw new Error("Restoranil peab olema name, city ja slug");
  }

  if (!/^[a-z0-9-]+$/i.test(restaurant.city)) {
    throw new Error(`Vigane linn: ${restaurant.city}`);
  }

  if (restaurant.slug.includes("/") || restaurant.slug.includes("..")) {
    throw new Error(`Vigane restorani kood: ${restaurant.slug}`);
  }
}

function restaurantKey(restaurant) {
  return `${CACHE_VERSION}:${restaurant.city}/${restaurant.slug}`.toLowerCase();
}

function encodeRestaurantSlug(slug) {
  return slug.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function readFreshCache(key) {
  const row = await readAnyCache(key);
  if (!row) return null;
  return Date.now() - row.fetchedAt <= CACHE_TTL_SECONDS * 1000 ? row : null;
}

async function readAnyCache(key) {
  const cache = await readCacheFile();
  return cache[key] || null;
}

async function readCacheFile() {
  if (!existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(await readFile(DB_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function writeCacheEntry(key, data, fetchedAt) {
  cacheWrite = cacheWrite.then(async () => {
    await mkdir(path.dirname(DB_PATH), { recursive: true });
    const cache = await readCacheFile();
    cache[key] = { data, fetchedAt };
    await writeFile(DB_PATH, JSON.stringify(cache, null, 2));
  });
  return cacheWrite;
}
