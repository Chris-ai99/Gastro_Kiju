# Zentrale Ende-zu-Ende-Übertragung

## Zielbild

Im produktiven VPS-Betrieb ist PostgreSQL die einzige verbindliche Datenquelle.
Alle internen Geräte greifen über den Web-Pfad `/gastro` auf dieselbe NestJS-API
zu. Operative Bestellungen, Statusänderungen, Zahlungen, Konfigurationen und
Druckaufträge werden nicht im Browser als dauerhafter Zustand gespeichert.

## Übertragung

1. Das Gerät erzeugt eine eindeutige Transaktions-ID und eine typisierte
   `CriticalOperation`.
2. Eine kleine FIFO-Pipeline im Arbeitsspeicher hält schnelle Eingaben nur bis
   zur Verarbeitung in Reihenfolge.
3. Die API verarbeitet jede Transaktion einmal in einer serialisierbaren
   PostgreSQL-Transaktion und speichert Zustand, Protokoll, Rückgängig-Punkt und
   Druckjobs gemeinsam.
4. Erst die passende Antwort mit `status: "confirmed"` gilt im Gerät als Erfolg.
5. Nach dem Commit veröffentlicht die API ein Ereignis im authentifizierten
   SSE-Stream `/gastro/api/events`. Andere Geräte laden den neuen bestätigten
   Zustand. Ein 30-Sekunden-Abruf sowie Abrufe bei Fokus und Wiederverbindung
   bleiben als Rückfallebene aktiv.

Bei einer unklaren POST-Antwort prüft der Browser dieselbe Transaktions-ID genau
einmal über `GET /gastro/api/transactions/:transactionId`. Es gibt keine
automatische Wiederholung und keine spätere Doppelbuchung. Bei einem Fehler oder
Konflikt werden nicht bestätigte lokale Vorschauen verworfen; der bestätigte
Serverstand wird neu geladen und der Bediener muss den Vorgang bewusst erneut
auslösen.

## Zugriffsschutz

Die interne Oberfläche wird vor dem ersten Laden mit einem gemeinsamen
Betriebscode freigeschaltet. Die API setzt danach eine signierte, sichere
HttpOnly-Sitzung für 30 Tage. State-, Transaktions-, Live- und interne
Druckendpunkte verlangen diese Sitzung. Gastbestellungen über QR bleiben
öffentlich über ihren Self-Order-Schlüssel geschützt; Druckbrücken behalten ihren
separaten Token.

Benötigte Produktionsvariablen der API:

```env
DATABASE_URL=postgresql://...
KIJU_INTERNAL_ACCESS_CODE=<zufälliger Betriebscode mit mindestens 8 Zeichen>
KIJU_SESSION_SECRET=<zufälliger langer geheimer Wert mit mindestens 32 Zeichen>
```

Fehlende Produktionswerte lassen die API absichtlich sicher fehlschlagen.
Fehlversuche beim Betriebscode werden pro Client begrenzt.

## Offline- und Startverhalten

Beim Start ohne Server oder PostgreSQL bleibt die interne Oberfläche blockiert.
Nach einem späteren Ausfall bleibt der letzte bestätigte Stand sichtbar, aber neue
Änderungen werden nicht als erfolgreich behandelt. Es gibt keine IndexedDB-
Warteschlange, kein `BroadcastChannel` und kein automatisches Wiederholungssystem
im Browser.

## Legacy und Wiederherstellung

Das frühere JSON-Syncserver-Programm ist abgeschaltet. Die JSON-Dateien und der
Legacy-Import bleiben ausschließlich als Wiederherstellungs- beziehungsweise
Migrationswerkzeug erhalten. Produktive Schreibvorgänge gehen ausschließlich
über PostgreSQL.

## Prüfungen

- `GET /gastro/api/health` prüft Web-Proxy, API und PostgreSQL gemeinsam.
- API-Pfade werden mit und ohne `/gastro` getestet.
- Domain-, Typecheck- und Build-Prüfungen sichern serialisierbare Transaktionen,
  Self-Order-Idempotenz, Authentifizierung und Live-Ereignisse.
