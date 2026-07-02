# Kuula — Self-Hosting Guide

This app is a static web app (React + Vite). The build produces a `dist/` folder
of HTML/CSS/JS that you can serve from **any web server** — nginx, Apache, Caddy,
a CDN, a VPS, or even a Raspberry Pi.

The backend is entirely in **Supabase** (database + Edge Functions). No Node.js
server needs to run alongside the web files.

---

## 1. Prerequisites

| What | Details |
|------|---------|
| Supabase project | Already set up at `yuqhwjvmamjwklumlhtt.supabase.co` |
| A web server / host | Nginx on a VPS, Cloudflare Pages, or any static host |
| Node.js 18+ | Only needed on the build machine, not the server |

---

## 2. Get the code

```bash
git clone https://github.com/jolems123/Kuula.git
cd Kuula
npm install
```

---

## 3. Create your environment file

```bash
cp .env.example .env.local
```

Edit `.env.local` — the values below are everything you need for the Supabase backend:

```env
# ── Required ──────────────────────────────────────────────────────────────────
VITE_USE_API=true
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://yuqhwjvmamjwklumlhtt.supabase.co
VITE_SUPABASE_ANON_KEY=<your sb_publishable_... key from Supabase → Settings → API>

# ── App ───────────────────────────────────────────────────────────────────────
VITE_APP_ENV=production
VITE_APP_VERSION=2.4.1

# ── Feature flags ─────────────────────────────────────────────────────────────
VITE_ENABLE_BIOMETRIC=true
VITE_ENABLE_SAVINGS=true
```

> **Never** put `SUPABASE_SERVICE_ROLE_KEY`, `MARZPAY_API_KEY`, or
> `MARZPAY_WEBHOOK_SECRET` here — those are server-side secrets that live only
> in Supabase Edge Function secrets. The anon key above is safe to embed.

---

## 4. Build

```bash
npm run build
```

This creates a `dist/` folder. Copy that folder to your web server.

---

## 5. Configure your web server

The app uses **HashRouter** (URLs like `kuula.example.com/#/dashboard`), so your
server needs **no special routing rules** — just serve `index.html` for every
request and the app handles the rest.

### Nginx (VPS)

```nginx
server {
    listen 80;
    server_name kuula.example.com;          # ← your domain
    root /var/www/kuula/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;   # handles deep links
    }

    # Cache static assets aggressively (filenames are content-hashed)
    location ~* \.(js|css|png|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Add HTTPS with Certbot:
```bash
sudo certbot --nginx -d kuula.example.com
```

### Apache (.htaccess)

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]
```

### Cloudflare Pages

Connect the GitHub repo. Set build command `npm run build`, output dir `dist`,
and add the four env vars from step 3 in the Pages dashboard.

### Any other CDN / static host

Point it at the `dist/` folder. No server-side rendering or API proxy needed.

---

## 6. Supabase — nothing to change

The database and Edge Functions are already live. The app talks to Supabase
directly from the browser using the anon key (Row Level Security enforces access).

Edge Functions handle all real-money calls (MarzPay) server-side.

---

## 7. Deploy missing Edge Functions (one-time, if not already done)

Two functions (`credit-score`, `auto-collect`) need to be deployed.

```bash
# Install Supabase CLI
npm install -g supabase

# Log in with your sbp_ token
export SUPABASE_ACCESS_TOKEN=sbp_xxxx

# Deploy all functions
supabase functions deploy --project-ref yuqhwjvmamjwklumlhtt
```

Or trigger the **GitHub Actions** workflow (Actions → Deploy Supabase Edge
Functions → Run workflow) — this works if you've already added `SUPABASE_ACCESS_TOKEN`
and `SUPABASE_PROJECT_REF` as GitHub secrets.

---

## 8. Verify everything is working

Run this script on your build machine (needs the env vars loaded):

```bash
node scripts/verify-prod.mjs
```

You should see 26/26 ✅ before going live.

---

## 9. Mobile app (optional)

To build an Android APK or iOS IPA from the same codebase:

```bash
npm run cap:android   # opens Android Studio
npm run cap:ios       # opens Xcode
```

The Capacitor config is already set up — the native app calls the same Supabase
backend as the web app.

---

## Quick reference

| Item | Value |
|------|-------|
| Supabase project | `yuqhwjvmamjwklumlhtt` |
| Supabase dashboard | https://supabase.com/dashboard/project/yuqhwjvmamjwklumlhtt |
| GitHub repo | https://github.com/jolems123/Kuula |
| Production checklist | `PRODUCTION.md` |
| Verify script | `node scripts/verify-prod.mjs` |
