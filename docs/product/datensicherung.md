# Datensicherung im VPS-Betrieb

## Verbindliche Daten

PostgreSQL auf dem IONOS-VPS enthält den operativen Zustand, Bestellungen,
Zahlungen, Benutzer, Konfiguration, Transaktionsprotokolle, Undo-Punkte und
Druckaufträge. Der Programmordner und Browserdaten sind keine produktive
Sicherungskopie.

Die API verwendet `DATABASE_URL` aus dem Systemd-Environment. Vor dem ersten
Produktivbetrieb müssen die Prisma-Migrationen angewendet und ein automatisches
PostgreSQL-Backup eingerichtet werden. Bestehende Daten werden nicht zurückgesetzt
oder neu importiert.

## Empfohlene VPS-Sicherung

- täglicher `pg_dump` der Produktionsdatenbank auf ein getrenntes Backupziel
- mindestens sieben tägliche und vier wöchentliche Generationen aufbewahren
- Backups nicht im Release-Verzeichnis speichern
- Wiederherstellung regelmäßig mit einer separaten Testdatenbank prüfen
- vor größeren Updates zusätzlich einen Snapshot des IONOS-VPS erstellen

Beispiel für einen manuellen Dump:

```bash
install -d -m 0700 /var/backups/kiju-gastro
pg_dump --format=custom --file=/var/backups/kiju-gastro/kiju-$(date -u +%Y%m%dT%H%M%SZ).dump "$DATABASE_URL"
chmod 0600 /var/backups/kiju-gastro/*.dump
```

Das Passwort und `DATABASE_URL` dürfen nicht in Shell-Historie, Git oder
Deploy-Protokollen landen. Für die regelmäßige Ausführung sollte ein geschütztes
Systemd-Credential oder ein passendes Secret-File verwendet werden.

## Wiederherstellung

1. API und Webdienst in den Wartungsmodus versetzen.
2. Einen aktuellen Datenbankdump zusätzlich unverändert kopieren.
3. Die PostgreSQL-Datenbank in eine vorbereitete Zielinstanz zurückspielen.
4. `prisma migrate deploy` ausführen, falls der Dump ältere Migrationen enthält.
5. `GET /gastro/api/health` prüfen und anschließend eine Testbestellung aus zwei
   Browsergeräten durchführen.

Der Legacy-JSON-Import bleibt nur für eine ausdrücklich geplante Migration oder
Wiederherstellung bestehen. Er wird nicht automatisch beim Deploy ausgeführt.

## Druckdaten

Die serverseitige Druckwarteschlange bleibt als eigener, betrieblicher Teil
erhalten. Ihre lokalen Dateien und Druckerdiagnosen ersetzen jedoch nicht die
PostgreSQL-Sicherung der Bestellungen und Transaktionen.
