# Bicicas Navigator

Navigation for the Bicicas stations in Castelló de la Plana. One web codebase runs in the browser and, through Capacitor, on Android and iOS.

The map is [MapLibre](https://maplibre.org/) with the OpenFreeMap Positron style (OpenStreetMap). Station occupancy comes from the feed used by the map on [dev.bicicas.es](https://dev.bicicas.es/mapa): `https://ws2.bicicas.es/bench_status_map`. Routes use the public [Valhalla](https://valhalla.github.io/valhalla/) server: walking from the start to a station with bikes, cycling between stations, then walking to the destination.

## Develop

```bash
npm install
npm run dev
```

## GitHub Pages

The published site is `https://mammutor.github.io/Bicicas-Navigator/`. In the repository settings, set Pages → Build and deployment → Source to **GitHub Actions**. A push to `main` runs `.github/workflows/pages.yml`, which builds the site with the Dockerfile and publishes it. Pages serves it over HTTPS, which the browser requires before it will install the app.

To produce the same files locally:

```bash
docker buildx build --target export -o type=local,dest=./site .
```

The install prompt is available from that HTTPS address, or from localhost after `npm run build` and `npm run preview`. Opening the built files directly will not install.

## Android and iOS

```bash
npm run cap:sync
npx cap add android   # once
npx cap add ios       # once, on macOS
npm run cap:android
npm run cap:ios
```

The public Valhalla demo is for development and fair use. Send `X-Client-Id: bicicas-navigator` (already set). A published app should use its own Valhalla instance.
