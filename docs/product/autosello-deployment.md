# AutoSello Deployment unter `/kiJu`

Diese Anwendung ist für einen öffentlichen Subpfad unter `https://autosello.de/kiJu` vorbereitet.
Der Login bleibt dabei vollständig der KiJu-Login der App und benötigt keinen AutoSello-Login.

## Zielbild

- Öffentliche Route: `https://autosello.de/kiJu`
- Eigene KiJu-Anmeldung: `Kellner`, `Kueche`, `Admin`
- Kein vorgeschalteter AutoSello-Login für diesen Pfad
- Betrieb als eigenständige Next.js-App hinter einem Reverse Proxy

## Build-Konfiguration

Vor dem Build muss in `apps/web/.env` oder in der Server-Umgebung gesetzt werden:

```env
NEXT_PUBLIC_BASE_PATH=/kiJu
```

Dann bauen und starten:

```powershell
npx pnpm@10.22.0 install
npx pnpm@10.22.0 --filter @kiju/web build
npx pnpm@10.22.0 --filter @kiju/web start -- --hostname 127.0.0.1 --port 3011
```

## Reverse-Proxy-Idee

Der Webserver vor `autosello.de` muss den Pfad `/kiJu` an diese Next.js-App durchreichen.
Wichtig ist, dass der Präfix `/kiJu` nicht entfernt wird, weil die App genau für diesen Base-Path gebaut wird.

Beispiel für Nginx:

```nginx
location /kiJu/ {
    proxy_pass http://127.0.0.1:3011;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Was noch extern fehlt

- Zugriff auf den AutoSello-Server oder das Hosting-Panel
- Zugriff auf das AutoSello-Git-Repository oder die Ziel-Deployment-Pipeline
- Eintrag im Reverse Proxy oder Webserver für `/kiJu`

## Hinweis

Dieses Projekt ist in diesem Workspace nicht mit einem AutoSello-Remote verbunden.
Die App ist jetzt technisch für den Subpfad vorbereitet, aber der eigentliche Live-Rollout auf `autosello.de` muss mit Server- oder Repo-Zugang durchgeführt werden.
