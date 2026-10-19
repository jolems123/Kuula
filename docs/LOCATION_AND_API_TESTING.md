# Business location and API checks

Kuula uses device geolocation plus OpenStreetMap raster tiles. No paid map key,
Google billing account, geocoding subscription or new server is required.
Addresses remain entered by the applicant; a map pin does not automatically
verify a business or turn coordinates into a street address.

## Capture a customer's business location

1. Open the deployed app directly at https://app.kuulapp.com on your phone.
2. Turn on the phone's location services. Open a business loan application.
3. At the business premises, tap **Use my current location** and allow location
   access when prompted. Wait for coordinates and an accuracy estimate.
4. Confirm that the pin matches the premises. GPS accuracy varies; a large
   accuracy estimate is not proof of the exact shop location.
5. Alternatively, tap **Choose location on map**, drag and zoom to the premises,
   then tap the map or **Place pin at map centre**. Coordinates can also be
   typed and confirmed using **Place manual pin**.
6. Continue the application. The saved business profile records the coordinates,
   capture time, GPS accuracy where available, and whether the pin came from GPS
   or manual placement. Moving a GPS pin marks it as manually positioned.

The initial map view is Kampala, not a location captured from the applicant.
No default pin is saved. Do not pin a home address for a business at another site.
Photo uploads, including the applicant-at-business photo, are separate evidence;
photos alone do not establish that someone was physically at the premises.

## Capture an officer's visit location

Sign in as Loan Officer, open an assigned case from **My review queue**, open
**Evaluation**, tap **Capture visit GPS**, and save the evaluation draft.
An officer must have an assigned Level 1 case. Both `officer` and `loan_officer`
roles use the field-evaluation screen. Coordinates at latitude zero are valid.
The enhanced officer photo uploader includes the captured visit coordinates
when available; it must not be described as proof of the photo's original GPS.

## If location does not work

- Open the app directly over HTTPS rather than in a third-party embedded browser.
- In the address bar's site permissions, allow location for app.kuulapp.com.
- On Android: Settings → Location → On; allow location for the browser/app while
  using it. On iPhone: Settings → Privacy & Security → Location Services → On;
  allow the browser/app while using it. Enable precise location if you choose.
- Try near a window or outdoors. The app first requests a high-accuracy fix and
  falls back to a device/network fix after timeout or unavailability. Denial is
  not retried automatically. Total wait is bounded at about 25 seconds.
- If GPS remains unavailable, use the map/manual pin. If map imagery cannot load,
  coordinates and the typed address still work; check the network and try again.

GPS is requested only from a user action; there is no background tracking. The
live app must serve `Permissions-Policy: geolocation=(self)`. The public marketing
website continues to deny location. The app's image policy allows only the exact
OpenStreetMap tile host in addition to its existing image sources. Arbitrary
iframes remain blocked because the map no longer depends on an iframe.

## Safe live API checks

In PowerShell, from the Kuula project folder:

```powershell
npm run check:api
```

To also request one public map tile:

```powershell
npm run check:api -- --maps
```

These checks only read API health, database/schema readiness, app headers, API
CORS settings and optionally one public map tile. They do not approve customers,
create loans, change records, request private GPS or make payments. `PASS` does
not certify SMS/email delivery, physical GPS hardware or payment settlement.
`FAIL` identifies the check to inspect in Railway logs. A nonzero exit code
means a check failed; a healthy database does not establish correct permissions
for every authenticated endpoint.

## Local and authenticated API testing

```powershell
npm run check:api -- --api http://127.0.0.1:3000 --app http://127.0.0.1:5173
npm test
npm test --prefix server
```

Start the isolated local backend/database and frontend first. With that local
environment running, `TEST_KUULA_LOCAL.ps1` exercises customer/admin login,
sessions, catalogue, support routing, notification persistence and operations
queues. It writes synthetic local records; do not change its URLs to production.

For a staged business workflow, create an isolated test customer and assigned
officer. Capture/pin the business location, submit test evidence and read the
application back to confirm the business coordinates, source and accuracy.
Save an officer evaluation and read the case detail back to confirm the visit
coordinates. The API rejects partial pairs, invalid numbers, latitude beyond
±90 and longitude beyond ±180. Never send production tokens or customer IDs in
chat or commit them to a test file. Test real payment providers only through
the separate controlled release process in REAL_MONEY_ACTIVATION.md.

## Native and map-service limits

Android now declares foreground fine/coarse location and still removes background
location. iOS declares location-while-in-use and preserves that description during
the native build. Existing installed APK/IPA files need a new build; a website
deployment cannot change phone-app permissions. Physical Android/iPhone testing
is required before claiming native GPS works on those devices.

The map requests only visible tiles, uses normal browser caching, identifies the
web origin through its referrer, and shows OpenStreetMap attribution. There is
no offline map download or background prefetch. Public OSM tiles are a shared,
best-effort service rather than a guaranteed unlimited production API. Reassess
hosting/provider capacity as traffic grows and review native store permission
policies before a store release.

Sources: [Geolocation permission policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/geolocation),
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
