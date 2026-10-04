# Lokale KiJu-Druckbrücke

Die Druckbrücke läuft auf einem dauerhaft verfügbaren Windows-PC am Standort. Sie fragt die Online-Warteschlange über HTTPS ab und sendet ESC/POS-Druckdaten im lokalen Netzwerk an den Bon-Drucker. Der Drucker-Port wird nicht aus dem Internet erreichbar gemacht.

## Voraussetzungen

- Windows 10 oder neuer und Node.js 20 oder neuer
- PC und Netzwerkdrucker im selben erreichbaren Standortnetz
- Netzwerkdruck am Drucker, üblicherweise über TCP-Port 9100
- Ausgehendes HTTPS zum KiJu-Server und ausgehendes TCP zum Drucker
- Genau eine aktive Druckbrücke für diesen Drucker

USB-Drucker werden von dieser Version nicht unterstützt. Die Windows-Druckbrücke ist für den im KiJu-System konfigurierten Netzwerkdrucker ausgelegt.

## Server vorbereiten

1. Einen zufälligen Schlüssel mit mindestens 32 Byte erzeugen, zum Beispiel mit `node -p "require('node:crypto').randomBytes(32).toString('hex')"`.
2. Den Schlüssel als `KIJU_PRINT_BRIDGE_TOKEN` in der geschützten API-Umgebung des Servers hinterlegen. Den Wert nicht in Git eintragen.
3. Die Projektmigration ausrollen und API sowie Web-App mit der neuen Version starten.
4. Im Admin-Bereich den Drucker zunächst mit seiner lokalen Drucker-IP und Port 9100 speichern. Den Druckweg erst auf **Lokale Druckbrücke am Standort** umstellen, wenn die Druckbrücke verbunden angezeigt wird.

Der bestehende Serverdruck bleibt der Standard. Ohne gesetzten Server-Schlüssel weist die API Verbindungen der lokalen Druckbrücke zurück.

## Windows-PC einrichten

1. Im Projekt `pnpm build:print-agent` ausführen, damit `apps/print-agent/dist/index.js` bereitliegt.
2. `apps/print-agent/scripts/install-windows.ps1` auf dem PC starten. Das Skript fragt nach der Serveradresse inklusive Basis-Pfad und dem Druckbrückenschlüssel.
3. Das Skript speichert die Zugangsdaten in einem nur für den aktuellen Windows-Benutzer, Administratoren und SYSTEM freigegebenen Ordner und richtet den automatischen Start nach der Windows-Anmeldung ein.
4. Im Admin-Bereich warten, bis **Druck-PC online** und anschließend die TCP-Verbindung zum Drucker als erreichbar angezeigt werden. Dann den Druckweg auf die lokale Druckbrücke umstellen und einen Testdruck auslösen.

Beispiel für die Serveradresse: `https://kiju-bi.de/gastro`. Der Agent ergänzt den API-Pfad selbst.

## Drucksicherheit

Jeder Auftrag wird serverseitig einzeln reserviert und nach dem Druck bestätigt. Bricht die Verbindung während eines Drucks ab, läuft die Reservierung nach 90 Sekunden aus und der Auftrag wird als fehlgeschlagen markiert. Weil unklar sein kann, ob der Drucker den Bon bereits ausgegeben hat, wird der Auftrag nicht automatisch erneut gedruckt. Vor einem manuellen erneuten Senden zuerst am Drucker prüfen, ob der Bon schon herausgekommen ist.

Das lokale Protokoll liegt unter `%LOCALAPPDATA%\KiJu Gastro\Print Bridge\print-bridge.log`. Es enthält Verbindungs- und Druckstatus, aber nicht den Zugangsschlüssel.

## Anhalten und Fortsetzen

- `disable-windows.ps1` im Installationsordner `%LOCALAPPDATA%\KiJu Gastro\Print Bridge` deaktiviert den automatischen Start und bittet den Agenten, nach einem laufenden Vorgang geordnet anzuhalten.
- `enable-windows.ps1` im selben Ordner entfernt die Stop-Markierung und startet die Druckbrücke wieder.
- Beide Skripte behalten Konfiguration, Zugangsschlüssel und Protokoll. Es wird nichts gelöscht.
- Der Admin-Druckweg lässt sich jederzeit auf **Druck direkt vom Online-Server** zurückstellen. Das funktioniert nur, wenn der Online-Server den Drucker selbst erreichen kann; andernfalls bleiben neue Aufträge bis zum Fortsetzen der lokalen Druckbrücke in der Warteschlange.

Die angezeigte Druckerprüfung bestätigt eine TCP-Verbindung am konfigurierten Port. Sie kann weder Papier- noch Deckelstatus des Druckers auslesen.
