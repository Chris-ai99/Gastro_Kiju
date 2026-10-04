# QR-Selbstbestellung über Cloudflare Tunnel

Ziel: Gedruckte QR-Codes zeigen auf eine öffentliche HTTPS-Adresse, zum Beispiel `https://bestellen.deine-domain.de/bestellen/<schluessel>`. Gäste können damit auch über mobiles Internet bestellen. Admin, Küche, Bar und Service bleiben für die interne Nutzung gedacht.

## App-Konfiguration

In `apps/web/.env` setzen:

```env
NEXT_PUBLIC_SELF_ORDER_PUBLIC_BASE_URL=https://bestellen.deine-domain.de
KIJU_API_INTERNAL_URL=http://127.0.0.1:4000/api
```

Danach die Web-App neu bauen oder neu starten. Die Variable `NEXT_PUBLIC_SELF_ORDER_PUBLIC_BASE_URL` wird in die QR-Vorschau, den SVG-Download und die Druckvorlage übernommen.

Die öffentliche Domain wird in der Next.js-Middleware begrenzt. Wenn der Host exakt der Self-Order-Domain entspricht, sind nur diese Pfade erlaubt:

- `/bestellen/...`
- `/api/self-order/...`
- notwendige Next.js-Assets

Alle anderen Pfade auf dieser Domain erhalten `404`. Der interne Zugriff auf Admin, Küche, Bar und Service läuft weiter über die lokale oder interne Adresse.

## Cloudflare Tunnel

Cloudflare Tunnel leitet HTTPS-Anfragen von der öffentlichen Subdomain an die lokale Web-App weiter. Die NestJS-API bleibt lokal und wird von den Next.js-Proxy-Routen über `KIJU_API_INTERNAL_URL` erreicht.

Beispiel für `cloudflared`:

```powershell
cloudflared tunnel login
cloudflared tunnel create kiju-gastro-bestellen
cloudflared tunnel route dns kiju-gastro-bestellen bestellen.deine-domain.de
cloudflared tunnel run kiju-gastro-bestellen
```

Beispiel für `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <Tunnel-UUID>
credentials-file: C:\Users\<Benutzer>\.cloudflared\<Tunnel-UUID>.json

ingress:
  - hostname: bestellen.deine-domain.de
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Vor dem Dauerbetrieb prüfen:

```powershell
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://bestellen.deine-domain.de/bestellen/test
```

Für Windows kann `cloudflared` anschließend als Dienst installiert werden:

```powershell
cloudflared.exe service install
```

## Betriebscheck

1. API lokal starten und prüfen, dass `http://127.0.0.1:4000/api` erreichbar ist.
2. Web-App lokal auf `http://127.0.0.1:3000` starten.
3. Tunnel starten.
4. Admin intern öffnen und im Bereich `QR-Selbstbestellung` prüfen, dass `Öffentliche Bestelldomain aktiv` angezeigt wird.
5. QR-Code neu drucken oder SVG neu herunterladen.
6. Mit einem Handy außerhalb des WLANs scannen und eine Testbestellung auslösen.

Quelle für die Tunnel-Befehle und `config.yml`-Struktur: Cloudflare-Dokumentation zu lokal verwalteten Tunneln, Konfigurationsdateien und Windows-Diensten.
