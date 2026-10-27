# Installing Trimora Pet on a phone (PWA)

Status: built for Trimora Pet only. Verified by automated tests and a Vercel preview fetch; **not yet verified on a real phone**
(see "Check on a real phone" below). The Salon/Auto POS keeps its existing install setup, unchanged.

## What was wrong
- Trimora Pet set **no web app manifest** and registered **no service worker**, so a phone could not install it as an app.
  (Both existed only for the Salon/Auto POS.)
- The existing service-worker registration waited for the window `load` event. These screens mount after an async check,
  when `load` has usually already fired, so registration could silently never happen. `registerServiceWorker()` now
  registers immediately if the page has finished loading.

## How it works now
| Piece | File | Job |
|---|---|---|
| Manifest | `public/pet.webmanifest` | One static file; **relative** `start_url: "pet"` and `scope: "./"` |
| Routing | `vercel.json` | `/:slug/pet.webmanifest` -> `/pet.webmanifest` (before the SPA catch-all), correct content type, 1 h cache |
| Per-business link | `setPetPwaManifest()` in `src/lib/pwaManifest.js` | Points `<link rel="manifest">` at `/<slug>/pet.webmanifest`; sets the iOS home-screen name and page title |
| Service worker | `public/service-worker.js` (cache `v2`) | Unchanged logic, but manifests are never cached |
| Install button | `src/lib/installPrompt.js`, `src/pages/pet/InstallAppButton.jsx` | "Install app on this device" in the Pet sidebar footer |
| Wiring | `PetStaffRoute` in `src/pages/PetApp.jsx` | Starts listening, publishes the manifest, registers the worker (also on the login screen) |

**Why a real URL and not a `blob:` manifest (what the Salon POS uses):** Chrome on Android installs a real app (a WebAPK) from
a manifest served at an https URL. Sources disagree on whether it accepts `blob:` manifests, and this cannot be tested without
a phone, so Pet uses the approach that is documented to work. A browser resolves a manifest's relative URLs against the URL it
*requested* (the server-side rewrite is invisible to it), so every business gets its own start page
(`/<slug>/pet`), scope (`/<slug>/`) and separate install from one shared file, with no server code.

## What people see
- **Android (Chrome/Edge):** after the app loads, "Install app on this device" appears in the sidebar (open the menu on a phone).
  Tapping it opens the browser's own install dialog. The browser menu's "Install app" also works.
- **iPhone/iPad:** Apple gives websites no install button, so the same control shows the steps: Share -> Add to Home Screen -> Add.
- **Already installed / unsupported browser:** nothing is shown.

## Known limits
- The Android app label is **"Trimora Pet"** for every business (a static file cannot hold each business's name). iOS pre-fills the
  business name. A per-business Android label would need a small server function; not built.
- Icons are declared as ordinary icons, not "maskable": the artwork is full-bleed and has not been checked against Android's
  round/squircle safe zone.
- Installing does not add offline data. The service worker only caches the app shell; all data still needs a connection.
- The install button needs the browser's one-time `beforeinstallprompt` event. If a browser never sends it (already installed,
  or install criteria not met) the button is simply not shown; the browser menu is the fallback.

## Check on a real phone (after the first deploy)
1. Android + Chrome: open `https://<app>/<slug>/pet`, sign in. "Install app on this device" should appear in the menu. Tap it and
   confirm. Launch from the home screen: it should open without the address bar, on the sign-in or Overview screen.
2. In Chrome DevTools (remote debugging) > Application > Manifest: no errors, "Installability" lists no issues.
3. iPhone + Safari: Share -> Add to Home Screen. The suggested name should be the business name.
4. Deploy a change, reopen the installed app, and confirm it picks up the new version (pages are fetched network-first).

## If the Salon/Auto POS should get the same treatment
Add `public/pos.webmanifest` the same way (`start_url: "pos"`), a `/:slug/pos.webmanifest` rewrite, and switch `setPwaManifest()` to a
URL like `setPetPwaManifest()` does. Not done here to avoid changing a live product that cannot be tested on a phone from this repo.
