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
- Dold, mobiloptimerad adminvy för att bygga och aktivera promenader
- Slimmad, illustrerad header med två klickbara animerade barnfigurer
- Lokala figurpaket med egna namn, beskrivningar och bildfiler

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


## Admin och promenader

Längst nere till höger i kartvyn finns en mycket diskret **Admin**-knapp. Den öppnar en lösenordsskyddad lokal planeringsvy. Lösenordet är `AdmiN`.

Adminvyn är mobiloptimerad och uppdelad i tre steg:

1. **Promenader** – skapa en ny promenad eller välj en befintlig.
2. **Vald promenad** – kör, redigera, duplicera, byt namn eller ta bort promenaden.
3. **Redigera** – välj figur i den vänstra paletten och tryck på kartan för att placera.

Redigeringsvyn har en kompakt figurpalett till vänster och karta till höger. Under kartan finns ledtråd/platsnamn, diskret slider för fångstavstånd och en tydlig lista över alla utplacerade figurer. I listan kan figurer visas, flyttas, tas bort och ordnas om med upp/ned-knappar. Tryck på en utplacerad figur på kartan för att öppna en liten åtgärdspanel med **Flytta** och **Ta bort**. Flytt görs med tap-to-move, vilket fungerar bättre än drag-and-drop på mobilkartor.

Varje promenad kan köras i två lägen:

- **En i taget** – bara nästa figur visas. När den fångas dyker nästa upp.
- **Alla direkt** – alla planerade figurer visas på huvudkartan från start.

När en promenad startas skapas en ny lokal spelomgång med eget körnings-id. Det gör att samma planerade promenad kan spelas igen utan att bryta regeln om exakt en fångst per figur och omgång.

Det finns även sekundära verktyg för att auto-sprida figurer, hämta huvudkartans mitt, centrera på aktuell plats, visa alla utplacerade figurer och rensa promenaden. Dessa ligger bakom **Verktyg** för att inte störa det primära flödet.

Promenader sparas lokalt i IndexedDB. Själva figurerna ligger i `customSpawns` med `source: "scenario"`, och promenadlistan sparas i settings. Backup/replace tar med allt. Merge lägger även ihop importerade promenadinställningar utan att aktivera dem automatiskt.

Adminlösenordet är bara ett diskret lokalt UX-lås för barnet, inte kryptografisk säkerhet.

## Lokala figurpaket

Adminvyn har nu **Figurpaket**. Där kan du importera en lokal JSON-fil som lägger till egna figurer i katalogen utan backend eller byggsteg. Ett figurpaket kan innehålla:

- `id`
- `name`
- `rarity`
- `description`
- `imagePath` för bildfiler i projektet, till exempel `./assets/creatures/min-figur.png`
- eller `imageData` för små inbäddade `data:image/...`-bilder
- `color`, `accent` och `shadow` som fallback/färgtema

I adminvyn finns knappen **Hämta mall** som laddar ned en färdig JSON-mall. Samma mall finns också i `docs/creature-pack-template.json`. Lägg egna bildfiler i `assets/creatures/`. Transparent PNG eller WebP fungerar bäst.

Importerade figurer sparas i IndexedDB under settings och följer med i vanlig GeoCritter-backup. Samlingskort, detaljvy, fångstbekräftelse och PixiJS-fångstläge använder bilden när den finns och faller annars tillbaka till den ritade GeoCritter-formen.

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
assets/                    Ikoner och valfria lokala figurbilder
src/app.js                 Huvudflöde, karta, UI, samling
src/encounter.js           PixiJS-kamerafångst med fem träffar
src/db.js                  IndexedDB-hjälpare
src/backup.js              JSON-backup, delning, import och merge
src/config.js              Demofigurer och kartinställningar
src/creatures.js           Figurkatalog, figurpaket och fallbackfigurer
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
- v0.8: lokala figurpaket i adminvyn, JSON-mall, bildstöd i samling/detalj/fångstbekräftelse/PixiJS och backup-merge för importerade figurer.
- v0.9: mobiloptimerad adminombyggnad med promenadlista, promenaddetalj, 35/65-redigeringsvy, tap-to-place, tap-to-move, placeringslista, en-i-taget/alla-direkt och spelomgångs-id.
