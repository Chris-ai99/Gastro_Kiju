# Changelog

## 0.5.02-beta
- Datum: 2026-03-29
- Uhrzeit: 02:20:00 +02:00
- Typ: kleiner Fix
- Zusammenfassung:
  Das Rollenwechsel-Fenster ist oben rechts in den Arbeitsansichten wieder verfügbar.
- Änderungen:
  Wiederverwendbares Rollenwechsel-Popover für Service, Küche und Admin ergänzt.
  Rollenwechsel im Kellner-, Küchen- und Admin-Kopfbereich wieder direkt oben rechts verankert.
  Direkte Wechselziele auf aktive Konten und den Login zurückgeführt.

Dieses Projekt verwendet ein einfaches Beta-Schema mit Pflicht-Einträgen bei jeder Änderung.

## 0.5.01-beta
- Datum: 2026-03-28
- Uhrzeit: 03:01:49 +01:00
- Typ: kleiner Fix
- Zusammenfassung:
  Das Projekt ist jetzt technisch für ein Hosting unter `https://autosello.de/kiJu` vorbereitet.
- Änderungen:
  Konfigurierbaren Base-Path für die Web-App ergänzt und den Build auf einen Subpfad vorbereitet.
  Manifest und Start-URL auf den konfigurierten App-Pfad umgestellt.
  Deployment-Dokumentation für einen öffentlichen `/kiJu`-Pfad ohne AutoSello-Login ergänzt.

## 0.5.00-beta
- Datum: 2026-03-28
- Uhrzeit: 02:56:21 +01:00
- Typ: großer Fix
- Zusammenfassung:
  Die allgemeine Oberfläche wurde mit Ausklapp-Bereichen und einem zweiten Schwarz-Theme deutlich übersichtlicher gemacht.
- Änderungen:
  Globalen Theme-Schalter für Hell und Schwarz ergänzt und das dunkle Theme auf schwarze, kontrastreiche Flächen umgestellt.
  Wiederverwendbare Ausklapp-Bereiche eingeführt und in Login, Service, Küche und Admin integriert.
  Karten, Buttons, Eingaben und Raumansicht für beide Themes optisch vereinheitlicht und besser strukturiert.

## 0.4.01-beta
- Datum: 2026-03-28
- Uhrzeit: 02:49:32 +01:00
- Typ: kleiner Fix
- Zusammenfassung:
  Mitarbeiter und Rollen lassen sich im Admin-Bereich jetzt vollständig über klare Unterkategorien bearbeiten.
- Änderungen:
  Mitarbeiterkarten in Profil, Zugang sowie Rolle und Status gegliedert.
  Benutzername, Name, Passwort, PIN, Rolle und Aktiv-Status als editierbare Felder mit Speichern-Button ergänzt.
  Validierung für Benutzernamen, Pflichtfelder und den letzten aktiven Admin beim Speichern abgesichert.

## 0.4.00-beta
- Datum: 2026-03-28
- Uhrzeit: 02:45:16 +01:00
- Typ: großer Fix
- Zusammenfassung:
  Admin-Konsole, Kellner-Bearbeitung und Raumansicht wurden deutlich übersichtlicher und näher an den echten Haus-Amos-Ablauf gebracht.
- Änderungen:
  Umsatzkarte im Kellnerbereich auf Admin beschränkt und stattdessen eine klarere Service-Metrik für normale Kellner eingebaut.
  Erfasste Leistungen im Kellner-Flow bearbeitbar gemacht: Sitzplatz wechseln, Menge anpassen, Notiz pflegen und Position löschen.
  Raumansicht auf die fotografierte Tischanordnung mit sieben Tischen und sechs aktuell aktiven Bereichen umgestellt.
  Admin-Menü in übersichtliche Bereiche für Produkte, Mitarbeiter, Tische, Abschlüsse und Reset mit Anlegen- und Löschfunktionen neu geordnet.

## 0.3.02-beta
- Datum: 2026-03-28
- Uhrzeit: 02:06:52 +01:00
- Typ: kleiner Fix
- Zusammenfassung:
  Reset auf Standard liefert jetzt wirklich einen leeren Betriebszustand mit `0` bei Statistik, Leistungen und Tischbelegungen.
- Änderungen:
  Standard-Reset auf leere Sessions, leere Hinweise und Tageswerte `0` umgestellt.
  Admin-Hinweistext präzisiert, damit klar ist, dass operative Daten vollständig geleert werden.

## 0.3.01-beta
- Datum: 2026-03-28
- Uhrzeit: 01:48:00 +01:00
- Typ: kleiner Fix
- Zusammenfassung:
  Browser-Kompatibilität für Admin-Löschung, Hinweise und neue Demo-Vorgänge auf Geräten ohne `crypto.randomUUID()` abgesichert.
- Änderungen:
  Robuste Fallback-ID-Erzeugung für neue Sessions, Hinweise, Positionen und Zahlungen im Web-Client ergänzt.
  Laufzeitfehler bei Tischlöschung und anderen Aktionen auf älteren Browsern oder Tablets behoben.

## 0.3.00-beta
- Datum: 2026-03-28
- Uhrzeit: 01:40:59 +01:00
- Typ: großer Fix
- Zusammenfassung:
  Admin-Konsole um sicheren Komplett-Reset und gezieltes Löschen einzelner Tische mit allen Leistungen erweitert.
- Änderungen:
  Gefahrenbereich in der Admin-Ansicht mit dreifacher Sicherheitsabfrage für den kompletten Reset auf Standarddaten eingebaut.
  Neue Löschfunktion für einzelne Tische inklusive zugehöriger Bestellungen, Hinweise und Abschlussdaten hinzugefügt.
  Kellner-Dashboard gegen fehlende oder komplett gelöschte Tische abgesichert, damit die Oberfläche stabil weiterläuft.

## 0.2.01-beta
- Datum: 2026-03-28
- Uhrzeit: 01:18:23 +01:00
- Typ: kleiner Fix
- Zusammenfassung:
  Login-Weiterleitung im Entwicklungsmodus über die lokale Netzwerk-Adresse repariert und Versionsregel fortlaufend erweitert.
- Änderungen:
  Next.js-Entwicklungsserver für lokale Netzwerk-Adressen freigegeben, damit die App über Tablet- und Hausnetz-IP sauber hydriert.
  Ursache des Reload-Verhaltens beim Login behoben, weil geblockte Dev-Ressourcen nicht mehr den Client-Redirect verhindern.
  Changelog-Regel auf fortlaufende Beta-Versionen wie 0.2.01-beta und 0.3.00-beta konkretisiert.

## 0.2.00-beta
- Datum: 2026-03-28
- Uhrzeit: 00:58:13 +01:00
- Typ: großer Fix
- Zusammenfassung:
  Login deutlich vereinfacht, direkte Rollenstarts repariert und verbindliche Changelog-Regel eingeführt.
- Änderungen:
  Service-, Küchen- und Admin-Einstieg auf der Login-Seite als direkte Schnellstarts umgesetzt.
  Automatische Weiterleitung eingebaut, wenn bereits eine aktive Rolle im lokalen Zustand vorhanden ist.
  Nicht funktionierende Vorschau-Links vom Login entfernt und den Einstieg auf funktionierende Aktionen reduziert.
  Rollenfremde Navigationslinks in den Arbeitsansichten durch sauberen Rollenwechsel ersetzt.
  Projektweites Changelog mit Regelwerk und Versionsschema angelegt.

## 0.1.01-beta
- Datum: 2026-03-28
- Uhrzeit: 00:47:00 +01:00
- Typ: kleiner Fix
- Zusammenfassung:
  Sichtbare deutsche UI-Texte auf echte Umlaute und ß umgestellt.
- Änderungen:
  Begriffe wie Küche, Getränke, Sitzplätze, schließen und prüfen in sichtbaren UI-Texten korrigiert.
  Deutscher UI-Text-Skill für das KiJu-Projekt angelegt, damit weitere Textänderungen konsistent bleiben.

## 0.1.00-beta
- Datum: 2026-03-27
- Uhrzeit: 23:59:00 +01:00
- Typ: initiale Beta
- Zusammenfassung:
  Erstes professionelles Monorepo mit Web-App, API-Skelett, Domain-Logik, Demo-Daten und Dokumentation erstellt.
- Änderungen:
  Next.js-Web-App für Login, Kellner, Küche und Admin aufgebaut.
  NestJS-API-Skelett, Print-Bridge, Domain-Pakete, Theme-Konfiguration und erste Demo-Prozesse angelegt.
  Produkt- und Compliance-Dokumentation sowie PostgreSQL-Startpunkt ergänzt.
