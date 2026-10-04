# VPS-Deployment unter `/gastro`

Die produktive Web-App läuft auf dem IONOS-VPS unter
`https://<DEINE-DOMAIN>/gastro`. Der Browser erreicht die interne NestJS-API
nicht direkt; Next.js leitet die API-Aufrufe intern an
`http://127.0.0.1:4000/api` weiter.

## Build-Konfiguration

Vor dem Build setzen:

```env
NEXT_PUBLIC_BASE_PATH=/gastro
KIJU_API_INTERNAL_URL=http://127.0.0.1:4000/api
```

Die API benötigt zusätzlich im geschützten Systemd-Environment:

```env
DATABASE_URL=postgresql://...
KIJU_INTERNAL_ACCESS_CODE=<zufälliger Betriebscode>
KIJU_SESSION_SECRET=<langer zufälliger Sitzungs-Schlüssel>
```

Build und Start erfolgen über die vorhandenen Systemd-Vorlagen und
`scripts/deploy-gastroweb.sh`. Ein Deployment wird nicht automatisch von der
Anwendung ausgelöst.

## Reverse Proxy

Der öffentliche Webserver muss den Präfix `/gastro` erhalten und an den lokalen
Next-Port weiterleiten. SSE darf nicht gepuffert werden:

```nginx
location /gastro/ {
    proxy_pass http://127.0.0.1:3110;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

## Prüfungen nach dem Neustart

```bash
curl --fail https://<DEINE-DOMAIN>/gastro/api/health
```

Der Health-Endpunkt prüft die Web-Weiterleitung, die API und die PostgreSQL-
Verbindung. Danach mit zwei getrennten Browsern anmelden und eine Testbestellung
von Service nach Küche und Bar verfolgen.
