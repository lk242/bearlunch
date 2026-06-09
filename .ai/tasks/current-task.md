# Current Task

## Status

This project is a Vite/React lunch-ordering UI with an Express API server that integrates with DinBenDon and Firebase.

The latest committed work already supports:

- Syncing active DinBenDon menus into Firebase.
- Pushing Firebase lunch orders into matching DinBenDon orders.
- Viewing and cancelling items previously pushed by this app.
- Render deployment through `render.yaml`.

The current uncommitted work continues Claude's in-progress feature:

- Add a configurable total agent name for DinBenDon pushes.
- Push each shop as one DinBenDon buyer entry using the agent name.
- Store the real orderer's name in each DinBenDon item comment.
- Add daily scheduled menu sync and order push using Firebase config fields.

## Files In Progress

- `app.jsx`
  - Active frontend entry used by `src/main.jsx`.
  - Adds admin-only settings for `agentName`, `autoSyncTime`, and `autoPushTime`.
  - Sends `agentName` to `POST /api/push-orders`.
- `server.mjs`
  - Implements `pushOrders(agentName)`.
  - Watches Firebase settings with `onSnapshot`.
  - Schedules daily sync and push while the server process is running.

## Important Notes

- The app imports `../app.jsx` from `src/main.jsx`; `src/App.jsx` is not the active app entry for the current build.
- `npm run build` passes.
- `npm run lint` currently fails on existing baseline lint issues in both `app.jsx` and `src/App.jsx`; do not assume new edits caused all lint failures.
- Production runs through `node server.mjs --production` on Render, so schedules only run while the Render web service is alive.
- Firebase collection root is `artifacts/bear-joy-lunch-express/public/data`.

## Verification Commands

```powershell
npm run build
node --check server.mjs
```

## Follow-Up Checklist

- Test manual `POST /api/sync-menu`.
- Test manual `POST /api/push-orders` with a real `agentName`.
- Confirm DinBenDon returns `orderItemIds` in the same order as `addProducts`.
- Test `GET /api/dbd-items` after a total-agent push.
- Test `POST /api/cancel-items` after viewing pushed items.
- If schedules matter in production, confirm Render instance uptime behavior is acceptable.
