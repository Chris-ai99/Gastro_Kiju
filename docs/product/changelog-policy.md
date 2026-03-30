# Changelog-Regel

## Pflicht

- Jede inhaltliche Änderung am Projekt braucht vor dem Abschluss einen neuen Eintrag in `CHANGELOG.md`.
- Der Eintrag muss immer Datum, Uhrzeit, Version, Typ und eine kurze Zusammenfassung enthalten.
- Auch rückwirkend ergänzte Einträge müssen als historische Einträge nachvollziehbar bleiben.

## Versionsschema

- Das Projekt nutzt fortlaufende Beta-Versionen im Stil `Major.Minor.Patch-beta`.
- Beispiele:
  `0.1.00-beta` für die erste größere Beta-Auslieferung oder einen neuen frühen Meilenstein.
  `0.1.01-beta` für einen kleinen, fokussierten Fix ohne großen Architektur- oder Flow-Umbau.
  `0.2.00-beta` für einen größeren Fix oder einen merklichen Sprung in UX, Architektur, Prozess oder mehreren Oberflächen.
  `0.2.01-beta` für den nächsten kleinen Fix nach `0.2.00-beta`.
  `0.3.00-beta` für den nächsten größeren Sprung nach `0.2.x-beta`.

## Entscheidungsregel

- Patch erhöhen, wenn sich nur ein begrenzter Fehler, Text, Styling oder ein kleiner Teilfluss ändert.
- Minor erhöhen und Patch auf `00` setzen, wenn sich Login, Navigation, Kernworkflow, Datenfluss oder mehrere Bereiche spürbar ändern.
- Wenn unklar ist, ob etwas klein oder groß ist, lieber als größerer Fix behandeln.

## Eintragsformat

- Version
- Datum
- Uhrzeit mit Zeitzone
- Typ
- Zusammenfassung in ein bis zwei Sätzen
- Stichpunkte der wichtigsten Änderungen

## Arbeitsregel für Codex

- Nach jeder abgeschlossenen Änderung zuerst `CHANGELOG.md` aktualisieren.
- Danach erst Tests, Typecheck oder Build ausführen und anschließend das Ergebnis berichten.
