# Päevapakkumiste dashboard

Väike isiklik Node.js webapp, mis kuvab töö, kooli ja kodu ümbruse restoranide päevapakkumisi.

## Käivitamine

```bash
npm install
npm run dev
```

Rakendus avaneb aadressil `http://localhost:3000`.

## Vercel

Projekt on Verceli jaoks valmis:

- staatiline frontend asub `public/` kaustas;
- API endpointid asuvad `api/` kaustas;
- ühine andmeloogika asub `lib/dashboard.js` failis.

Deploy käsitsi:

```bash
npx vercel
```

Production deploy:

```bash
npx vercel --prod
```

Vercelis kasutatakse cache'i jaoks `/tmp/food-dashboard-cache.json`. See vähendab korduvaid väliseid päringuid sama serverless instantsi sees, aga Vercel ei garanteeri `/tmp` pikaajalist püsivust üle cold startide.

## Restoranide muutmine

Muuda faili `data/restaurants.json`.

```json
{
  "name": "Al Mare Grill",
  "city": "tallinn",
  "slug": "al-mare-grill",
  "hasOffers": true,
  "showOnWheel": true
}
```

`slug` on viimane URLi osa, näiteks:

```text
https://xn--pevapakkumised-5hb.ee/tallinn/al-mare-grill
```

`hasOffers: true` tähendab, et restorani pakkumised kuvatakse dashboardil ja neid fetchitakse allikast. `showOnWheel: true` tähendab, et restoran on valikus loosiratta lehel.

## Keskkonnamuutujad

- `PORT`: serveri port, vaikimisi `3000`
- `CACHE_TTL_SECONDS`: cache'i eluiga sekundites, vaikimisi `1800`
- `DB_PATH`: cache-faili asukoht, lokaalselt vaikimisi `data/cache.json`, Vercelis vaikimisi `/tmp/food-dashboard-cache.json`
- `RESTAURANTS_PATH`: restoranide config, vaikimisi `data/restaurants.json`
- `SOURCE_BASE_URL`: päevapakkumiste allikas, vaikimisi `https://xn--pevapakkumised-5hb.ee`
- `RATE_LIMIT_WINDOW_SECONDS`: rate limiti aken sekundites, vaikimisi `60`
- `RATE_LIMIT_MAX_REQUESTS`: lubatud API päringute arv ühe IP kohta aknas, vaikimisi `30`
