# Päevapakkumiste dashboard

Väike isiklik Node.js webapp, mis kuvab töö, kooli ja kodu ümbruse restoranide päevapakkumisi.

## Käivitamine

```bash
npm install
npm run dev
```

Rakendus avaneb aadressil `http://localhost:3000`.

## Restoranide muutmine

Muuda faili `data/restaurants.json`.

```json
{
  "name": "Al Mare Grill",
  "city": "tallinn",
  "slug": "al-mare-grill"
}
```

`slug` on viimane URLi osa, näiteks:

```text
https://xn--pevapakkumised-5hb.ee/tallinn/al-mare-grill
```

## Keskkonnamuutujad

- `PORT`: serveri port, vaikimisi `3000`
- `CACHE_TTL_SECONDS`: cache'i eluiga sekundites, vaikimisi `1800`
- `DB_PATH`: cache-faili asukoht, vaikimisi `data/cache.json`
- `RESTAURANTS_PATH`: restoranide config, vaikimisi `data/restaurants.json`
- `SOURCE_BASE_URL`: päevapakkumiste allikas, vaikimisi `https://xn--pevapakkumised-5hb.ee`

Railways piisab tavaliselt `npm start` käsust. Dockerfile on olemas juhuks, kui soovid deploy teha konteinerina.
