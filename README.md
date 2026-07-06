# GeoCritter Lens

En liten, statisk PWA-prototyp för geoplacerad figurjakt. Projektet är byggt för GitHub Pages utan backend, npm eller byggsteg.

## Ingår

- Vanilla JavaScript / ES-moduler
- Leaflet-karta och geozoner
- PixiJS-baserat kamerafångstläge
- IndexedDB för lokala fångster, egna testzoner och backupflöde
- PWA-manifest och service worker
- JSON-backup med delning/nedladdning/import
- Diskret backupmeny direkt under kartan
- Svenskt gränssnitt
- Samlingskort med samma figuridentitet som i kamerafångsten
- Detaljvy för tidigare fångster med karta

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
8. Därefter sparas exakt en fångst för den zonen.

## Viktigt om fångster

Från v0.4 gäller:

- en zon/spawn kan bara ge en registrerad fångst
- fångst sparas först efter fem giltiga träffar
- missar nära figuren räknas inte
- äldre dubbla fångster per zon rensas lokalt vid appstart
- backup/import försöker också hålla fångster unika per zon

## Backup och manuell telefon-till-telefon-sammanfogning

Backupmenyn ligger nu diskret nere till vänster i kartvyn bakom 💾 **Backup**. Tryck där för att öppna alternativen.

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
- zon/plats
- karta centrerad på fångstzonen

Äldre fångster utan sparad zonposition försöker falla tillbaka till zonens position i aktuell appdata.

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
src/config.js              Demozoner och kartinställningar
src/creatures.js           Figurer
src/geo.js                 Avstånd och signalstyrka
```

## Versionsanteckningar

- v0.1: första statiska prototypen.
- v0.2: JSON-backup, delning/import, merge/replace.
- v0.3: aktivt virvlande kamerafångstläge.
- v0.4: svenskt gränssnitt, fem direkta träffar krävs, en fångst per zon, tresekunders fångstbekräftelse.
- v0.5: diskret backupknapp under kartan, figurminiatyrer i samlingen, konsekvent figuridentitet och detaljvy med karta.
