# Produktvision

## Zielbild

KiJu Gastro Order System ist ein lokales Service-System für Kinder- und Jugendarbeit mit einem professionellen Gastro-Flow:

- Tablet-first Kellneroberflaeche mit Raumansicht, Tisch-Zoom und Sitzplatzwahl
- Geführter Bestellweg für Getränke, Vorspeise, Hauptspeise und Nachtisch
- Hold, Warten, Kuechenversand, Review, Rechnung und Schliessen im selben Fluss
- Fester Kuechenmonitor mit 7 Tischspalten und klarer Wellenschaltung pro Gang
- Admin-Konsole für Produkte, Preise, Rollen, Tischstatus und Tagesübersichten

## Aktueller Implementierungsstand

- Shared Domain-Modell mit Demo-Daten, Produkten, Tischen, Rollen und Workflow-Helfern
- Next.js UI für Login, Kellner, Küche und Admin
- Browserbasierte lokale Sync-Schicht per `localStorage` und `BroadcastChannel`
- NestJS API-Skelett für Auth, Dashboard, Küche, Admin und Realtime-Gateway
- Druck- und Fiskalgrenzen als eigenstaendige Adapter-Schicht

## Nächste fachliche Ausbaustufen

- Persistente PostgreSQL-Anbindung ueber Prisma
- Reale Split-Zahlung nach Sitzplatz, Position oder Betrag
- Vollstaendige Varianten-, Rabatt- und Storno-Prozesse
- WebSocket-basierte Realtime-Synchronisation ueber API statt nur Browser-Store
