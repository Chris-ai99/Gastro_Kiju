# Changelog

## 0.10.09-beta
- Datum: 2026-06-12
- Uhrzeit: 22:09 +02:00
- Typ: Verbesserung
- Zusammenfassung:
  Tellerbons und Küchenansicht zeigen Bedienung und Wartezeit jetzt deutlich und eskalieren lange Wartezeiten farblich.
- Änderungen:
  Der Abholbon enthält jetzt ebenfalls den Namen der Bedienung.
  Der Tellerbon druckt Tisch, Bedienung und Speise in großer Schrift sowie die verstrichene Wartezeit seit dem Absenden.
  Der Hinweis „Zum Teller kleben“ wurde vom Tellerbon entfernt.
  Die Küchenansicht zeigt auf jedem aktiven Bon eine sekundengenaue Wartezeit.
  Ab 15 Minuten wird der Bon gelb, ab 20 Minuten rot und ab 25 Minuten rot blinkend dargestellt.
  Beide Netzwerkdruckpfade unterstützen echte ESC/POS-Schriftgrößen; die Bonvorschau bildet diese Größen ebenfalls ab.
  Automatisierte Tests prüfen Bedienung, Wartezeit, entfernten Klebehinweis und die ESC/POS-Größenbefehle.

## 0.10.08-beta
- Datum: 2026-06-12
- Uhrzeit: 22:04 +02:00
- Typ: Fix
- Zusammenfassung:
  Speisen erzeugen beim Absenden an die Küche keinen Druckauftrag mehr.
- Änderungen:
  Der versehentlich wieder aktive Küchenbon-Druck beim Versand einer Bestellung wurde entfernt.
  Das Absenden überträgt Speisen weiterhin vollständig an die Küchenansicht, ohne Papier auszugeben.
  Ein Tellerbon wird ausschließlich gedruckt, wenn eine einzelne Portion in der Küche als fertig abgehakt wird.
  Der bestehende Druckpfad `kitchen-label` beim Statuswechsel auf „Fertig“ bleibt unverändert erhalten.

## 0.10.07-beta
- Datum: 2026-06-12
- Uhrzeit: 22:01 +02:00
- Typ: Verbesserung
- Zusammenfassung:
  Extras fallen auf Küchentickets jetzt durch eine eigene orange-rote Darstellung sofort auf.
- Änderungen:
  Extra-Zutaten werden als deutliches Badge mit der Kennzeichnung „Extra“ angezeigt.
  Orangefarbener Hintergrund, roter Text und kräftige Umrandung trennen Extras klar von Produkt und Sitzplatz.
  Der Dunkelmodus verwendet eine entsprechend kontrastreiche orange-rote Variante.
  Normale Bestellhinweise behalten ihre separate grüne Darstellung.

## 0.10.06-beta
- Datum: 2026-06-12
- Uhrzeit: 21:57 +02:00
- Typ: Verbesserung
- Zusammenfassung:
  Küchenansicht und Küchenbon zeigen den Namen der bestellenden Person jetzt eindeutig an.
- Änderungen:
  Jede Ticketkarte hebt die sendende Person gut sichtbar mit „Bestellt von“ hervor.
  Erstbestellungen und Nachbestellungen verwenden weiterhin den jeweils beim Senden gespeicherten Namen.
  Der Küchenbon druckt den Namen eindeutig in der Zeile `BESTELLT: Name`.
  Ein automatisierter Test bestätigt, dass der Bestellername auf dem Küchenbon enthalten ist.

## 0.10.05-beta
- Datum: 2026-06-12
- Uhrzeit: 21:49 +02:00
- Typ: Fix
- Zusammenfassung:
  Netzwerkdrucker geben Bons jetzt um 180° gedreht aus.
- Änderungen:
  Der ESC/POS-Druck aktiviert vor jedem Dokument den vom Epson TM-T70II unterstützten Kopfübermodus.
  Nach dem Dokument wird die Drehung vor Papiervorschub und Schnitt wieder deaktiviert.
  Der bisherige Web-Druckpfad und die neue API verwenden dieselbe gedrehte Ausgabe.
  Ein automatisierter Drucktest prüft die Befehle zum Aktivieren und Zurücksetzen der Drehung.

## 0.10.04-beta
- Datum: 2026-06-10
- Uhrzeit: 22:20 +02:00
- Typ: Sicherheit
- Zusammenfassung:
  Kritische Vorgänge werden Ende zu Ende bestätigt und dauerhaft in PostgreSQL gespeichert.
- Änderungen:
  Die NestJS-API verarbeitet typisierte Operationen idempotent in serialisierbaren Datenbanktransaktionen.
  Zustand, Transaktionsprotokoll, Rückgängig-Punkte und Druckaufträge werden atomar gespeichert.
  Eine IndexedDB-Warteschlange hält offene Vorgänge über Neustarts hinweg und wiederholt temporäre Fehler automatisch.
  Versand, Zahlung, Storno, Abschluss und Druckdialoge melden Erfolg erst nach der passenden Serverbestätigung.
  Eine zentrale grün-gelb-rote Anzeige zeigt bestätigte, wartende und fehlgeschlagene Übertragungen mit erneuter Sendemöglichkeit.
  Das Legacy-Importskript sichert vorhandene JSON-Dateien und übernimmt sie ausschließlich in eine leere Datenbank.
  PostgreSQL-Migrationen, separater API-Dienst und Produktivkonfiguration sind vorbereitet; ein Deployment wurde nicht ausgeführt.

## 0.10.03-beta
- Datum: 2026-06-10
- Uhrzeit: 21:13 +02:00
- Typ: Verbesserung
- Zusammenfassung:
  Brot und Dessert werden direkt im Service gebucht und benötigen keine Bestätigung durch Küche oder Bar.
- Änderungen:
  Pizza Brot mit Aioli sowie alle vorhandenen Dessertartikel sind als Selbstentnahme durch den Service hinterlegt.
  Artikel mit dem Produktionsziel Service werden von „Alles senden“, Küchenbons, Bar-Bons und Wartezeiten ausgeschlossen.
  Die Bestellübersicht kennzeichnet diese Positionen eindeutig als „Im Service gebucht“.

## 0.10.02-beta
- Datum: 2026-06-10
- Uhrzeit: 21:11 +02:00
- Typ: Inhalt
- Zusammenfassung:
  Die Pasta-Auswahl umfasst jetzt vier direkt bestellbare Varianten mit Penne oder Tagliatelle.
- Änderungen:
  Penne mit grüner Pesto und Penne mit Tomatensauce ersetzen die beiden bisherigen allgemeinen Nudelgerichte.
  Tagliatelle mit grüner Pesto und Tagliatelle mit Tomatensauce wurden neu ergänzt.
  Alle vier Varianten werden im Service weiterhin in der Gruppe Pasta angezeigt.
  Bereits gespeicherte Stammdaten werden einmalig aktualisiert, ohne bestehende Produkt-IDs oder Bestellungen zu verändern.

## 0.10.01-beta
- Datum: 2026-06-10
- Uhrzeit: 20:29 +02:00
- Typ: Verbesserung
- Zusammenfassung:
  Der Service erhält eine zentrale Bestellübersicht mit gemeinsamer Versandfunktion für alle offenen Positionen eines Tisches.
- Änderungen:
  Getränke, Vorspeisen, Hauptspeisen und Nachtische werden mit Anzahl, Zwischensumme und Versandstatus fest gruppiert angezeigt.
  Einzelne Positionen zeigen Menge, Produkt, Tisch oder Sitzplatz, Preis, Extras und Notizen.
  Die Bearbeitung öffnet den vorhandenen Kategorieabschluss und führt anschließend zurück zur Bestellübersicht.
  „Alles senden“ bestätigt die offenen Mengen je Gang und sendet Getränke an die Bar sowie Speisen in getrennten Gang-Batches an die Küche.
  Wartezeiten bleiben wirksam; bereits gesendete und stornierte Positionen werden nicht erneut versendet.
  Gesamtbetrag, Gesamtanzahl und offene Positionen sind auf Desktop und Mobilgeräten kompakt sichtbar.

## 0.10.00-beta
- Datum: 2026-06-10
- Uhrzeit: 19:10:31 +02:00
- Typ: Sicherheit
- Zusammenfassung:
  Betriebsdaten werden atomar gespeichert, automatisch gesichert und im Produktivbetrieb außerhalb des Programmordners abgelegt.
- Änderungen:
  Bestellungen und Einstellungen erhalten bis zu 50 rotierende serverseitige Sicherungen.
  Beschädigte oder gelöschte Zustandsdateien werden automatisch aus der jüngsten gültigen Sicherung wiederhergestellt.
  Sind Hauptdatei und Sicherungen ungültig, wird kein leerer Stand mehr über die vorhandenen Daten geschrieben.
  Bei fehlenden Schreibrechten oder vollem Datenträger meldet der Server einen Speicherfehler und übernimmt keinen ungesicherten Stand.
  Das Deployment migriert Live-Daten nach `/var/lib/gastroweb`, damit sie eine Neuinstallation des Programmordners überstehen.
  Druckkonfiguration und Druckwarteschlange verwenden ebenfalls absturzsichere Schreibvorgänge.
  Die Betriebs- und Wiederherstellungsanleitung steht in `docs/product/datensicherung.md`.

## 0.9.11-beta
- Datum: 2026-05-14
- Uhrzeit: laufend
- Typ: Fix
- Zusammenfassung:
  Das Extra-Zutaten-Popup wird jetzt vor der geöffneten Bestellansicht angezeigt.
- Änderungen:
  Das Extra-Zutaten-Popup nutzt eine eigene obere Ebene und wird nicht mehr von der Bestellansicht überlagert.
  Pizza-Extras können dadurch direkt im geöffneten Bestellfenster ausgewählt oder gespeichert werden.

## 0.9.10-beta
- Datum: 2026-05-14
- Uhrzeit: laufend
- Typ: Fix
- Zusammenfassung:
  Pizza-Positionen zeigen das Extra-Zutaten-Popup automatisch und leere Kategorien bleiben neutral.
- Änderungen:
  Pizza-Produkte aktivieren den Button Extra Zutat jetzt automatisch, auch wenn noch keine Extra-Zutaten angelegt sind.
  Nicht gesendete Gänge werden nur rot markiert, wenn dort bereits Positionen erfasst wurden.
  Leere Kategorien ohne ausgewählte Artikel bleiben in der Bestellübersicht neutral.

## 0.9.09-beta
- Datum: 2026-05-14
- Uhrzeit: laufend
- Typ: Verbesserung
- Zusammenfassung:
  Nicht gesendete Küchenartikel werden im Service rot und mit eindeutigem Hinweis angezeigt.
- Änderungen:
  Nicht gesendete Küchengänge heißen jetzt Noch nicht an Küche gesendet und erscheinen rot.
  Der missverständliche Status Frei in der Küche wurde durch An Küche gesendet ersetzt.
  Die erklärenden Status-Texte unterscheiden klar zwischen fehlendem Küchenversand und gesendeten, noch offenen Küchenartikeln.

## 0.9.08-beta
- Datum: 2026-05-14
- Uhrzeit: laufend
- Typ: Verbesserung
- Zusammenfassung:
  Schichtübergaben können im Service-Menü zurückgenommen werden und der Tagesreset räumt Mitarbeiterkonten auf.
- Änderungen:
  Das Service-Menü bietet jetzt eine Aktion, um die letzte Schichtübergabe rückgängig zu machen.
  Übergabe, Freigabe und Kolleginnen/Kollegen hinzufügen legen jeweils einen Rückgängig-Punkt an.
  Der Tagesreset entfernt Mitarbeiterkonten außer Admins und bereinigt offene Service-Zuordnungen.

## 0.9.07-beta
- Datum: 2026-05-14
- Uhrzeit: laufend
- Typ: Verbesserung
- Zusammenfassung:
  Die Schichtübergabe ist aus der oberen Service-Übersicht verschwunden und liegt jetzt im Menü.
- Änderungen:
  Die Übersicht zeigt die Schichtübergabe nicht mehr als eigene Karte über dem Raumplan.
  Übergabe, Freigabe und Kolleginnen/Kollegen hinzufügen sind im Service-Menü gebündelt.
  Der aktuelle Übergabestatus bleibt im Menü sichtbar.

## 0.9.06-beta
- Datum: 2026-05-14
- Uhrzeit: laufend
- Typ: Fix
- Zusammenfassung:
  Notizen an Pizza- und Bestellpositionen behalten Leerzeichen zwischen Wörtern beim Tippen und Speichern.
- Änderungen:
  Mehrteilige Hinweise wie extra Zwiebeln oder ohne Zwiebeln bleiben im Notizfeld vollständig erhalten.
  Ein gerade eingegebenes Leerzeichen am Ende wird nicht mehr sofort entfernt, damit das nächste Wort normal geschrieben werden kann.
  Reine Leerzeichen ohne Text werden weiterhin nicht als sichtbare Notiz gespeichert.

## 0.9.01-beta
- Datum: 2026-05-10
- Uhrzeit: 22:32:47 +02:00
- Typ: Feature
- Zusammenfassung:
  Der Service-Bestellfluss führt nach jeder Hauptkategorie über Unterkategorien in eine reine Artikelauswahl und danach in eine Abschlussansicht.
- Änderungen:
  Getränke, Vorspeise, Hauptspeise und Nachtisch öffnen zuerst passende Untergruppen wie Alkoholfrei, Bier/Radler, Pizza, Pasta, Dessert oder Sonstiges.
  In der Artikelauswahl werden keine erfassten Positionen und keine Senden-, Warten- oder Überspringen-Aktionen mehr angezeigt.
  Die Abschlussansicht trennt neu ausgewählte, noch nicht gesendete und bereits gesendete Positionen; nur ungesendete Positionen bleiben bearbeitbar.
  Die neuen Service-Flächen sind für Handy und Tablet auf vertikales Touch-Scrollen ausgelegt.

## 0.9.00-beta
- Datum: 2026-05-10
- Uhrzeit: 22:08:35 +02:00
- Typ: Feature
- Zusammenfassung:
  Der Service-Bestellfluss startet nach „Bestellen“ mit vier Kategorien und öffnet die Artikelauswahl je Gang in einem eigenen Popup.
- Änderungen:
  Die obere Statistikleiste im Service-Wizard wurde entfernt und sichtbare Tischwechsel-Texte wurden durch neutrale Navigation ersetzt.
  Getränke, Vorspeise, Hauptspeise und Nachtisch öffnen jeweils ein eigenes Popup mit Mehrfachauswahl und den vorhandenen Positionsaktionen.
  Scrollbare Service-Popups und Listen sind für Handy und Tablet auf vertikales Touch-Scrollen ausgelegt.

## 0.8.21-beta
- Datum: 2026-05-07
- Uhrzeit: 22:35:40 +02:00
- Typ: Feature
- Zusammenfassung:
  In der Service-Tischübersicht kann jetzt ein Abholbon als normaler Tisch erstellt und gedruckt werden.
- Änderungen:
  Der neue Button Abholbon erstellen legt fortlaufende Abholtische wie Zum Abholen 1 an.
  Der Abholtisch wird direkt geöffnet und kann wie jeder andere Tisch bestellt und abgerechnet werden.
  Ein kurzer Abholbon mit Nummer, Tisch-/Bon-Name und Uhrzeit wird als eigener Druckjob gesendet.

## 0.8.20-beta
- Datum: 2026-05-07
- Uhrzeit: 21:44:20 +02:00
- Typ: Fix
- Zusammenfassung:
  Pizza- und Produktnamen werden auf Handybreite vollständig angezeigt.
- Änderungen:
  Produktkarten im Service dürfen Namen auf kleinen Bildschirmen mehrzeilig umbrechen.
  Gebuchte Positionen und Gruppenzuordnungen schneiden lange Produktnamen mobil nicht mehr ab.
  Admin-Buchungszeilen zeigen lange Pizza-Namen auf Handybreite vollständig statt gekürzt.

## 0.8.19-beta
- Datum: 2026-05-07
- Uhrzeit: 21:02:41 +02:00
- Typ: Feature
- Zusammenfassung:
  Im Admin-Cockpit kann jetzt eine Statistik zu Buchungen und Abrechnungen gedruckt werden.
- Änderungen:
  Der neue Statistikdruck läuft über die bestehende Druckwarteschlange.
  Der Ausdruck zeigt Zahlarten, Produktsummen, Buchungen je Tisch, Abrechnungen, Stornos und offene Beträge.
  Die Druckerübersicht kennzeichnet diese Jobs als `Statistik`.

## 0.8.18-beta
- Datum: 2026-05-07
- Uhrzeit: 20:46:51 +02:00
- Typ: Verbesserung
- Zusammenfassung:
  Teller-Bons aus der Küche nennen das Gericht jetzt noch eindeutiger direkt auf dem Klebebon.
- Änderungen:
  Der Teller-Bon wird weiterhin beim Fertig-Abhaken einer einzelnen Küchenportion erzeugt.
  Die Druckvorlage hebt das Gericht mit einer eigenen `GERICHT:`-Zeile hervor.
  Tisch, Platz, Uhrzeit, Portion und Nachbestellung bleiben auf dem Teller-Bon sichtbar.

## 0.8.17-beta
- Datum: 2026-05-07
- Uhrzeit: 20:36:24 +02:00
- Typ: Fix
- Zusammenfassung:
  Die Bon-Übersicht bleibt in der Service-Abrechnung dauerhaft sichtbar, auch wenn ein Teil-Bon geprüft wird.
- Änderungen:
  Die feste Bon-Übersicht wird getrennt von der optionalen Bon-Vorschau gerendert.
  Teil-Bons erscheinen zusätzlich zur Übersicht, statt die Gesamt- oder Tischübersicht zu ersetzen.
  Die Checkout-Bonflächen behalten auf kleinen Bildschirmen eine klare Stapelung.

## 0.8.16-beta
- Datum: 2026-05-07
- Uhrzeit: 20:27:49 +02:00
- Typ: Fix
- Zusammenfassung:
  Die Küchenansicht lädt lokal wieder stabil und zeigt Tisch- sowie Platztexte klarer an.
- Änderungen:
  Das Theme-Initialisierungsskript wird Next-kompatibel über `next/script` eingebunden.
  Küchenbons zeigen Ziele jetzt als `Ganzer Tisch` oder `Platz P1`, statt unklarer Kurztexte.
  Tisch-, Status- und Produkttexte in der Küchenwand sind robuster gegen lange Beschriftungen und Umbrüche.

## 0.8.15-beta
- Datum: 2026-05-04
- Uhrzeit: laufend
- Typ: Fix
- Zusammenfassung:
  Gericht-Bons werden nicht mehr beim Senden an die Küche gedruckt, sondern erst beim Fertig-Abhaken der einzelnen Portion.
- Änderungen:
  Automatische Küchenbon-Druckjobs beim Senden an die Küche wurden entfernt.
  Tellerbons bleiben an das einzelne Abhaken einer Portion gebunden.
  Die Druckbreite wurde kompakter eingestellt und zentrierte Bon-Zeilen werden nicht mehr mit zusätzlichen Leerzeichen verschoben.

## 0.8.14-beta
- Datum: 2026-05-04
- Uhrzeit: laufend
- Typ: Feature
- Zusammenfassung:
  Die Abrechnung zeigt die Bon-Übersicht dauerhaft und fertige Einzelportionen erzeugen Tellerbons für die Küche.
- Änderungen:
  Die Bon-Übersicht bleibt im Abrechnungsbereich sichtbar, auch wenn Positionen gesplittet oder bereits bezahlt wurden.
  Einzelne fertig abgehakte Küchenportionen legen automatisch einen Tellerbon-Druckjob an.
  Der neue Tellerbon enthält Gericht, Tisch, Platz, Portion, Nachbestellung und Uhrzeit.

## 0.8.13-beta
- Datum: 2026-05-04
- Uhrzeit: 15:59:32 +02:00
- Typ: Änderung
- Zusammenfassung:
  Der Epson TM-T70II ist als aktiver LAN-Bondrucker unter 192.168.178.102 eingerichtet.
- Änderungen:
  Die lokale Druckerkonfiguration nutzt jetzt die erreichbare Drucker-IP 192.168.178.102.
  Der Netzwerkdruck bleibt auf dem ESC/POS-Port 9100 aktiviert.
  Die Druckwarteschlange zeigt Tellerbon-Jobs jetzt mit eigenem deutschen Label an.
  Vorhandene fehlgeschlagene Druckjobs bleiben unverändert, damit keine alten Bons automatisch nachgedruckt werden.

## 0.8.12-beta
- Datum: 2026-05-04
- Uhrzeit: laufend
- Typ: Fix
- Zusammenfassung:
  Fertige Getränke und Speisen werden nur noch dem Kellner angezeigt, der die Bestellung aufgenommen hat.
- Änderungen:
  Neue Positionen speichern den aufnehmenden Service-Mitarbeiter für spätere Abholmeldungen.
  Fertigmeldungen aus Küche und Bar erhalten die zuständigen Service-Mitarbeiter als Zielkonto.
  Die Hinweisfilter berücksichtigen gezielte Nutzerzustellung zusätzlich zur Rollenfreigabe.
  Andere Kellner bekommen keine fremden Abholmeldungen mehr in ihrem Menü.

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
