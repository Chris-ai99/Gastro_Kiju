# KiJu Gastro Order System

Lokales Gastro- und Service-System für Kinder- und Jugendarbeit mit Fokus auf Tischservice, Küchenfluss, Admin-Konfiguration und professioneller Ausbau Richtung deutscher Kassensoftware.

## Struktur

- `apps/web`: Next.js Tablet-First UI für Kellner, Küche und Admin
- `apps/api`: NestJS API-Skelett mit Realtime- und Prisma-Vorbereitung
- `apps/print-bridge`: Bondrucker- und Fiskal-Adapter-Schicht
- `packages/domain`: gemeinsame Typen, Demo-Daten und Bestelllogik
- `packages/ui`: wiederverwendbare React UI-Bausteine
- `packages/config`: Theme, Routen und Betriebs-Konstanten
- `docs/product`: Produkt- und Betriebsdokumentation
- `docs/compliance`: Compliance- und Fiskal-Planung
- `infra/postgres`: lokaler PostgreSQL-Startpunkt

## Schnellstart

1. `npx pnpm@10.22.0 install`
2. `npx pnpm@10.22.0 build`
3. `npx pnpm@10.22.0 dev:web`
4. Optional parallel: `npx pnpm@10.22.0 dev:api`

## Demo-Zugänge

- Kellner: `Kellner` / `KiJu1234` oder PIN `1234`
- Admin: `Admin` / `Admin1234`
- Küche: `Kueche` / `Kitchen1234` oder PIN `2026`

## Deployment unter `/kiJu`

Für ein Hosting unter `https://autosello.de/kiJu` ist die Web-App jetzt auf einen konfigurierbaren Base-Path vorbereitet.

1. In `apps/web/.env` oder als Server-Umgebungsvariable setzen:

```env
NEXT_PUBLIC_BASE_PATH=/kiJu
```

2. App bauen und starten:

```powershell
npx pnpm@10.22.0 --filter @kiju/web build
npx pnpm@10.22.0 --filter @kiju/web start -- --hostname 127.0.0.1 --port 3011
```

3. Reverse Proxy für `/kiJu` auf diese App zeigen lassen.

Die genaue Anleitung steht in `docs/product/autosello-deployment.md`.

## Phasenhinweis

Die aktuelle Implementierung liefert einen professionellen operativen Kern mit Demo-Daten, lokaler Sync-Logik im Browser, UI-Workflows, API-Skelett und Druck-/Fiskal-Adapter-Grenzen. Die rechtssichere deutsche Fiskalschicht bleibt bewusst als separate Phase vorgesehen.

## Changelog

- Laufende Änderungen stehen in `CHANGELOG.md`
- Die Regel für neue Versionseinträge steht in `docs/product/changelog-policy.md`
