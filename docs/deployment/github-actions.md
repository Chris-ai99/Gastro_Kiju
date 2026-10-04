# Server-Deployment über GitHub Actions

Das Deployment lässt sich von jedem Rechner aus der GitHub-Oberfläche starten. Ein Push allein veröffentlicht nichts auf dem Server.

## Deployment starten

1. Im Repository **Actions** öffnen.
2. **KiJu Gastro Server-Deploy** auswählen und **Run workflow** anklicken.
3. Als Branch `main` auswählen und bei der Bestätigung **Ja, jetzt deployen** wählen.
4. Den Lauf bis zum grünen Abschluss verfolgen.

Der Workflow startet das vorhandene Skript `/root/Gastro_Kiju/Gastro_Kiju/Gastro_Kiju/scripts/deploy-gastroweb.sh`. Es aktualisiert den Server aus `main`, baut die Anwendung und startet den Dienst `gastroweb` neu.

## Zugriff

Das Repository verwendet das Actions-Secret `KIJU_DEPLOY_SSH_KEY`. Es enthält einen eigenen SSH-Schlüssel für diesen Workflow. Auf dem Server wird der zugehörige öffentliche Schlüssel in `root`’s `authorized_keys` mit einem erzwungenen Befehl eingetragen. Dieser Schlüssel darf ausschließlich das Deploy-Skript ausführen; Shellzugriff und SSH-Portweiterleitungen bleiben gesperrt.

Der SSH-Hostschlüssel ist im Workflow fest hinterlegt und wird strikt geprüft. Private Schlüssel oder Serverpasswörter gehören nicht in Git-Dateien.

## Grenzen

- Der Workflow startet nur manuell und nur, wenn `main` ausgewählt ist.
- Gleichzeitige Deployments werden nacheinander ausgeführt.
- Die einmalige Freigabe des öffentlichen SSH-Schlüssels auf dem Server ist Voraussetzung.
- Die lokale Druckbrücke benötigt zusätzlich ihre Servermigration und den separat geschützten Schlüssel `KIJU_PRINT_BRIDGE_TOKEN`; dieses Deploy-Secret ist nicht der Druckbrückenschlüssel.
