# Bear Joy Lunch Skill

Use this when working in the `bear-joy-lunch` repo.

## Project Shape

- Frontend: Vite + React.
- Active React entry: `src/main.jsx` imports root-level `app.jsx`.
- Backend: `server.mjs`, Express 5, Firebase client SDK, DinBenDon API calls.
- Deployment: Render web service using `render.yaml`.
- Firebase app id used by backend: `bear-joy-lunch-express`.

## Working Rules

- Inspect `git status --short --branch` first. Claude or another agent may leave uncommitted changes.
- Treat root `app.jsx` as the active UI unless `src/main.jsx` changes.
- Prefer focused edits in `app.jsx` and `server.mjs`; avoid syncing old `src/App.jsx` unless the entrypoint changes.
- Do not rely on `npm run lint` as a clean signal until the existing baseline lint errors are handled.
- Use `npm run build` and `node --check server.mjs` for quick sanity checks.

## DinBenDon Flow

- `POST /api/sync-menu`
  - Logs into DinBenDon.
  - Reads active in-progress orders.
  - Pulls menu categories/products/variations.
  - Writes menu items to Firebase.
  - Updates Firebase settings deadline from DinBenDon `expireDate`.
- `POST /api/push-orders`
  - Reads unpushed Firebase orders.
  - Groups by `shopName`.
  - Matches each Firebase shop to an active DinBenDon order.
  - Finds DinBenDon products by name and price.
  - Sends `addProducts` to `/order/{hash}/add-item`.
- `GET /api/dbd-items`
  - Reads Firebase `dbdOrderItemIds`.
  - Calls DinBenDon buyer-for-buyer endpoint.
  - Filters to items this app pushed.
- `POST /api/cancel-items`
  - Calls DinBenDon cancel endpoint for selected item ids.

## Current Feature Contract

Total-agent push mode means:

- DinBenDon `playedName` should be the configured `agentName`.
- Each product comment should contain the real Firebase `order.userName`.
- Firebase should only store the DinBenDon item ids that belong to that specific Firebase order.
- Scheduled menu sync should clear stale menu records before writing the latest menu.
- Scheduled push should read the current `agentName` from Firebase at execution time, not capture an old value.

## Config Fields

Stored at `artifacts/{APP_ID}/public/data/config/settings`:

- `deadline`
- `deadlineTimestamp`
- `agentName`
- `autoSyncTime`
- `autoPushTime`
