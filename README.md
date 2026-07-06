# GeoCritter Lens

A slim static PWA prototype for a geolocation creature-catching game.

It uses:

- Plain JavaScript ES modules
- Leaflet for the map and geozones
- PixiJS for the camera/scanner encounter overlay
- IndexedDB for local caught-creature saves and custom test spawns
- No backend, no build step, no npm, no Supabase yet

The prototype is designed to be hosted directly on GitHub Pages.

## What it demonstrates

- A map with geolocated creature zones
- Real browser geolocation when the user grants permission
- A simulation mode for desktop/mobile testing without walking anywhere
- A local “Spawn here” button that creates a test geozone near your current/simulated location
- A full-screen camera encounter
- A PixiJS scanner/portal reveal effect
- A generic creature that emerges and can be caught with a pulse
- Local collection persistence via IndexedDB
- JSON save backup download/share and safe merge/replace import
- Basic installable PWA files: manifest + service worker + icons

## Quick local test

Because camera and geolocation need a secure context, test from localhost rather than opening `index.html` directly from the file system.

```bash
cd geocritter-pwa
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080
```

Then try:

1. Click **Simulate near**.
2. Click **Open scanner encounter**.
3. Allow camera if prompted, or use the fallback demo background.
4. Wait for the creature to appear.
5. Click/tap near the creature or use **Pulse capture**.

## Deploy to GitHub Pages

1. Create a GitHub repository, for example `geocritter-pwa`.
2. Copy all files from this folder into the repository root.
3. Commit and push to `main`.
4. In GitHub, go to **Settings → Pages**.
5. Set **Source** to **Deploy from a branch**.
6. Choose branch `main` and folder `/root`.
7. Open the published Pages URL.

GitHub Pages serves over HTTPS, which is important for geolocation and camera access.

## Mobile testing notes

- On iPhone/Android, open the GitHub Pages URL in the browser first.
- Camera permission is requested only when entering the encounter screen.
- Location permission is requested when tapping **Use my location**.
- The encounter also works with the fallback background if the camera is unavailable or blocked.
- iOS may require a user gesture before motion/orientation sensors can be enabled; use the **Enable motion** button inside the encounter.

## Backup and manual phone-to-phone merge

Version 0.2 adds a local backup/restore screen. It is intentionally backend-free.

### Export or share a backup

Use **Share backup** to create a small JSON save file and send it through the device share sheet when supported. On phones this can usually be shared through Mail, Messages, Drive, AirDrop, etc. If file sharing is unavailable, the app downloads the same JSON file instead.

Use **Download JSON** when you explicitly want a file download.

The backup includes:

- caught creatures
- custom local spawn zones
- small app settings

It does not include bundled creature art, map tiles, camera images, or app files.

### Import a backup

Use **Import backup** and choose a `geocritter-save-....json` file. The app validates the file and shows a preview before changing IndexedDB.

The normal mode is **Merge**:

- new catches from the backup are shown in a collection-style preview
- already-present catches are ignored
- custom zones are added or updated if newer
- nothing already on the phone is deleted

The advanced mode is **Replace local save**:

- clears local catches and custom zones
- restores the selected backup
- asks for an extra confirmation first

For two phones without a backend, use this manual exchange:

1. Phone A: Share backup.
2. Phone B: Import backup → review new catches → Add new catches.
3. Phone B: Share backup.
4. Phone A: Import backup → review new catches → Add new catches.

This is not live cloud sync, but it is simple, transparent, and independent of Supabase or any other backend.

## Files

```text
index.html                 Main app shell
styles.css                 Layout and visual styling
manifest.webmanifest       PWA manifest
service-worker.js          Basic app-shell cache
assets/icon.svg            SVG icon source
assets/icon-192.png        PWA icon
assets/icon-512.png        PWA icon
src/app.js                 Main application, map, state and UI
src/config.js              Demo spawns and map config
src/creatures.js           Creature data
src/db.js                  IndexedDB wrapper
src/backup.js              JSON backup/share/import helpers
src/encounter.js           PixiJS camera/scanner encounter
src/geo.js                 Distance and geolocation helpers
```

## Design constraints

This is intentionally not true AR. The camera feed is real, but the creature is a stylized PixiJS overlay. That keeps the game cross-platform and lightweight while still giving the child a convincing “scanner lens” moment.

## Next upgrades

Good next steps after testing:

- Add sprite-sheet creatures instead of vector-drawn PixiJS shapes
- Add sound effects and haptics
- Add a small admin JSON file or Supabase table for spawn points
- Add quests and rarity rules
- Add photo-card generation after catch
- Add better offline asset caching
- Add a kid-safe content/privacy pass before real use
