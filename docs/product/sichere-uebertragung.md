# Sichere Ende-zu-Ende-Übertragung

## Zielbild

PostgreSQL ist die einzige verbindliche Datenquelle. Das Web-Frontend zeigt den zuletzt bestätigten Zustand plus lokal wartende Operationen. Eine Aktion gilt erst dann als gespeichert, wenn `POST /api/transactions` die passende Transaktions-ID mit `status: "confirmed"` bestätigt.

## Ablauf

1. Das Gerät erzeugt eine eindeutige Transaktions-ID und eine typisierte `CriticalOperation`.
2. Die Operation wird vor dem ersten Netzwerkversuch in IndexedDB gespeichert.
3. Die Oberfläche wendet offene Operationen als lokale Vorschau auf den bestätigten Serverzustand an.
4. Die NestJS-API führt die Operation in einer serialisierbaren PostgreSQL-Transaktion aus.
5. Zustand, Transaktionsprotokoll, Rückgängig-Punkt und Druckjobs werden gemeinsam gespeichert.
6. Erst die passende Bestätigung entfernt den Vorgang aus der lokalen Warteschlange.

Wiederholungen erfolgen nach 1, 2, 5, 10, 30, 60, 60 und 60 Sekunden. Ein Versuch läuft höchstens 8 Sekunden. Netzwerkfehler, HTTP 408/429 und 5xx werden automatisch wiederholt. Validierungs- und Konfliktfehler bleiben sichtbar und müssen manuell erneut angestoßen werden.

## Idempotenz

Eine bereits bekannte Transaktions-ID mit identischer Nutzlast liefert die gespeicherte Bestätigung erneut. Eine andere Nutzlast unter derselben ID wird als Konflikt abgelehnt. Dadurch bleiben auch Wiederholungen nach einem verlorenen Antwortpaket sicher.

## Übertragungsmatrix

| Bisherige Schreibstelle | Früheres Verhalten | Neue Operation |
| --- | --- | --- |
| Position hinzufügen, ändern, löschen | Lokaler Zustand, anschließend Snapshot | `order.item.add`, `order.item.update`, `order.item.remove` |
| Gang warten oder überspringen | Dialog schloss nach lokaler Änderung | `order.course.wait`, `order.course.skip` |
| An Bar oder Küche senden | Lokale Erfolgsmeldung, Druck separat | `order.send` mit atomaren Druckjobs |
| Küche/Bar-Status | Fire-and-forget-Snapshot | `kitchen.status`, `bar.status` |
| Rechnung und Reprint | Statusänderung und Druck getrennt | `order.receipt` mit atomarem Druckjob |
| Zahlung, Storno, Abschluss | Dialog schloss vor Serverbestätigung | `order.payment`, `order.cancellation`, `order.close` |
| Tisch, Kopplung, Abholung | Vollständiger Snapshot | `table.create`, `table.update`, `table.link`, `table.unlink` |
| Mitarbeiter und Übergabe | Vollständiger Snapshot | `staff.create`, `staff.update`, `staff.delete`, `staff.handover` |
| Produkte und Einstellungen | Vollständiger Snapshot | `catalog.*`, `settings.update` |
| Tagesreset und Rückgängig | Browserbasierter Rückgängigstand | `daily.reset`, `daily.reset.undo` plus `UndoCheckpoint` |
| Benachrichtigungen | Gemeinsamer Snapshot | `notification.update` |
| Direkter Druck | JSON-Druckdatei | `print.enqueue` beziehungsweise Druckjob innerhalb der Fachtransaktion |

Lokale Anmeldung, Abmeldung und lokale Benachrichtigungs-Lesestände bleiben gerätespezifisch.

## Migration

Voraussetzungen:

- PostgreSQL 16 ist erreichbar.
- `DATABASE_URL` zeigt auf eine leere Zieldatenbank.
- Domain und Prisma Client wurden gebaut beziehungsweise generiert.

```powershell
npx pnpm@10.22.0 import:legacy
```

Das Skript bricht bei einer nicht leeren Datenbank ab. Vor dem Import kopiert es die bisherigen Zustands- und Druckdateien nach `backups/legacy-migration-<Zeitstempel>`. Die Quelldateien werden weder gelöscht noch überschrieben.

## Produktivumschaltung

Die spätere Umschaltung erfolgt in einem Wartungsfenster:

1. Webdienst stoppen.
2. PostgreSQL sichern und Migrationen mit `prisma migrate deploy` anwenden.
3. Einmaligen Legacy-Import ausführen.
4. NestJS-API starten und `/api/health` prüfen.
5. Webdienst mit `KIJU_API_INTERNAL_URL=http://127.0.0.1:4000/api` starten.
6. Testbestellung, Druckwarteschlange und Neustart-Replay prüfen.

Es gibt keinen Dual-Write-Betrieb zu den alten JSON-Dateien.
