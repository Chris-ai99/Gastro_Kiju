# Lokale KiJu-Druckbrücke

Die Druckbrücke läuft auf einem dauerhaft verfügbaren Windows-PC am Standort. Sie fragt die Online-Warteschlange über HTTPS ab und sendet ESC/POS-Druckdaten entweder direkt per TCP an den Netzwerkdrucker oder unverändert als RAW-Auftrag über den Windows-Druckerspooler. Der Drucker-Port wird nicht aus dem Internet erreichbar gemacht.

## Voraussetzungen

- Windows 10 oder neuer und Node.js 20 oder neuer
- PC und Netzwerkdrucker im selben erreichbaren Standortnetz
- Für TCP-Druck: Netzwerkdruck am Drucker, üblicherweise über TCP-Port 9100
- Für Windows-Spooler-Druck: Der Drucker ist in Windows installiert oder als Freigabe verbunden
- Ausgehendes HTTPS zum KiJu-Server; für TCP-Druck zusätzlich ausgehendes TCP zum Drucker
- Genau eine aktive Druckbrücke für diesen Drucker

Der Windows-Spooler muss den Drucker unter dem angemeldeten Benutzer erreichen können. Die Druckbrücke übergibt ESC/POS-Daten als RAW, damit der Windows-Treiber sie nicht als Grafik oder formatierten Text verändert.

## Server vorbereiten

1. Einen zufälligen Schlüssel mit mindestens 32 Byte erzeugen, zum Beispiel mit `node -p "require('node:crypto').randomBytes(32).toString('hex')"`.
2. Den Schlüssel als `KIJU_PRINT_BRIDGE_TOKEN` in der geschützten API-Umgebung des Servers hinterlegen. Den Wert nicht in Git eintragen.
3. Die Projektmigration ausrollen und API sowie Web-App mit der neuen Version starten.
4. Im Admin-Bereich den Druckweg **Lokale Druckbrücke am Standort** auswählen. Für Windows-Spooler-Druck den Druckernamen oder Freigabepfad eintragen. Das Feld für IP-Adresse und Port bleibt für den bisherigen TCP-Netzwerkdruck verfügbar.

Der bestehende Serverdruck bleibt der Standard. Ohne gesetzten Server-Schlüssel weist die API Verbindungen der lokalen Druckbrücke zurück.

## Windows-PC einrichten

1. Den installierten Namen und eine mögliche Freigabe in Windows PowerShell anzeigen:

   ```powershell
   Get-Printer | Format-Table Name, ShareName, PortName, PrinterStatus -AutoSize
   ```

   In der Admin-Oberfläche den exakten Wert aus `Name` verwenden. Für einen freigegebenen Drucker kann alternativ `\\COMPUTERNAME\FREIGABENAME` eingetragen werden.

2. Im Projekt `pnpm build:print-agent` ausführen, damit `apps/print-agent/dist/index.js` bereitliegt.
3. `apps/print-agent/scripts/install-windows.ps1` auf dem Druck-PC starten. Das Skript fragt nach der Serveradresse inklusive Basis-Pfad und dem Druckbrückenschlüssel:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\apps\print-agent\scripts\install-windows.ps1 -ServerUrl "https://<serveradresse>/<basispfad>"
   ```

   Die Einrichtung richtet eine geplante Aufgabe ein und startet die Brücke direkt. Sie läuft danach bei jeder Windows-Anmeldung des Benutzers wieder an.
4. Im Admin-Bereich warten, bis **Druck-PC online** und der Windows-Druckerspooler als erreichbar angezeigt werden. Danach einen Testdruck auslösen.

Beispiel für die Serveradresse: `https://kiju-bi.de/gastro`. Der Agent ergänzt den API-Pfad selbst.

## Drucksicherheit

Jeder Auftrag wird serverseitig einzeln reserviert und nach dem Druck bestätigt. Bricht die Verbindung während eines Drucks ab, läuft die Reservierung nach 90 Sekunden aus und der Auftrag wird als fehlgeschlagen markiert. Weil unklar sein kann, ob der Drucker den Bon bereits ausgegeben hat, wird der Auftrag nicht automatisch erneut gedruckt. Vor einem manuellen erneuten Senden zuerst am Drucker prüfen, ob der Bon schon herausgekommen ist.

Das lokale Protokoll liegt unter `%LOCALAPPDATA%\KiJu Gastro\Print Bridge\print-bridge.log`. Es enthält Verbindungs- und Druckstatus, aber nicht den Zugangsschlüssel.

## Anhalten und Fortsetzen

- `disable-windows.ps1` im Installationsordner `%LOCALAPPDATA%\KiJu Gastro\Print Bridge` deaktiviert den automatischen Start und bittet den Agenten, nach einem laufenden Vorgang geordnet anzuhalten.
- `enable-windows.ps1` im selben Ordner entfernt die Stop-Markierung und startet die Druckbrücke wieder.
- Beide Skripte behalten Konfiguration, Zugangsschlüssel und Protokoll. Es wird nichts gelöscht.
- Der Admin-Druckweg lässt sich jederzeit auf **Druck direkt vom Online-Server** zurückstellen. Das funktioniert nur, wenn der Online-Server den Drucker selbst erreichen kann; andernfalls bleiben neue Aufträge bis zum Fortsetzen der lokalen Druckbrücke in der Warteschlange.

Die Windows-Prüfung bestätigt, dass der Druckerspooler den Namen kennt; sie kann weder Papier- noch Deckelstatus des Druckers auslesen. Beim TCP-Druck bestätigt sie nur die Netzwerkverbindung am konfigurierten Port.
