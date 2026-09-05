# Deployment Guide

## Vercel Deployment (Frontend)

### Fix: X-Frame-Options Error

The error "Unsafe attempt to load URL from frame with URL chrome-error://chromewebdata/..." was caused by the `X-Frame-Options: SAMEORIGIN` header in `vercel.json`.

**Fix applied:** Changed `X-Frame-Options` from `SAMEORIGIN` to `DENY` in `vercel.json:14-15`.

This prevents the page from being embedded in any iframe, eliminating the frame-loading security error. Since Strangr is a video chat app that doesn't need iframe embedding, `DENY` is the correct setting.

**File modified:** `vercel.json`
```json
{
  "X-Frame-Options": "DENY"  // Changed from SAMEORIGIN
}
```

After this fix, redeploy to Vercel for the change to take effect.

---

## Render Deployment (Backend)

The backend consists of `server.ts` which combines Next.js frontend + Socket.io real-time signaling in a single Node.js process.

### 1. Prepare Package.json Scripts

Ensure these scripts exist in `package.json`:
```json
{
  "scripts": {
    "build": "next build",
    "start": "NODE_ENV=production tsx server.ts",
    "dev": "next dev",
    "dev:server": "tsx server.ts",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

### 2. Render Dashboard Configuration

1. Go to [render.com](https://render.com) and create a new Web Service
2. Connect your GitHub repository
3. Configure the service:

**Build Command:** `npm run build`
**Start Command:** `npm start`
**Node Version:** Select your Node.js version

### 3. Environment Variables

Add these variables in the Render dashboard under "Environment":

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your PostgreSQL connection string (e.g., Neon: `postgresql://neondb_owner:npg_jXv9qBArnSd4@ep-autumn-hall-axtwpibx-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`) |
| `NODE_ENV` | `production` |

### 4. Database Setup

**Option A: Use Neon PostgreSQL** (recommended - keep existing)
- Add your Neon DATABASE_URL as the `DATABASE_URL` environment variable on Render
- The existing `DATABASE_URL` in `.env` points to Neon and will work

**Option B: Provision PostgreSQL on Render**
- Add a PostgreSQL service in your Render dashboard
- Update `DATABASE_URL` with the new connection string

### 5. Deployment Settings

- **Health Check Path:** `/api/health` (exists in `src/app/api/health/route.ts`)
- Render will automatically provide `PORT` environment variable
- The server handles `PORT` with fallback to `3000`

### 6. Post-Deployment

1. Wait for the build to complete
2. Visit your Render URL (e.g., `https://video-chat-backend.onrender.com`)
3. The server should start and listen for connections
4. Test the API endpoints:
   - `GET /api/health` - health check
   - `GET /api/ice-servers` - STUN/TURN config
   - WebSocket connectivity at `/api/socketio`

### 7. Render Free Tier Notes

- The server will sleep after 15 minutes of inactivity
- First request will wake the server (slight delay)
- Consider upgrading to Starter plan for always-on behavior

---

## Complete Workflow

### Vercel (Frontend)
1. Push code to GitHub
2. Vercel auto-detects and builds
3. Domain: `video-chat-app-9yiv.vercel.app` or custom domain
4. X-Frame-Options: `DENY` (already configured)

### Render (Backend)
1. Create new Web Service on render.com
2. Connect same GitHub repo
3. Set Build: `npm run build`, Start: `npm start`
4. Add `DATABASE_URL` and `NODE_ENV=production` env vars
5. Deploy and test

Both deployments use the same codebase - Vercel handles the frontend HTTP serving, while Render hosts the backend Node.js process with Socket.io signaling and PostgreSQL database.