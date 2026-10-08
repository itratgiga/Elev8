# Elev8 Studio

An AI platform for offline shopkeepers: AI social posts, live virtual try-on, store kiosk, 360° product viewer, dashboard and onboarding.

## Run it on your computer

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign in with a shop owner account.

## What it does

- **Posts**: pick a product, the backend writes the caption and prepares drafts; edit, approve, schedule or publish to Instagram and Facebook.
- **Products**: add, edit and delete products and upload front, back, side and detail photos.
- **Try-on and Kiosk**: live virtual try-on mirror with a product list at the side; Snap a product to try any garment; store kiosk mode for a counter screen.
- **360° view**: turn a product around from its photos.
- **Onboarding**: shop name, brand colour (picker or hex code), logo and tour.

## How it connects

- Login uses Supabase Auth. Each shop only sees its own rows (Row Level Security).
- Try-on uses the Decart realtime API through the `tryon-token` and `tryon-garment` edge functions.
- `src/lib/supabase.js` holds only the public anon key. Never add a service role key, Meta token, Gemini key or Decart key to this app.

## Deploy

`npm run build` creates a `dist` folder. Deploy it to Vercel as a static Vite site.
