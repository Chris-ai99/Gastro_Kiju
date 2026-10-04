# Server-Deployment über GitHub Actions

Das Deployment lässt sich von jedem Rechner aus der GitHub-Oberfläche starten. Ein Push allein veröffentlicht nichts auf dem Server.

## Deployment starten

1. Im Repository **Actions** öffnen.
2. **KiJu Gastro Server-Deploy** auswählen und **Run workflow** anklicken.
3. Als Branch `main` auswählen und bei der Bestätigung **Ja, jetzt deployen** wählen.
4. Den Lauf bis zum grünen Abschluss verfolgen.

Der Workflow überträgt den ausgewählten Commit als Quellarchiv per SSH. Der VPS baut daraus eine neue Release unter **/opt/kiju-gastro/releases**, kopiert die Next.js-Assets in den eigenständigen Webserver und schaltet die API- und Web-Verknüpfung erst nach erfolgreichem Build um. Anschließend startet er **gastroapi** und **kiju-gastro** neu und prüft die direkte API-Gesundheit unter **/api/health**, den öffentlichen Proxy unter **/gastro/api/health** sowie **/gastro/** lokal auf dem Server. Der Proxy-Check stellt sicher, dass Base-Path, Webdienst, API und PostgreSQL gemeinsam erreichbar sind. Bei einem Fehler stellt er die vorherigen Verknüpfungen wieder her. Frühere Releases und die bestehenden PostgreSQL-Daten bleiben erhalten.

## Zugriff

Das Repository verwendet das Actions-Secret **KIJU_DEPLOY_SSH_KEY**. Der passende öffentliche Schlüssel auf dem VPS ist auf **/usr/local/sbin/kiju-gastroweb-deploy** beschränkt. Er kann keine Shell öffnen und keine SSH-Portweiterleitungen verwenden.

Zusätzlich werden die Actions-Secrets **KIJU_INTERNAL_ACCESS_CODE** und **KIJU_SESSION_SECRET** benötigt. Der Workflow überträgt sie vor jedem Deployment geschützt im Quellarchiv; der eingeschränkte Deploy-Empfänger ersetzt damit auf dem VPS nur diese beiden Variablen in **/etc/gastro-kiju/api.env** und lässt **DATABASE_URL** sowie andere Serverwerte unverändert. Die Datei bleibt auf dem VPS mit Modus **600** geschützt; die Werte werden weder in Git gespeichert noch im Workflow-Protokoll ausgegeben. Der SSH-Schlüssel bleibt auf den einzigen `deploy`-Befehl beschränkt.

Der SSH-Hostschlüssel ist im Workflow fest hinterlegt und wird strikt geprüft. Private Schlüssel und Serverpasswörter gehören nicht in Git-Dateien. Zum Starten des Workflows von einem anderen Rechner wird kein lokaler privater Schlüssel benötigt; erforderlich ist Zugriff auf das GitHub-Repository und dessen Actions.

## Grenzen

- Der Workflow startet nur manuell und nur, wenn `main` ausgewählt ist.
- Gleichzeitige Deployments werden nacheinander ausgeführt.
- Die einmalige Freigabe des öffentlichen SSH-Schlüssels auf dem Server ist Voraussetzung.
- Die lokale Druckbrücke benötigt zusätzlich ihre Servermigration und den separat geschützten Schlüssel `KIJU_PRINT_BRIDGE_TOKEN`; dieses Deploy-Secret ist nicht der Druckbrückenschlüssel.
