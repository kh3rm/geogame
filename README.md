# GeoCritter Lens

En liten, statisk PWA-prototyp för geoplacerad figurjakt. Projektet är byggt för GitHub Pages utan backend, npm eller byggsteg.

## Ingår

- Vanilla JavaScript / ES-moduler
- Leaflet-karta och fångstplatser
- PixiJS-baserat kamerafångstläge
- IndexedDB för lokala fångster, egna testfigurer och backupflöde
- PWA-manifest och service worker
- JSON-backup med delning/nedladdning/import
- Diskret backupmeny direkt under kartan
- Svenskt gränssnitt
- Samlingskort med samma figuridentitet som i kamerafångsten
- Detaljvy för tidigare fångster med karta
- Dold adminvy för att bygga och aktivera promenadscenarion

## Testa lokalt

Kör från projektmappen:

```bash
python3 -m http.server 8080
```

Öppna sedan:

```text
http://localhost:8080
```

Kamera och plats kräver säker kontext. `localhost` fungerar lokalt. GitHub Pages fungerar eftersom sidan serveras via HTTPS.

## Snabbtest

1. Tryck **Simulera nära**.
2. Tryck **Öppna kamerafångst**.
3. Tillåt kamera, eller använd demobakgrunden om kameran blockeras.
4. Figuren virvlar över kameravyn.
5. Tryck direkt på figuren fem gånger.
6. Varje träff ger en liten visuell reaktion.
7. På femte träffen visas `____ fångad!` i tre sekunder.
8. Därefter sparas exakt en fångst för den platsen.

## Viktigt om fångster

Från v0.4 gäller:

- en plats/spawn kan bara ge en registrerad fångst
- fångst sparas först efter fem giltiga träffar
- missar nära figuren räknas inte
- äldre dubbla fångster per plats rensas lokalt vid appstart
- backup/import försöker också hålla fångster unika per plats

## Backup och manuell telefon-till-telefon-sammanfogning

Backupmenyn ligger nu diskret i verktygsraden direkt under kartan bakom 💾 **Backup**. Tryck där för att öppna alternativen nedåt medan knappen ligger kvar.

Använd **Dela** för att skapa en liten JSON-sparfil och dela den via telefonens delningsmeny, till exempel Mail, Meddelanden, Drive eller AirDrop. Om fildelning inte stöds laddas samma JSON-fil ned i stället.

Använd **Ladda ned** om du uttryckligen vill spara filen lokalt.

Använd **Importera** för att välja en `geocritter-save-....json`-fil. Appen validerar filen och visar en granskning innan IndexedDB ändras.

Sammanfoga:

- lägger bara till saknade fångster
- ignorerar fångster som redan finns på telefonen
- raderar aldrig lokala fångster
- visar nya fångster tydligt före bekräftelse

Ersätt lokal sparfil:

- är ett separat, destruktivt läge
- kräver extra bekräftelse
- används främst vid flytt till ny telefon


## Admin och promenadscenarion

Längst nere till höger i kartvyn finns en mycket diskret **Admin**-knapp. Den öppnar en lösenordsskyddad lokal byggvy. Lösenordet är `AdmiN`.

Adminvyn är tänkt för en vuxen/arrangör och låter dig:

- skapa namngivna promenader/scenarion
- välja figurtyp
- placera ut figurer manuellt på en separat byggkarta
- auto-sprida ett valt antal figurer inom ett område runt kartans mitt
- välja fångstavstånd
- aktivera en promenad så huvudkartan bara visar just den rundans figurer
- stänga av promenadläget och gå tillbaka till vanligt demo-/testläge

Scenarion sparas lokalt i IndexedDB. Själva figurerna ligger i `customSpawns` med `source: "scenario"`, och scenariolistan sparas i settings. Backup/replace tar med allt. Merge lägger även ihop importerade promenadinställningar utan att aktivera dem automatiskt.

Adminlösenordet är bara ett diskret lokalt UX-lås för barnet, inte kryptografisk säkerhet.

## Publicera på GitHub Pages

1. Skapa ett nytt GitHub-repo.
2. Ladda upp filerna i projektmappen till repo-roten.
3. Gå till **Settings → Pages**.
4. Välj **Deploy from branch**.
5. Välj `main` och `/root`.
6. Öppna den publicerade Pages-adressen på mobilen.

## Samling och detaljvy

Listan **Fångade figurer** visar en liten bild av varje fångad figur. Bilden bygger på samma `creatureId`, färger och formprinciper som kamerafångsten och fångstbekräftelsen, så att figuren inte glider ur synk mellan vyerna.

Tryck på en tidigare fångst för att öppna ett minimalistiskt fångstkort med:

- större figurvy
- namn och beskrivning
- tidpunkt
- plats
- karta centrerad på fångstplatsen

Äldre fångster utan sparad platsposition försöker falla tillbaka till platsens position i aktuell appdata.

## Projektstruktur

```text
index.html                 Appens HTML
styles.css                 Layout och spel-UI
manifest.webmanifest       PWA-installation
service-worker.js          Enkel cache för appskalet
assets/                    Ikoner
src/app.js                 Huvudflöde, karta, UI, samling
src/encounter.js           PixiJS-kamerafångst med fem träffar
src/db.js                  IndexedDB-hjälpare
src/backup.js              JSON-backup, delning, import och merge
src/config.js              Demofigurer och kartinställningar
src/creatures.js           Figurer
src/geo.js                 Avstånd och signalstyrka
```

## Versionsanteckningar

- v0.1: första statiska prototypen.
- v0.2: JSON-backup, delning/import, merge/replace.
- v0.3: aktivt virvlande kamerafångstläge.
- v0.4: svenskt gränssnitt, fem direkta träffar krävs, en fångst per plats, tresekunders fångstbekräftelse.
- v0.5: diskret backupknapp under kartan, figurminiatyrer i samlingen, konsekvent figuridentitet och detaljvy med karta.
- v0.6: dold adminvy med lösenordet `AdmiN`, promenadscenarion, separat byggkarta, manuell placering, auto-spridning och aktivt scenario-läge.
- v0.7: renare huvudkarta, backup/admin-rad under kartan, tydligare figursignal, mindre zon-språk, fångstavstånd som slider och tillfälligt spridningsområde för auto-spridning.
