# Datensicherung im Restaurantbetrieb

## Ziel

Bestellungen, Abrechnungen, Benutzer, Einstellungen und Druckaufträge dürfen bei einem
Absturz, Neustart oder Austausch des Programmordners nicht verloren gehen.

## Serverseitiger Speicher

Der Produktivdienst speichert seine Betriebsdaten außerhalb des Programmordners:

```text
/var/lib/gastroweb/kiju-shared-state.json
/var/lib/gastroweb/kiju-print-state.json
```

Der Pfad wird über den Systemdienst mit diesen Variablen gesetzt:

```env
KIJU_DATA_DIR=/var/lib/gastroweb
KIJU_SHARED_STATE_FILE=/var/lib/gastroweb/kiju-shared-state.json
KIJU_PRINT_STATE_FILE=/var/lib/gastroweb/kiju-print-state.json
```

Das Deploy-Skript `scripts/deploy-gastroweb.sh` richtet den Ordner und die
Systemd-Konfiguration ein. Beim ersten Lauf migriert es vorhandene Live-Daten aus dem
Projektordner, bevor der Dienst auf den dauerhaften Pfad umgestellt wird.

## Schutz bei einem Absturz

Jeder neue Stand wird zuerst vollständig in eine temporäre Datei geschrieben und auf
den Datenträger synchronisiert. Erst danach ersetzt diese Datei den bisherigen Stand.

Vor Änderungen werden automatisch rotierende Sicherungen angelegt:

```text
kiju-shared-state.json.bak.1
kiju-shared-state.json.bak.2
...
kiju-shared-state.json.bak.50
```

Wenn die Hauptdatei beschädigt oder gelöscht wurde, lädt der Server beim nächsten Start
automatisch die jüngste gültige Sicherung. Eine beschädigte Datei wird zur Prüfung mit
dem Zusatz `.corrupt-<Zeitpunkt>` aufbewahrt. Sind Hauptdatei und alle Sicherungen
ungültig, startet die Speicherung absichtlich nicht mit einem leeren Stand.

## Kontrolle nach dem Deployment

Auf dem GastroWeb-Container:

```bash
systemctl show gastroweb --property=Environment
ls -lah /var/lib/gastroweb
systemctl status gastroweb --no-pager
```

Nach einer Teständerung in der Anwendung müssen die Hauptdatei und mindestens
`kiju-shared-state.json.bak.1` vorhanden sein.

## Schutz des gesamten Containers

Die Sicherungen unter `/var/lib/gastroweb` schützen nicht vor einem gelöschten oder
defekten Proxmox-Container. Dafür muss in Proxmox zusätzlich ein geplanter Backupjob
für den vollständigen GastroWeb-LXC eingerichtet werden.

Empfehlung:

- tägliches Backup auf einen anderen Datenträger oder ein anderes Backupziel
- mindestens sieben tägliche Sicherungen aufbewahren
- Wiederherstellung regelmäßig mit einem separaten Test-Container prüfen
- vor größeren Updates zusätzlich ein manuelles Proxmox-Backup erstellen

## Manuelle Wiederherstellung

Normalerweise erfolgt die Wiederherstellung automatisch. Falls eine bestimmte Sicherung
manuell verwendet werden soll:

```bash
systemctl stop gastroweb
cp -a /var/lib/gastroweb/kiju-shared-state.json \
  /var/lib/gastroweb/kiju-shared-state.json.vor-wiederherstellung
cp -a /var/lib/gastroweb/kiju-shared-state.json.bak.1 \
  /var/lib/gastroweb/kiju-shared-state.json
systemctl start gastroweb
```

Vor einer manuellen Wiederherstellung immer zuerst eine Kopie des aktuellen Standes
anlegen.
