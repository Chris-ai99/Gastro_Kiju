# Produktvision

## Zielbild

KiJu Gastro Order System ist ein Tablet-first Service-System für
Kinder- und Jugendarbeit mit Raumansicht, Tisch- und Sitzplatzwahl,
Küchen-/Barfluss, Abrechnung, Admin-Konfiguration und professioneller
Druckanbindung.

## Aktueller Implementierungsstand

- gemeinsame Domain- und Workflow-Logik für Service, Küche, Bar und QR-Bestellung
- PostgreSQL als zentrale operative Datenquelle auf dem VPS
- Next.js-Weboberfläche unter dem konfigurierten Base-Path, produktiv `/gastro`
- NestJS-API mit serialisierbaren Transaktionen und idempotenter Verarbeitung
- authentifizierter SSE-Livestream plus 30-Sekunden-Fallback-Polling
- gemeinsamer Betriebscode für die öffentlich erreichbare interne Oberfläche
- getrennte Druckwarteschlange und lokale Druckbrücke
- Legacy-JSON-Import ausschließlich für Wiederherstellungen und Migrationen

## Betriebsprinzip

Ein Gerät zeigt nur den bestätigten Serverstand als verbindlich an. Schnelle
Eingaben werden bis zur Serverantwort flüchtig in Reihenfolge verarbeitet. Bei
Verbindungsfehlern gibt es keine lokale Erfolgsbuchung und keine automatische
Wiederholung nach einem Browserneustart.

## Nächste fachliche Ausbaustufen

- differenzierte PostgreSQL-Backup- und Restore-Automation auf dem IONOS-VPS
- reale Split-Zahlungen nach Sitzplatz, Position oder Betrag
- vollständige Varianten-, Rabatt- und Fiskalprozesse
- getrennte Rollen- und Gerätesitzungen mit zentraler Administration
