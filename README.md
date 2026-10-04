# KiJu Gastro Order System

Gastro- und Service-System für Kinder- und Jugendarbeit mit Tischservice,
Küchenfluss, Admin-Konfiguration und professioneller Druckanbindung.

## Struktur

- `apps/web`: Next.js Tablet-First UI für Kellner, Küche, Bar und Admin
- `apps/api`: NestJS-API mit PostgreSQL-Transaktionen, Authentifizierung und SSE-Live-Events
- `apps/print-bridge`: Bondrucker- und Fiskal-Adapter-Schicht
- `packages/domain`: gemeinsame Typen, Demo-Daten und Bestelllogik
- `packages/ui`: wiederverwendbare React UI-Bausteine
- `packages/config`: Theme, Routen und Betriebs-Konstanten
- `docs/product`: Produkt- und Betriebsdokumentation
- `infra/postgres`: PostgreSQL-Startpunkt

## Schnellstart

```powershell
npx pnpm@10.22.0 install
npx pnpm@10.22.0 build
npx pnpm@10.22.0 dev:web
```

Die API kann parallel mit `npx pnpm@10.22.0 dev:api` gestartet werden.

## VPS-Betrieb unter `/gastro`

PostgreSQL auf dem IONOS-VPS ist die einzige verbindliche Datenquelle. Geräte
arbeiten unter `/gastro`, erhalten bestätigte Zustandsänderungen über SSE und
fragen den Server zusätzlich alle 30 Sekunden sowie bei Fokus und
Wiederverbindung ab. Der Browser speichert weder Bestellungen noch eine
automatische Retry-Warteschlange dauerhaft.

Die API-Umgebung benötigt mindestens:

```env
DATABASE_URL=postgresql://kiju:PASSWORT@127.0.0.1:5432/kiju_gastro?schema=public
KIJU_INTERNAL_ACCESS_CODE=<gemeinsamer Betriebscode, mindestens 8 Zeichen>
KIJU_SESSION_SECRET=<langer zufälliger Sitzungs-Schlüssel, mindestens 32 Zeichen>
```

Migrationen anwenden und Dienste starten:

```powershell
npx pnpm@10.22.0 --filter @kiju/api prisma:migrate:deploy
npx pnpm@10.22.0 --filter @kiju/api dev
npx pnpm@10.22.0 --filter @kiju/web dev -- --hostname 0.0.0.0 --port 3000
```

Im Produktivbetrieb bleibt die API auf `127.0.0.1`; der Next.js-Proxy leitet
`/gastro/api/*` intern weiter. Andere Geräte öffnen
`https://<DEINE-DOMAIN>/gastro` und geben den gemeinsamen Betriebscode einmal
ein.

Für den internen Proxy kann zusätzlich gesetzt werden:

```env
KIJU_API_INTERNAL_URL=http://127.0.0.1:4000/api
NEXT_PUBLIC_BASE_PATH=/gastro
```

Der gemeinsame Infrastrukturcheck ist
`https://<DEINE-DOMAIN>/gastro/api/health`. Er prüft Web-Proxy, API und
PostgreSQL gemeinsam.

## QR-Selbstbestellung

Für öffentliche QR-Codes wird eine HTTPS-Adresse gesetzt:

```env
NEXT_PUBLIC_SELF_ORDER_PUBLIC_BASE_URL=https://bestellen.deine-domain.de
```

Die öffentliche Self-Order-API bleibt über ihren jeweiligen Schlüssel geschützt;
interne Bereiche verlangen weiterhin die Betriebscode-Sitzung. Details stehen in
`docs/product/qr-selbstbestellung-cloudflare-tunnel.md`.

## Legacy und Sicherung

Die früheren JSON-Dateien bleiben nur für den Legacy-Import und ausdrückliche
Wiederherstellungen erhalten. Produktive Bestellungen werden ausschließlich in
PostgreSQL geschrieben. Backup- und Restore-Hinweise stehen in
`docs/product/datensicherung.md`; der Übertragungsablauf in
`docs/product/sichere-uebertragung.md`.

## Demo-Zugänge

- Kellner: `Kellner` / `KiJu1234` oder PIN `1234`
- Admin: `Admin` / `Admin1234`
- Küche: `Kueche` / `Kitchen1234` oder PIN `2026`

## Changelog

- technische Änderungen: `CHANGELOG.md`
- sichtbarer Admin-Changelog: `apps/web/src/components/admin-panel.tsx`
- Formatregeln: `docs/product/changelog-policy.md`
