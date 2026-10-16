# Just Surf backend

API for the Just Surf apps (Israel and US): weekly surf articles and **sponsor banners**, with an admin panel.

## Environment variables

| Name | What |
|---|---|
| `MONGO_URI` | MongoDB connection string (MongoDB Atlas free tier works) |
| `ADMIN_PASSWORD` | Password for the admin panel and admin API. Without it, admin is disabled. |
| `PUBLIC_URL` | Optional. The public address of the server, e.g. `https://api.justsurf.app`, used in image links |
| `PORT` | Optional, default 3000 |

## Run

```bash
npm ci
npm start      # http://localhost:3000, admin panel at /admin
npm test
```

## Sponsors

- Admin panel: `/admin` - create a banner, pick the app (il / us), upload an image, choose spots or regions and dates, see views and taps per day (CSV export).
- `GET /api/sponsors?app=il|us` - live banners for the app (cached 5 min).
- `GET /api/sponsors/:id/image` - banner image.
- `POST /api/sponsors/:id/events` with `{ "type": "impression" | "click" }` - counted per day, rate limited per IP.
- Admin API (`Authorization: Bearer <ADMIN_PASSWORD>`): `/api/admin/sponsors` (GET, POST), `/api/admin/sponsors/:id` (PUT, DELETE), `/api/admin/sponsors/:id/stats`.

The spot lists the admin panel uses are `public/spots-il.json` and `public/spots-us.json` (generated from the apps' `src/data/spots.js`).

## Articles

The weekly bot drafts an article every Sunday; approve it via the admin API. Admin article routes now also need the password.
