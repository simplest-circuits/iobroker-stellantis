# ioBroker.stellantis

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/iobroker-community-adapters/ioBroker.stellantis)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> **ioBroker Adapter für Stellantis-Fahrzeuge** (MyPeugeot · MyCitroën · MyDS · MyOpel · MyVauxhall)

Dieser Adapter ersetzt den nicht mehr gepflegten `ioBroker.psa`-Adapter und unterstützt den **neuen OAuth2-Authentifizierungsflow**, den Stellantis seit Januar 2024 erfordert.

---

## Unterstützte Fahrzeuge & Funktionen

| Feature | EV / Hybrid | Verbrenner |
|---|---|---|
| Fahrzeugstatus (Türen, Akku, km) | ✅ | ✅ |
| GPS-Position | ✅ | ✅ |
| Weckbefehl (WakeUp) | ✅ | ✅ |
| Türverriegeln / Öffnen | ✅ | ✅ |
| Vorkonditionierung (A/C) | ✅ | ✅ |
| Licht blinken | ✅ | ✅ |
| Hupe | ✅ | ✅ |
| Laden starten/stoppen | ✅ | – |
| Ladelimit setzen | ✅ | – |

---

## Installation

### Manuell (bis zur Aufnahme in das ioBroker-Repository)

```bash
# Im ioBroker-Verzeichnis:
cd /opt/iobroker
npm install /pfad/zu/iobroker.stellantis

# Alternativ direkt von GitHub (sobald veröffentlicht):
npm install iobroker.stellantis
iobroker add stellantis
```

### Installation auf Remote-Host (`--host`)

Wenn dein ioBroker auf Linux läuft und du den Befehl von Windows startest, darfst du **keinen Windows-Pfad** wie `C:\...zip` an `iobroker url ... --host` übergeben.  
Der Ziel-Host versucht sonst genau diesen String als lokalen Pfad zu öffnen (daher `ENOENT`).

So funktioniert es zuverlässig:

1. Paket bauen:
```bash
npm pack
```
2. Datei `iobroker.stellantis-0.1.0.tgz` auf den ioBroker-Host kopieren (z.B. nach `/opt/iobroker`).
3. Auf dem ioBroker-Host installieren:
```bash
cd /opt/iobroker
npm install ./iobroker.stellantis-0.1.0.tgz
iobroker add stellantis
```

Alternativ: eine echte HTTP-URL verwenden, die vom Host erreichbar ist.

Dann im ioBroker-Admin unter **Instanzen → Stellantis → ⚙️ Einstellungen** konfigurieren.

---

## Einrichtung (OAuth2-Flow)

Stellantis erfordert seit Januar 2024 eine **Browser-basierte Anmeldung** (OAuth2 + PKCE).  
Der alte Username/Passwort-Login per API funktioniert nicht mehr.

### Schritt-für-Schritt

1. **Adapter installieren und öffnen**
2. In den **Adaptereinstellungen** auswählen:
   - **Brand** (z.B. MyOpel)
   - **Ländercode** (z.B. `de`)
   - Einstellungen **speichern**
3. Auf **„Auth-URL erzeugen"** klicken
4. Die angezeigte URL **im Browser öffnen** (PC empfohlen, kein Mobilgerät)
5. Mit dem Stellantis-Account anmelden und Zugriff bestätigen
6. Nach dem Login leitet der Browser auf eine nicht-ladbare URL um:  
   `mymap://oauth2redirect/de?code=**DEIN_CODE**&state=...`
7. Den Wert des **`code=`-Parameters** kopieren  
   *(Im Browser: F12 → Netzwerk → letzter Request, oder direkt aus der Adressleiste)*
8. Den Code in das Admin-Feld **„Authorization Code"** einfügen und **„Verbinden"** klicken

Nach erfolgreicher Verbindung werden die Fahrzeugdaten sofort geladen.

### Hilfstools (optional)

Wenn du den Code nicht manuell aus der URL extrahieren möchtest:

- **[stellantis-oauth-helper](https://github.com/benbox69/stellantis-oauth-helper)** – Python-GUI, erledigt den Browser-Login automatisch
- **[stelloauth](https://github.com/tamcore/stelloauth)** – Go-Tool mit Docker-Support

---

## Datenpunkte

Nach erfolgreicher Verbindung werden pro Fahrzeug (VIN) folgende States erstellt:

```
stellantis.0
└── <VIN>
    ├── info.vin
    ├── info.brand
    ├── info.model
    ├── status.lastUpdate
    ├── status.ignition
    ├── status.isRunning
    ├── mileage.total
    ├── battery.level          (%)
    ├── battery.autonomy       (km)
    ├── battery.charging       (bool)
    ├── battery.chargingStatus
    ├── battery.plugged
    ├── battery.chargeLimit
    ├── battery.remainingTime  (min)
    ├── doors.allLocked
    ├── doors.<tür>            (z.B. front_left)
    ├── location.latitude
    ├── location.longitude
    ├── location.heading
    ├── preconditioning.active
    └── commands
        ├── wakeUp             (Button)
        ├── doorLock           (true=sperren, false=öffnen)
        ├── startPreconditioning
        ├── stopPreconditioning
        ├── startCharging
        ├── stopCharging
        ├── chargeLimit        (0–100 %)
        ├── flashLights
        └── honk
```

---

## Konfigurationsoptionen

| Parameter | Beschreibung | Standard |
|---|---|---|
| Brand | Stellantis-App (MyOpel, MyPeugeot…) | – |
| Ländercode | ISO-Ländercode (de, fr, gb…) | `de` |
| Abfrageintervall | Minuten zwischen Statusabfragen | `10` |
| Vorkonditionierungstemperatur | Zieltemperatur in °C | `21` |

---

## Häufige Probleme

### „Auth-URL öffnet eine leere Seite" / „Weißer Bildschirm"
Stellantis hat gelegentlich Backend-Probleme. Warte einige Minuten und versuche es erneut.

### Code kopieren funktioniert nicht (Safari/iOS)
Nutze einen Desktop-Browser (Chrome oder Firefox). Die Weiterleitungs-URL (`mymap://...`) ist in der Konsole unter **Netzwerk → letzte Anfrage** sichtbar.

### „Token refresh failed"
Der Refresh-Token ist abgelaufen (Stellantis begrenzt die Gültigkeitsdauer). Klicke auf **„Tokens löschen"** und führe den OAuth2-Flow erneut durch.

### Client-Credentials ändern sich
Stellantis aktualisiert gelegentlich die App-Credentials. Falls die Anmeldung plötzlich fehlschlägt, prüfe die Datei `lib/brands.js` und vergleiche mit aktuellen Werten aus dem [homeassistant-stellantis-vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles) Repository (`custom_components/stellantis_vehicles/configs.json`).

---

## Danke an

- **flobz/psa_car_controller** – Pionierarbeit beim Reverse Engineering der PSA API
- **andreadegiovine/homeassistant-stellantis-vehicles** – Aktiv gepflegte HA-Integration
- **evcc** – PKCE-Flow Dokumentation
- **TA2k/ioBroker.psa** – Ursprünglicher ioBroker PSA Adapter

---

## Lizenz

MIT
