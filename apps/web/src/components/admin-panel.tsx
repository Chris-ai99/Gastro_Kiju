"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  ChefHat,
  CheckCircle2,
  FileDown,
  LayoutGrid,
  Maximize2,
  MonitorUp,
  PlusCircle,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Trash2,
  Users,
  X
} from "lucide-react";

import { routeConfig } from "@kiju/config";
import {
  buildClosedSessions,
  calculateGuestCount,
  calculateSessionOpenTotal,
  calculateSessionTotal,
  euro,
  isOrderItemCanceled,
  type AppNotification,
  type AppState,
  type DesignMode,
  type OrderSession,
  type OrderTarget,
  type NotificationTone,
  type ProductCategory,
  type ProductionTarget,
  type Role,
  type ServiceOrderMode
} from "@kiju/domain";
import { buildReceiptDocumentFromSessions } from "@kiju/print-bridge";
import { AccordionSection, SectionCard, StatusPill } from "@kiju/ui";

import { courseLabels, getSessionForTable, resolveProductName, useDemoApp } from "../lib/app-state";
import { createPrintJob } from "../lib/print-client";
import { PrinterAdminPanel } from "./printer-admin-panel";
import { RoleSwitchPopover } from "./role-switch-popover";
import { RouteGuard } from "./route-guard";

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  waiter: "Kellner",
  kitchen: "Küche"
  , bar: "Bar"
};

type StaffLoginRole = Extract<Role, "waiter" | "kitchen" | "bar">;

type AdminChangelogEntry = {
  version: string;
  date: string;
  time: string;
  type: string;
  title: string;
  summary: string;
  categories: string[];
  changes: string[];
};

const adminChangelogEntries: AdminChangelogEntry[] = [
  {
    version: "0.8.11-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Verbesserung",
    title: "Tagesreset ersetzt den alten Admin-Reset",
    summary:
      "Der Admin-Bereich bietet jetzt einen rückgängig machbaren Tagesreset für Umsatz und offene Bestellungen statt des bisherigen Komplett-Resets.",
    categories: ["Admin", "Tagesreset", "Abrechnung"],
    changes: [
      "Die alte Reset-Fläche für die Standardkonfiguration wurde aus der Admin-Oberfläche entfernt.",
      "Der neue Tagesreset setzt Umsatz heute, Tagesgäste und Tagesabschlüsse auf 0 und schließt offene Bestellungen.",
      "Ein Rückgängig-Snapshot erlaubt es, den letzten Tagesreset in derselben Admin-Sitzung wiederherzustellen."
    ]
  },
  {
    version: "0.8.10-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Verbesserung",
    title: "Abrechnungsauswahl und Changelog-Pflicht ergänzt",
    summary:
      "Die Abrechnung kann offene Positionen jetzt gesammelt auswählen und die Projektdokumentation schreibt Changelog-Einträge verbindlich vor.",
    categories: ["Service", "Abrechnung", "Changelog"],
    changes: [
      "Unter Abrechnung markiert der neue Button Alle auswählen alle offenen Positionen mit ihrer vollständigen offenen Menge.",
      "Die Auswahlleiste zeigt, wie viele offene Positionen bereits für Zahlung oder Storno ausgewählt sind.",
      "Die Projektregeln verlangen künftig für jede funktionale oder sichtbare Änderung einen passenden Admin-Changelog-Eintrag."
    ]
  },
  {
    version: "0.8.09-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Verbesserung",
    title: "Executive-Cockpit für den Monitor",
    summary:
      "Das Live-Dashboard wurde auf ein festes Full-HD-Cockpit ohne Scrollen umgebaut.",
    categories: ["Admin", "Dashboard", "Monitor"],
    changes: [
      "Die Vollbildansicht nutzt jetzt kompakte KPI-Karten, eine Fokusleiste und große Statusflächen wie im Referenzdesign.",
      "Zeitwerte und Funfacts stehen oben in der Kachelübersicht statt in einem eigenen unteren Bereich.",
      "Unten bleiben nur noch Service-Zeitanalyse, Produktionsstatus und aktuelle Hinweise sichtbar."
    ]
  },
  {
    version: "0.8.08-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Feature",
    title: "Live-Dashboard zeigt Wartezeiten und Monitor-Funfacts",
    summary:
      "Der Admin-Monitor zeigt jetzt operative Durchschnittszeiten und nützliche Live-Kennzahlen für den laufenden Service.",
    categories: ["Admin", "Dashboard", "Kennzahlen"],
    changes: [
      "Neue Kacheln zeigen Aufnahme bis Küche/Bar, Produktionszeit, Auslieferung, Gesamtzeit und Tischbelegung.",
      "Die Monitoransicht ergänzt Auslastung, aktives Service-Team, Top-Artikel und abrechnungsbereite Tische.",
      "Das Design wurde stärker an ein dunkles Executive-Cockpit mit kompakten Karten und klarer Lesbarkeit angelehnt."
    ]
  },
  {
    version: "0.8.07-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Feature",
    title: "Live-Dashboard für Admin-Monitore",
    summary:
      "Der Admin-Bereich hat jetzt einen aufrufbaren Vollbild-Infobildschirm für den laufenden Betrieb.",
    categories: ["Admin", "Dashboard", "Live-Betrieb"],
    changes: [
      "Neue Live-Dashboard-Schaltfläche öffnet einen monitorfreundlichen Vollbildschirm.",
      "Der Infobildschirm zeigt Umsatz, offene Bestellungen, Aufmerksamkeit, Hinweise und Produktionsstatus.",
      "Tischkarten, aktuelle Hinweise und letzte Abschlüsse bleiben ohne Bearbeitungsfelder gut scanbar."
    ]
  },
  {
    version: "0.8.06-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Verbesserung",
    title: "Hinweise zeigen den auslösenden Kellner",
    summary:
      "Admin-Hinweise nennen jetzt den Mitarbeiter, der eine Serviceaktion ausgelöst hat.",
    categories: ["Admin", "Hinweise", "Service"],
    changes: [
      "Neue Hinweise speichern den auslösenden Mitarbeiter automatisch mit.",
      "Bestehende Tisch-Hinweise werden über die zugehörige Bestellung dem Kellner zugeordnet.",
      "Hinweislisten, dringende Hinweise und Abrechnungsalarme zeigen den Namen direkt am Eintrag."
    ]
  },
  {
    version: "0.8.05-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Fix",
    title: "Storno-Hinweis bleibt unten sichtbar",
    summary:
      "Der Service-Hinweis nach einem Rechnungsstorno bleibt als kurzer Toast unten im Bild und verschwindet automatisch.",
    categories: ["Service", "Storno", "Hinweise"],
    changes: [
      "Storno gespeichert wird nicht mehr im scrollenden Bestellbereich angezeigt, sondern fest unten am Bildschirm.",
      "Der Hinweis blendet sich nach drei Sekunden automatisch aus.",
      "Lange Hinweisdetails umbrechen im Toast sauber, ohne Buttons oder Inhalte zu verschieben."
    ]
  },
  {
    version: "0.8.04-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Fix",
    title: "Dunkelmodus lesbarer gemacht",
    summary:
      "Der dunkle Modus hat mehr Kontrast für Service, Küche und Admin bekommen, damit Texte zuverlässig lesbar bleiben.",
    categories: ["Theme", "Service", "Küche", "Admin"],
    changes: [
      "Dunkle Karten, Dialoge, Buttons und Eingaben nutzen klarere Vordergrundfarben.",
      "Warn-, Erfolgs- und Hinweisflächen behalten im dunklen Theme erkennbare Kontraste.",
      "Der Service-Arbeitsfluss wurde im dunklen Modus visuell auf Lesbarkeit geprüft."
    ]
  },
  {
    version: "0.8.03-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Fix",
    title: "Stornierte Speisen bleiben im Küchenpass sichtbar",
    summary:
      "Vom Service stornierte Speisen verschwinden nicht mehr aus der Küche, sondern bleiben als Storno markiert sichtbar.",
    categories: ["Küche", "Service", "Storno"],
    changes: [
      "Stornierte Küchenpositionen bleiben auf dem Küchenpass erhalten.",
      "Betroffene Gerichte werden rot, durchgestrichen und mit Storniert gekennzeichnet.",
      "Die Anzeige hilft Küche und Service, nachträgliche Stornos nachvollziehbar abzugleichen."
    ]
  },
  {
    version: "0.8.02-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Verbesserung",
    title: "Admin-Changelog ergänzt",
    summary:
      "Der Admin-Bereich enthält jetzt einen eigenen Änderungsverlauf mit allen bisherigen Beta-Einträgen.",
    categories: ["Admin", "Changelog", "Dokumentation"],
    changes: [
      "Neuer Admin-Abschnitt Changelog mit Version, Datum, Typ, Kategorien und Detailpunkten.",
      "Alle bisherigen Beta-Einträge aus der Projekt-Historie sind sichtbar im Admin-Cockpit dokumentiert.",
      "Neue Änderungen können künftig direkt als neuer Eintrag oben in der Liste ergänzt werden."
    ]
  },
  {
    version: "0.8.01-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Fix",
    title: "Hinweis-Menü und Notizkorrekturen stabilisiert",
    summary:
      "Das Service-Menü bleibt auch bei langen Hinweisen bedienbar und Notizkorrekturen erzeugen keine Meldung mehr pro Buchstabe.",
    categories: ["Service", "Hinweise", "Notizen"],
    changes: [
      "Lange Hinweis-Texte umbrechen sauber im Menü und schieben Aktionsbuttons nicht mehr aus dem sichtbaren Bereich.",
      "Im Service-Menü gibt es die neue Aktion Alles als gelesen markieren.",
      "Notizen an bereits gesendeten Positionen werden erst beim Verlassen, Schließen oder nach 15 Sekunden Tipp-Pause gespeichert."
    ]
  },
  {
    version: "0.8.00-beta",
    date: "2026-05-01",
    time: "laufend",
    type: "Verbesserung",
    title: "Tischübersicht für alle Service-Tische",
    summary:
      "Zusätzliche Tische sind im Service direkt auswählbar, auch wenn sie keinen Hotspot im Raumfoto haben.",
    categories: ["Service", "Tische", "Abrechnung"],
    changes: [
      "Der bisherige Bereich Tisch-Fusion wurde zur Tischübersicht umgebaut.",
      "Tisch 7 und weitere neue Tische können über die Übersicht ausgewählt und bebucht werden.",
      "Die Tischkopplung bleibt erhalten und liegt jetzt als Unterfunktion Tische koppeln in der Übersicht."
    ]
  },
  {
    version: "0.7.00-beta",
    date: "2026-04-30",
    time: "22:15",
    type: "Feature",
    title: "Druck, Bar und Pass erweitert",
    summary:
      "Der aktuelle Stand ergänzt Druckverwaltung, Bar-Ansicht, Pass-Board und neue Print-APIs.",
    categories: ["Druck", "Bar", "Pass", "API"],
    changes: [
      "Print-Bridge, Druckaufträge, Testdruck und Retry-Endpunkte wurden ergänzt.",
      "Neue Ansichten für Bar und Pass unterstützen den Ablauf zwischen Service, Getränkeausgabe und Küche.",
      "Admin und Service zeigen zusätzliche Druck- und Rechnungsfunktionen für den laufenden Betrieb."
    ]
  },
  {
    version: "0.5.02-beta",
    date: "2026-03-29",
    time: "02:20",
    type: "kleiner Fix",
    title: "Rollenwechsel wieder oben rechts verfügbar",
    summary: "Das Rollenwechsel-Fenster ist in den Arbeitsansichten wieder direkt erreichbar.",
    categories: ["Service", "Küche", "Admin"],
    changes: [
      "Wiederverwendbares Rollenwechsel-Popover für Service, Küche und Admin ergänzt.",
      "Rollenwechsel im Kellner-, Küchen- und Admin-Kopfbereich wieder direkt oben rechts verankert.",
      "Direkte Wechselziele auf aktive Konten und den Login zurückgeführt."
    ]
  },
  {
    version: "0.5.01-beta",
    date: "2026-03-28",
    time: "03:01",
    type: "kleiner Fix",
    title: "Hosting unter Subpfad vorbereitet",
    summary: "Das Projekt ist technisch für ein Hosting unter einem konfigurierbaren App-Pfad vorbereitet.",
    categories: ["Deployment", "Web-App", "Dokumentation"],
    changes: [
      "Konfigurierbaren Base-Path für die Web-App ergänzt und den Build auf einen Subpfad vorbereitet.",
      "Manifest und Start-URL auf den konfigurierten App-Pfad umgestellt.",
      "Deployment-Dokumentation für einen öffentlichen Pfad ohne AutoSello-Login ergänzt."
    ]
  },
  {
    version: "0.5.00-beta",
    date: "2026-03-28",
    time: "02:56",
    type: "großer Fix",
    title: "Oberfläche mit Ausklapp-Bereichen und Dunkelmodus",
    summary:
      "Die Oberfläche wurde übersichtlicher gemacht und um ein kontrastreiches dunkles Theme ergänzt.",
    categories: ["UI", "Theme", "Struktur"],
    changes: [
      "Globalen Theme-Schalter für Hell und Schwarz ergänzt.",
      "Wiederverwendbare Ausklapp-Bereiche eingeführt und in Login, Service, Küche und Admin integriert.",
      "Karten, Buttons, Eingaben und Raumansicht für beide Themes optisch vereinheitlicht."
    ]
  },
  {
    version: "0.4.01-beta",
    date: "2026-03-28",
    time: "02:49",
    type: "kleiner Fix",
    title: "Mitarbeiter im Admin vollständig bearbeitbar",
    summary: "Mitarbeiter und Rollen lassen sich im Admin-Bereich über klare Unterkategorien pflegen.",
    categories: ["Admin", "Mitarbeiter", "Zugang"],
    changes: [
      "Mitarbeiterkarten in Profil, Zugang sowie Rolle und Status gegliedert.",
      "Benutzername, Name, Passwort, PIN, Rolle und Aktiv-Status als editierbare Felder ergänzt.",
      "Validierung für Benutzernamen, Pflichtfelder und den letzten aktiven Admin abgesichert."
    ]
  },
  {
    version: "0.4.00-beta",
    date: "2026-03-28",
    time: "02:45",
    type: "großer Fix",
    title: "Admin-Konsole und Kellner-Bearbeitung ausgebaut",
    summary:
      "Admin-Konsole, Kellner-Bearbeitung und Raumansicht wurden näher an den echten Haus-Amos-Ablauf gebracht.",
    categories: ["Admin", "Service", "Raumansicht"],
    changes: [
      "Umsatzkarte im Kellnerbereich auf Admin beschränkt und Service-Metrik für Kellner eingebaut.",
      "Erfasste Leistungen im Kellner-Flow bearbeitbar gemacht.",
      "Raumansicht auf die fotografierte Tischanordnung mit sieben Tischen umgestellt.",
      "Admin-Menü für Produkte, Mitarbeiter, Tische, Abschlüsse und Reset neu geordnet."
    ]
  },
  {
    version: "0.3.02-beta",
    date: "2026-03-28",
    time: "02:06",
    type: "kleiner Fix",
    title: "Reset erzeugt leeren Betriebszustand",
    summary: "Der Standard-Reset setzt Statistik, Leistungen und Tischbelegungen wirklich auf null.",
    categories: ["Admin", "Reset", "Betrieb"],
    changes: [
      "Standard-Reset auf leere Sessions, leere Hinweise und Tageswerte null umgestellt.",
      "Admin-Hinweistext präzisiert, damit klar ist, dass operative Daten vollständig geleert werden."
    ]
  },
  {
    version: "0.3.01-beta",
    date: "2026-03-28",
    time: "01:48",
    type: "kleiner Fix",
    title: "Browser-Kompatibilität abgesichert",
    summary: "Admin-Löschung, Hinweise und Demo-Vorgänge funktionieren auch ohne crypto.randomUUID().",
    categories: ["Browser", "Stabilität", "Admin"],
    changes: [
      "Robuste Fallback-ID-Erzeugung für neue Sessions, Hinweise, Positionen und Zahlungen ergänzt.",
      "Laufzeitfehler bei Tischlöschung und anderen Aktionen auf älteren Browsern oder Tablets behoben."
    ]
  },
  {
    version: "0.3.00-beta",
    date: "2026-03-28",
    time: "01:40",
    type: "großer Fix",
    title: "Sicherer Reset und Tischlöschung",
    summary: "Die Admin-Konsole wurde um Komplett-Reset und gezieltes Löschen einzelner Tische erweitert.",
    categories: ["Admin", "Reset", "Tische"],
    changes: [
      "Gefahrenbereich mit dreifacher Sicherheitsabfrage für den kompletten Reset eingebaut.",
      "Neue Löschfunktion für einzelne Tische inklusive Bestellungen, Hinweise und Abschlussdaten hinzugefügt.",
      "Kellner-Dashboard gegen fehlende oder komplett gelöschte Tische abgesichert."
    ]
  },
  {
    version: "0.2.01-beta",
    date: "2026-03-28",
    time: "01:18",
    type: "kleiner Fix",
    title: "Lokale Netzwerk-Adresse repariert",
    summary: "Login-Weiterleitung im Entwicklungsmodus funktioniert über lokale Netzwerk-Adressen.",
    categories: ["Login", "Netzwerk", "Entwicklung"],
    changes: [
      "Next.js-Entwicklungsserver für lokale Netzwerk-Adressen freigegeben.",
      "Reload-Verhalten beim Login durch geblockte Dev-Ressourcen behoben.",
      "Changelog-Regel auf fortlaufende Beta-Versionen konkretisiert."
    ]
  },
  {
    version: "0.2.00-beta",
    date: "2026-03-28",
    time: "00:58",
    type: "großer Fix",
    title: "Login vereinfacht und Changelog-Regel eingeführt",
    summary: "Der Einstieg wurde deutlich vereinfacht und direkte Rollenstarts wurden repariert.",
    categories: ["Login", "Rollen", "Changelog"],
    changes: [
      "Service-, Küchen- und Admin-Einstieg auf der Login-Seite als direkte Schnellstarts umgesetzt.",
      "Automatische Weiterleitung bei bereits aktiver Rolle eingebaut.",
      "Nicht funktionierende Vorschau-Links entfernt und Rollenwechsel bereinigt.",
      "Projektweites Changelog mit Regelwerk und Versionsschema angelegt."
    ]
  },
  {
    version: "0.1.01-beta",
    date: "2026-03-28",
    time: "00:47",
    type: "kleiner Fix",
    title: "Deutsche UI-Texte korrigiert",
    summary: "Sichtbare deutsche UI-Texte wurden auf echte Umlaute und ß umgestellt.",
    categories: ["UI", "Sprache", "Deutsch"],
    changes: [
      "Begriffe wie Küche, Getränke, Sitzplätze, schließen und prüfen korrigiert.",
      "Deutscher UI-Text-Skill für konsistente weitere Textänderungen angelegt."
    ]
  },
  {
    version: "0.1.00-beta",
    date: "2026-03-27",
    time: "23:59",
    type: "initiale Beta",
    title: "Erstes Monorepo erstellt",
    summary: "Web-App, API-Skelett, Domain-Logik, Demo-Daten und Dokumentation wurden angelegt.",
    categories: ["Grundlage", "Web-App", "API"],
    changes: [
      "Next.js-Web-App für Login, Kellner, Küche und Admin aufgebaut.",
      "NestJS-API-Skelett, Print-Bridge, Domain-Pakete, Theme-Konfiguration und erste Demo-Prozesse angelegt.",
      "Produkt- und Compliance-Dokumentation sowie PostgreSQL-Startpunkt ergänzt."
    ]
  }
];

const changelogCategoryCount = new Set(
  adminChangelogEntries.flatMap((entry) => entry.categories)
).size;
const changelogDayCount = new Set(adminChangelogEntries.map((entry) => entry.date)).size;
const latestChangelogEntry = adminChangelogEntries[0];

const staffLoginRoleLabels: Record<StaffLoginRole, string> = {
  waiter: "Service",
  kitchen: "Küche"
  , bar: "Bar"
};

const staffLoginRoleOrder: Record<StaffLoginRole, number> = {
  waiter: 0,
  kitchen: 1,
  bar: 2
};

const workspaceRouteByRole: Record<StaffLoginRole, string> = {
  waiter: routeConfig.waiter,
  kitchen: routeConfig.kitchen,
  bar: routeConfig.bar
};

const workspaceMissingMessages: Record<StaffLoginRole, string> = {
  waiter: "Es ist aktuell kein aktives Service-Konto vorhanden.",
  kitchen: "Es ist aktuell kein aktives Küchenkonto vorhanden.",
  bar: "Es ist aktuell kein aktives Bar-Konto vorhanden."
};

const workspaceOpenMessages: Record<StaffLoginRole, string> = {
  waiter: "Service-Ansicht konnte nicht geöffnet werden.",
  kitchen: "Küchenansicht konnte nicht geöffnet werden.",
  bar: "Bar-Ansicht konnte nicht geöffnet werden."
};

const isStaffLoginRole = (role: Role): role is StaffLoginRole =>
  role === "waiter" || role === "kitchen" || role === "bar";

const productionLabels: Record<ProductionTarget, string> = {
  service: "Service",
  bar: "Bar",
  kitchen: "Küche"
};

const notificationToneLabels: Record<NotificationTone, string> = {
  info: "Info",
  success: "Bereit",
  alert: "Wichtig"
};

const notificationTonePills: Record<
  NotificationTone,
  "navy" | "amber" | "red" | "green" | "slate"
> = {
  info: "navy",
  success: "green",
  alert: "red"
};

const resolveNotificationActor = (state: AppState, notification: AppNotification) => {
  const sessionForNotification = notification.tableId
    ? getSessionForTable(state.sessions, notification.tableId) ??
      state.sessions.find((session) => session.tableId === notification.tableId)
    : undefined;
  const actorUserId =
    notification.createdByUserId ??
    notification.acceptedByUserId ??
    sessionForNotification?.waiterId;
  const actorUser = actorUserId ? state.users.find((user) => user.id === actorUserId) : undefined;
  const actorName = notification.createdByName ?? notification.acceptedByName ?? actorUser?.name;

  if (!actorName) return null;

  return {
    label: actorUser?.role === "waiter" || sessionForNotification?.waiterId === actorUserId
      ? "Kellner"
      : "Mitarbeiter",
    name: actorName
  };
};

const productCategoryOrder: ProductCategory[] = ["starter", "main", "drinks", "dessert"];
const tableOrderTarget: OrderTarget = { type: "table" };
const designModeOptions: { mode: DesignMode; label: string }[] = [
  { mode: "modern", label: "Neu" },
  { mode: "classic", label: "Alt" }
];

const sessionStatusLabels: Record<string, string> = {
  serving: "In Bedienung",
  waiting: "Warten",
  "ready-to-bill": "Rechnung offen",
  closed: "Abgeschlossen"
};

const sessionStatusTones: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  serving: "navy",
  waiting: "red",
  "ready-to-bill": "green",
  closed: "green"
};

type FeedbackState =
  | {
      tone: "success" | "alert";
      message: string;
    }
  | undefined;

const formatAdminDateTime = (value: string) =>
  new Date(value).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  });

const getTimestamp = (value?: string) => {
  if (!value) return null;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const averageDuration = (durations: number[]) => {
  const validDurations = durations.filter((duration) => Number.isFinite(duration) && duration >= 0);
  if (validDurations.length === 0) return null;

  return validDurations.reduce((sum, duration) => sum + duration, 0) / validDurations.length;
};

const formatDuration = (durationMs: number | null) => {
  if (durationMs === null) return "Noch keine Daten";

  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  if (totalMinutes < 1) return "< 1 Min";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} Min`;
  if (minutes === 0) return `${hours} Std`;

  return `${hours} Std ${minutes} Min`;
};

const staffLoginBlankoRowCount = 16;

const createStaffLoginBlankoHtml = (createdAt: string) => {
  const rows = Array.from({ length: staffLoginBlankoRowCount }, (_, index) => `
      <tr>
        <td></td>
        <td></td>
        <td></td>
      </tr>`).join("");

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Mitarbeiter-Logins Blanko</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        background: #ffffff;
      }
      .sheet {
        width: 100%;
      }
      header {
        display: grid;
        gap: 4px;
        padding-bottom: 12px;
        border-bottom: 2px solid #111827;
      }
      header span,
      header p,
      footer {
        color: #4b5563;
        font-size: 13px;
      }
      h1 {
        margin: 0;
        font-size: 25px;
        letter-spacing: 0;
      }
      p {
        margin: 0;
      }
      table {
        width: 100%;
        margin-top: 14px;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 14px;
      }
      th,
      td {
        border: 1px solid #cbd5e1;
        padding: 9px 10px;
        text-align: left;
        vertical-align: middle;
      }
      th {
        background: #eef2f7;
        font-weight: 800;
      }
      th:nth-child(1) { width: 36%; }
      th:nth-child(2) { width: 46%; }
      th:nth-child(3) { width: 18%; }
      td {
        height: 38px;
      }
      footer {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px solid #d1d5db;
      }
      @media print {
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <header>
        <span>KiJu Gastro Order System</span>
        <h1>Mitarbeiter-Logins Blanko</h1>
        <p>Name, Benutzername (Spitzname) und PIN handschriftlich eintragen · Stand ${createdAt}</p>
      </header>

      <table aria-label="Mitarbeiter-Logins Blanko">
        <thead>
          <tr>
            <th>Name</th>
            <th>Benutzername (Spitzname)</th>
            <th>PIN</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>

      <footer>
        <span>Keine Passwörter eintragen.</span>
        <span>${staffLoginBlankoRowCount} freie Zeilen</span>
      </footer>
    </main>
  </body>
</html>`;
};

const playAdminReceiptAlarm = async () => {
  if (typeof window === "undefined") return;

  navigator.vibrate?.([220, 80, 220, 80, 360]);

  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const audioContext = new AudioContextConstructor();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const startTime = audioContext.currentTime;
    const beeps = [
      { offset: 0, frequency: 880 },
      { offset: 0.26, frequency: 740 },
      { offset: 0.52, frequency: 980 },
      { offset: 0.92, frequency: 880 }
    ];

    beeps.forEach(({ offset, frequency }) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const beepStart = startTime + offset;
      const beepEnd = beepStart + 0.18;

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, beepStart);
      gain.gain.setValueAtTime(0.001, beepStart);
      gain.gain.exponentialRampToValueAtTime(0.22, beepStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, beepEnd);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(beepStart);
      oscillator.stop(beepEnd + 0.02);
    });

    window.setTimeout(() => {
      void audioContext.close();
    }, 1500);
  } catch {
    // Browser blockieren Audio manchmal ohne Nutzerinteraktion. Das Popup bleibt sichtbar.
  }
};

export const AdminPanel = () => {
  const { state, actions, currentUser, unreadNotifications } = useDemoApp();
  const router = useRouter();
  const closedSessions = useMemo(() => buildClosedSessions(state), [state]);
  const [feedback, setFeedback] = useState<FeedbackState>();
  const [canUndoDailyReset, setCanUndoDailyReset] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    category: "drinks" as ProductCategory,
    drinkSubcategory: "",
    price: "0.00",
    taxRate: "19",
    productionTarget: "service" as ProductionTarget,
    supportsExtraIngredients: false
  });
  const [extraIngredientForm, setExtraIngredientForm] = useState({
    name: "",
    price: "0.00"
  });
  const [userForm, setUserForm] = useState({
    name: "",
    username: "",
    role: "waiter" as Role,
    password: "",
    pin: ""
  });
  const [userDrafts, setUserDrafts] = useState<
    Record<
      string,
      {
        name: string;
        username: string;
        role: Role;
        password: string;
        pin: string;
        active: boolean;
      }
    >
  >({});
  const [tableForm, setTableForm] = useState({
    name: "",
    seatCount: "4",
    active: true,
    note: ""
  });
  const [dashboardProductByTable, setDashboardProductByTable] = useState<Record<string, string>>({});
  const [adminPrintMode, setAdminPrintMode] = useState<"staff-logins" | null>(null);
  const [isLiveDashboardOpen, setIsLiveDashboardOpen] = useState(false);
  const [liveDashboardClock, setLiveDashboardClock] = useState(() => new Date());
  const playedReceiptAlarmIdsRef = useRef<Set<string>>(new Set());
  const liveDashboardRef = useRef<HTMLDivElement | null>(null);

  const productUsage = useMemo(() => {
    const usage = new Map<string, { open: number; closed: number }>();

    state.sessions.forEach((session) => {
      session.items.forEach((item) => {
        const current = usage.get(item.productId) ?? { open: 0, closed: 0 };
        if (session.status === "closed") {
          current.closed += item.quantity;
        } else {
          current.open += item.quantity;
        }
        usage.set(item.productId, current);
      });
    });

    return usage;
  }, [state.sessions]);

  const userAssignments = useMemo(() => {
    const usage = new Map<string, number>();

    state.sessions.forEach((session) => {
      usage.set(session.waiterId, (usage.get(session.waiterId) ?? 0) + 1);
    });

    return usage;
  }, [state.sessions]);

  const tableAssignments = useMemo(() => {
    const usage = new Map<string, { sessions: number; items: number; closed: number }>();

    state.tables.forEach((table) => {
      usage.set(table.id, { sessions: 0, items: 0, closed: 0 });
    });

    state.sessions.forEach((session) => {
      const current = usage.get(session.tableId) ?? { sessions: 0, items: 0, closed: 0 };
      current.sessions += 1;
      current.items += session.items.length;
      if (session.status === "closed") {
        current.closed += 1;
      }
      usage.set(session.tableId, current);
    });

    return usage;
  }, [state.sessions, state.tables]);

  const groupedProducts = useMemo(
    () =>
      productCategoryOrder.map((category) => ({
        category,
        label: courseLabels[category],
        products: state.products
          .filter((product) => product.category === category)
          .sort((left, right) => left.name.localeCompare(right.name, "de"))
      })),
    [state.products]
  );
  const dashboardProducts = useMemo(
    () =>
      productCategoryOrder.flatMap((category) =>
        state.products
          .filter((product) => product.category === category)
          .sort((left, right) => left.name.localeCompare(right.name, "de"))
      ),
    [state.products]
  );
  const extraIngredients = useMemo(
    () =>
      [...(state.extraIngredients ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name, "de")
      ),
    [state.extraIngredients]
  );

  const adminCount = useMemo(
    () => state.users.filter((user) => user.role === "admin").length,
    [state.users]
  );
  const activeAdminCount = useMemo(
    () => state.users.filter((user) => user.role === "admin" && user.active).length,
    [state.users]
  );
  const staffLoginUsers = useMemo(
    () =>
      [...state.users]
        .filter((user) => isStaffLoginRole(user.role))
        .sort((left, right) => {
          const roleComparison =
            staffLoginRoleOrder[left.role as StaffLoginRole] -
            staffLoginRoleOrder[right.role as StaffLoginRole];
          if (roleComparison !== 0) return roleComparison;
          if (left.active !== right.active) return left.active ? -1 : 1;
          return left.name.localeCompare(right.name, "de");
        }),
    [state.users]
  );
  const staffLoginPrintDate = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date());
  const openSessions = useMemo(
    () => state.sessions.filter((session) => session.status !== "closed"),
    [state.sessions]
  );
  const liveOpenTotal = useMemo(
    () =>
      openSessions.reduce(
        (sum, session) => sum + calculateSessionOpenTotal(session, state.products),
        0
      ),
    [openSessions, state.products]
  );
  const liveProductionStatus = useMemo(() => {
    const kitchenOpen = state.sessions.reduce(
      (sum, session) =>
        sum + session.kitchenTicketBatches.filter((batch) => batch.status !== "completed").length,
      0
    );
    const barOpen = state.sessions.reduce(
      (sum, session) =>
        sum + session.barTicketBatches.filter((batch) => batch.status !== "completed").length,
      0
    );
    const waitingTables = openSessions.filter((session) => session.status === "waiting").length;
    const checkoutTables = openSessions.filter((session) => session.status === "ready-to-bill").length;

    return { kitchenOpen, barOpen, waitingTables, checkoutTables };
  }, [openSessions, state.sessions]);
  const liveTimingMetrics = useMemo(() => {
    const now = Date.now();
    const orderToProductionDurations: number[] = [];
    const productionDurations: number[] = [];
    const deliveryDurations: number[] = [];
    const occupancyDurations: number[] = [];
    const completedOrderDurations: number[] = [];
    const itemCountsByProduct = new Map<string, number>();

    state.sessions.forEach((session) => {
      const firstItemCreatedAt = Math.min(
        ...session.items
          .map((item) => getTimestamp(item.createdAt) ?? getTimestamp(item.sentAt))
          .filter((timestamp): timestamp is number => timestamp !== null)
      );
      const hasFirstItemCreatedAt = Number.isFinite(firstItemCreatedAt);
      const closedAt = getTimestamp(session.receipt.closedAt);
      if (hasFirstItemCreatedAt) {
        occupancyDurations.push((closedAt ?? now) - firstItemCreatedAt);
      }

      session.items.forEach((item) => {
        if (isOrderItemCanceled(item)) return;

        itemCountsByProduct.set(
          item.productId,
          (itemCountsByProduct.get(item.productId) ?? 0) + item.quantity
        );

        const createdAt = getTimestamp(item.createdAt);
        const sentAt = getTimestamp(item.sentAt);
        const preparedAt = getTimestamp(item.preparedAt);
        const servedAt = getTimestamp(item.servedAt);

        if (createdAt !== null && sentAt !== null) {
          orderToProductionDurations.push(sentAt - createdAt);
        }
        if (sentAt !== null && preparedAt !== null) {
          productionDurations.push(preparedAt - sentAt);
        }
        if (preparedAt !== null && servedAt !== null) {
          deliveryDurations.push(servedAt - preparedAt);
        }
        if (createdAt !== null && servedAt !== null) {
          completedOrderDurations.push(servedAt - createdAt);
        }
      });
    });

    const topProductEntry = [...itemCountsByProduct.entries()].sort((left, right) => right[1] - left[1])[0];
    const topProduct = topProductEntry
      ? state.products.find((product) => product.id === topProductEntry[0])
      : undefined;
    const occupancyRate =
      state.tables.length > 0 ? Math.round((openSessions.length / state.tables.length) * 100) : 0;
    const activeServiceUsers = state.users.filter((user) => user.role === "waiter" && user.active).length;

    return {
      orderToProduction: averageDuration(orderToProductionDurations),
      production: averageDuration(productionDurations),
      delivery: averageDuration(deliveryDurations),
      occupancy: averageDuration(occupancyDurations),
      completedOrder: averageDuration(completedOrderDurations),
      topProductName: topProduct?.name ?? "Noch keine Daten",
      topProductCount: topProductEntry?.[1] ?? 0,
      occupancyRate,
      activeServiceUsers
    };
  }, [openSessions.length, state.products, state.sessions, state.tables.length, state.users]);
  const liveTimingChart = useMemo(() => {
    const chartItems = [
      {
        label: "Aufnahme",
        value: liveTimingMetrics.orderToProduction,
        legend: "Aufnahme bis Küche/Bar",
        color: "#22d3ee"
      },
      {
        label: "Produktion",
        value: liveTimingMetrics.production,
        legend: "Küche/Bar fertig",
        color: "#14b8a6"
      },
      {
        label: "Auslieferung",
        value: liveTimingMetrics.delivery,
        legend: "Fertig bis serviert",
        color: "#84cc16"
      },
      {
        label: "Tischzeit",
        value: liveTimingMetrics.occupancy,
        legend: "Ø Tischbelegung",
        color: "#94a3b8"
      }
    ];
    const valuesInMinutes = chartItems.map((item) =>
      item.value === null ? 0 : Math.max(0, Math.round(item.value / 60000))
    );
    const maxValue = Math.max(1, ...valuesInMinutes);
    const chartWidth = 720;
    const chartHeight = 260;
    const left = 46;
    const right = 28;
    const top = 24;
    const bottom = 212;
    const xStep = (chartWidth - left - right) / Math.max(1, chartItems.length - 1);
    const points = chartItems.map((item, index) => {
      const minutes = valuesInMinutes[index] ?? 0;
      const x = left + index * xStep;
      const y = bottom - (minutes / maxValue) * (bottom - top);

      return {
        ...item,
        minutes,
        x,
        y,
        display: formatDuration(item.value)
      };
    });
    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ");
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaPath =
      firstPoint && lastPoint
        ? `${linePath} L ${lastPoint.x.toFixed(1)} ${bottom} L ${firstPoint.x.toFixed(1)} ${bottom} Z`
        : "";
    const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: bottom - ratio * (bottom - top),
      label: `${Math.round(maxValue * ratio)} Min`
    }));

    return { chartHeight, chartWidth, gridTicks, points, linePath, areaPath };
  }, [
    liveTimingMetrics.delivery,
    liveTimingMetrics.occupancy,
    liveTimingMetrics.orderToProduction,
    liveTimingMetrics.production
  ]);
  const liveProductionDonut = useMemo(() => {
    const segments = [
      { label: "Küche offen", value: liveProductionStatus.kitchenOpen, color: "#22d3ee" },
      { label: "Bar offen", value: liveProductionStatus.barOpen, color: "#14b8a6" },
      { label: "Abrechnungsbereit", value: liveProductionStatus.checkoutTables, color: "#84cc16" },
      { label: "Hinweise", value: unreadNotifications.length, color: "#f59e0b" }
    ];
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    let cursor = 0;
    const background =
      total > 0
        ? `conic-gradient(${segments
            .map((segment) => {
              const start = cursor;
              const end = cursor + (segment.value / total) * 100;
              cursor = end;
              return `${segment.color} ${start}% ${end}%`;
            })
            .join(", ")})`
        : "conic-gradient(rgba(34, 211, 238, 0.28) 0% 100%)";

    return { background, segments, total };
  }, [
    liveProductionStatus.barOpen,
    liveProductionStatus.checkoutTables,
    liveProductionStatus.kitchenOpen,
    unreadNotifications.length
  ]);
  const sortedSessions = useMemo(
    () =>
      [...state.sessions].sort((left, right) => {
        if (left.status === "closed" && right.status !== "closed") return 1;
        if (left.status !== "closed" && right.status === "closed") return -1;
        return left.tableId.localeCompare(right.tableId, "de");
      }),
    [state.sessions]
  );
  const tablesNeedingAttention = useMemo(
    () =>
      state.sessions.filter(
        (session) =>
          session.status === "waiting" ||
          session.status === "ready-to-bill"
      ).length,
    [state.sessions]
  );
  const tableNames = useMemo(
    () => new Map(state.tables.map((table) => [table.id, table.name])),
    [state.tables]
  );
  const receiptAlarmNotifications = useMemo(
    () =>
      unreadNotifications.filter(
        (notification) => notification.kind === "admin-receipt-alarm"
      ),
    [unreadNotifications]
  );
  const activeReceiptAlarm = receiptAlarmNotifications[0] ?? null;
  const activeReceiptAlarmActor = activeReceiptAlarm
    ? resolveNotificationActor(state, activeReceiptAlarm)
    : null;

  useEffect(() => {
    if (!activeReceiptAlarm || playedReceiptAlarmIdsRef.current.has(activeReceiptAlarm.id)) {
      return;
    }

    playedReceiptAlarmIdsRef.current.add(activeReceiptAlarm.id);
    void playAdminReceiptAlarm();
  }, [activeReceiptAlarm]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setAdminPrintMode(null);
    };

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  useEffect(() => {
    if (!isLiveDashboardOpen) return;

    setLiveDashboardClock(new Date());
    const clockId = window.setInterval(() => {
      setLiveDashboardClock(new Date());
    }, 1000);

    return () => window.clearInterval(clockId);
  }, [isLiveDashboardOpen]);

  const openLiveDashboard = () => {
    setIsLiveDashboardOpen(true);
    window.requestAnimationFrame(() => {
      const fullscreenRequest = liveDashboardRef.current?.requestFullscreen?.();
      void fullscreenRequest?.catch(() => undefined);
    });
  };

  const closeLiveDashboard = () => {
    if (document.fullscreenElement === liveDashboardRef.current) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    setIsLiveDashboardOpen(false);
  };

  const handleOpenWorkspace = (role: StaffLoginRole) => {
    const targetUser = state.users.find((user) => user.role === role && user.active);
    if (!targetUser) {
      setFeedback({
        tone: "alert",
        message: workspaceMissingMessages[role]
      });
      return;
    }

    const result = actions.login(targetUser.username, targetUser.password);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? workspaceOpenMessages[role]
      });
      return;
    }

    router.push(workspaceRouteByRole[role]);
  };

  const handlePrintStaffLogins = () => {
    if (staffLoginUsers.length === 0) {
      setFeedback({
        tone: "alert",
        message: "Es gibt aktuell keine Service-, Küchen- oder Barkonten für den Ausdruck."
      });
      return;
    }

    setAdminPrintMode("staff-logins");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const handleDownloadStaffLoginBlanko = () => {
    const html = createStaffLoginBlankoHtml(staffLoginPrintDate);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    setAdminPrintMode(null);
    link.href = url;
    link.download = "mitarbeiter-logins-blanko.html";
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setFeedback({
      tone: "success",
      message: "Blanko-Liste wurde heruntergeladen."
    });
  };

  const handleDashboardProductChange = (tableId: string, productId: string) => {
    setDashboardProductByTable((current) => ({
      ...current,
      [tableId]: productId
    }));
  };

  const handleDashboardAddItem = (tableId: string) => {
    const productId = dashboardProductByTable[tableId] ?? dashboardProducts[0]?.id;
    if (!productId) {
      setFeedback({
        tone: "alert",
        message: "Es gibt aktuell keine Leistung, die gebucht werden kann."
      });
      return;
    }

    actions.addItem(tableId, tableOrderTarget, productId);
    setFeedback({ tone: "success", message: "Leistung wurde auf den Tisch gebucht." });
  };

  const handleDashboardPrintReceipt = async (session: OrderSession) => {
    if (session.items.length === 0) {
      setFeedback({
        tone: "alert",
        message: "Für diesen Tisch sind noch keine Leistungen gebucht."
      });
      return;
    }

    const mode = session.receipt.printedAt ? "reprint" : "receipt";
    const openedAt = new Date().toISOString();
    const tableName =
      state.tables.find((table) => table.id === session.tableId)?.name ??
      session.tableId.replace("table-", "Tisch ");
    const receipt = buildReceiptDocumentFromSessions({
      sessions: [session],
      products: state.products,
      scope: "table",
      tableLabelsById: { [session.tableId]: tableName },
      openedAt
    });

    if (mode === "reprint") {
      actions.reprintReceipt(session.tableId, [session.id]);
    } else {
      actions.printReceipt(session.tableId, [session.id]);
    }

    const result = await createPrintJob({
      type: mode,
      receipt,
      tableId: session.tableId,
      tableLabel: tableName
    });

    setFeedback({
      tone: result.ok ? "success" : "alert",
      message: result.ok
        ? `${tableName} wurde an den Netzwerkdrucker gesendet.`
        : result.message ?? "Bon konnte nicht an den Netzwerkdrucker gesendet werden."
    });
  };

  const handleUserDraftChange = (
    userId: string,
    patch: Partial<{
      name: string;
      username: string;
      role: Role;
      password: string;
      pin: string;
      active: boolean;
    }>
  ) => {
    const baseUser = state.users.find((entry) => entry.id === userId);
    if (!baseUser) return;

    setUserDrafts((current) => ({
      ...current,
      [userId]: {
        name: current[userId]?.name ?? baseUser.name,
        username: current[userId]?.username ?? baseUser.username,
        role: current[userId]?.role ?? baseUser.role,
        password: current[userId]?.password ?? baseUser.password,
        pin: current[userId]?.pin ?? (baseUser.pin ?? ""),
        active: current[userId]?.active ?? baseUser.active,
        ...patch
      }
    }));
  };

  const handleSaveUser = (userId: string) => {
    const draft = userDrafts[userId];
    const baseUser = state.users.find((entry) => entry.id === userId);
    if (!draft || !baseUser) return;

    const result = actions.updateUser(userId, {
      name: draft.name,
      username: draft.username,
      role: draft.role,
      password: draft.password,
      pin: draft.pin,
      active: draft.active
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Mitarbeiter konnte nicht gespeichert werden."
      });
      return;
    }

    setUserDrafts((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    setFeedback({
      tone: "success",
      message: `Mitarbeiterdaten für ${draft.name || baseUser.name} wurden gespeichert.`
    });
  };

  const handleDailyReset = () => {
    const confirmed = window.confirm(
      "Tagesstand wirklich zurücksetzen? Umsatz heute wird auf 0 gesetzt und offene Bestellungen werden geschlossen."
    );
    if (!confirmed) return;

    const result = actions.resetDailyState();
    setCanUndoDailyReset(result.ok);
    setUserDrafts({});
    setFeedback({
      tone: "success",
      message:
        result.closedSessions > 0
          ? `Tagesstand zurückgesetzt. ${result.closedSessions} offene Bestellungen wurden geschlossen.`
          : "Tagesstand zurückgesetzt. Es waren keine offenen Bestellungen vorhanden."
    });
  };

  const handleUndoDailyReset = () => {
    const result = actions.undoDailyStateReset();
    setCanUndoDailyReset(false);
    setFeedback({
      tone: result.ok ? "success" : "alert",
      message: result.ok
        ? "Der letzte Tagesreset wurde rückgängig gemacht."
        : result.message ?? "Der Tagesreset konnte nicht rückgängig gemacht werden."
    });
  };

  const handleCreateProduct = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = actions.createProduct({
      name: productForm.name,
      description: productForm.description,
      category: productForm.category,
      drinkSubcategory: productForm.drinkSubcategory,
      priceCents: Math.round(Number(productForm.price || "0") * 100),
      taxRate: Number(productForm.taxRate || "0"),
      productionTarget: productForm.productionTarget,
      supportsExtraIngredients: productForm.supportsExtraIngredients
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Leistung konnte nicht angelegt werden."
      });
      return;
    }

    setProductForm({
      name: "",
      description: "",
      category: "drinks",
      drinkSubcategory: "",
      price: "0.00",
      taxRate: "19",
      productionTarget: "service",
      supportsExtraIngredients: false
    });
    setFeedback({ tone: "success", message: "Leistung erfolgreich angelegt." });
  };

  const handleCreateExtraIngredient = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = actions.createExtraIngredient({
      name: extraIngredientForm.name,
      priceDeltaCents: Math.round(Number(extraIngredientForm.price || "0") * 100)
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Extra-Zutat konnte nicht angelegt werden."
      });
      return;
    }

    setExtraIngredientForm({
      name: "",
      price: "0.00"
    });
    setFeedback({ tone: "success", message: "Extra-Zutat erfolgreich angelegt." });
  };

  const handleDeleteProduct = (productId: string) => {
    const result = actions.deleteProduct(productId);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Leistung konnte nicht gelöscht werden."
      });
      return;
    }

    setFeedback({
      tone: "success",
      message: "Leistung wurde vollständig aus Stammdaten und Bestellungen entfernt."
    });
  };

  const handleCreateUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = actions.createUser({
      name: userForm.name,
      username: userForm.username,
      role: userForm.role,
      password: userForm.password,
      pin: userForm.pin
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Benutzer konnte nicht angelegt werden."
      });
      return;
    }

    setUserForm({
      name: "",
      username: "",
      role: "waiter",
      password: "",
      pin: ""
    });
    setFeedback({ tone: "success", message: "Benutzer erfolgreich angelegt." });
  };

  const handleDeleteUser = (userId: string) => {
    const result = actions.deleteUser(userId);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Benutzer konnte nicht gelöscht werden."
      });
      return;
    }

    setUserDrafts((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    setFeedback({ tone: "success", message: "Benutzer wurde gelöscht." });
  };

  const handleCreateTable = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = actions.createTable({
      name: tableForm.name,
      seatCount: Number(tableForm.seatCount || "0"),
      active: tableForm.active,
      note: tableForm.note
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Tisch konnte nicht angelegt werden."
      });
      return;
    }

    setTableForm({
      name: "",
      seatCount: "4",
      active: true,
      note: ""
    });
    setFeedback({ tone: "success", message: "Tisch erfolgreich angelegt." });
  };

  const handleDeleteTable = (tableId: string) => {
    const result = actions.removeTableAndServices(tableId);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Tisch konnte nicht gelöscht werden."
      });
      return;
    }

    setFeedback({ tone: "success", message: "Tisch samt Leistungen wurde gelöscht." });
  };

  const handleServiceOrderModeChange = (mode: ServiceOrderMode) => {
    actions.setServiceOrderMode(mode);
    setFeedback({
      tone: "success",
      message:
        mode === "table"
          ? "Bestellmodus auf ganzen Tisch umgestellt."
          : "Bestellmodus auf Sitzplätze umgestellt."
    });
  };

  const handleSeatVisibleChange = (tableId: string, seatId: string, visible: boolean) => {
    actions.setSeatVisible(tableId, seatId, visible);
    setFeedback({
      tone: "success",
      message: visible
        ? "Sitzplatz ist wieder im Service sichtbar."
        : "Sitzplatz ausgeblendet; offene Positionen wurden auf den Tisch verschoben."
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    const result = actions.deleteSession(sessionId);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Bestellung konnte nicht gelöscht werden."
      });
      return;
    }

    setFeedback({ tone: "success", message: "Bestellung wurde gelöscht." });
  };

  const handleDismissNotification = (notificationId: string) => {
    actions.markNotificationRead(notificationId, "shared-dismiss");
    setFeedback({ tone: "success", message: "Hinweis wurde dauerhaft gelöscht." });
  };

  const handleDesignModeChange = (mode: DesignMode) => {
    actions.setDesignMode(mode);
    setFeedback({
      tone: "success",
      message:
        mode === "modern"
          ? "Neues Design ist jetzt auf allen Geräten aktiv."
          : "Altes Design ist jetzt auf allen Geräten aktiv."
    });
  };

  const liveDashboardTime = liveDashboardClock.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const liveDashboardDate = liveDashboardClock.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return (
    <RouteGuard allowedRoles={["admin"]}>
      <main className="kiju-page kiju-admin-shell">
        <section className="kiju-admin-hero">
          <div className="kiju-admin-hero__copy">
            <span className="kiju-eyebrow">Executive Cockpit</span>
            <h1>Admin-Cockpit für Betrieb, Service und Abrechnung.</h1>
            <p>
              Alle Stammdaten, Tische, Bestellungen und Abschlüsse an einem Ort. Die
              Arbeitsbereiche bleiben standardmäßig eingeklappt und öffnen sich nur dann, wenn du
              sie wirklich brauchst.
            </p>
          </div>
          <div className="kiju-admin-hero__actions">
            <div className="kiju-design-switch" role="group" aria-label="Design wählen">
              <span>Design</span>
              {designModeOptions.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  className={`kiju-design-switch__button ${
                    state.designMode === option.mode ? "is-active" : ""
                  }`}
                  aria-pressed={state.designMode === option.mode}
                  onClick={() => handleDesignModeChange(option.mode)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={openLiveDashboard}
            >
              <MonitorUp size={18} />
              Live-Dashboard
            </button>
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => handleOpenWorkspace("waiter")}
            >
              <LayoutGrid size={18} />
              Service
            </button>
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => handleOpenWorkspace("kitchen")}
            >
              <ChefHat size={18} />
              Küche
            </button>
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => handleOpenWorkspace("bar")}
            >
              <Bell size={18} />
              Bar
            </button>
            <RoleSwitchPopover />
          </div>
        </section>

        <section className="kiju-admin-toolbar">
          <div className="kiju-admin-link-pills">
            <a className="kiju-admin-link-pill" href="#cockpit">
              Cockpit
            </a>
            <button
              type="button"
              className="kiju-admin-link-pill"
              onClick={openLiveDashboard}
            >
              Live-Dashboard
            </button>
            <a className="kiju-admin-link-pill" href="#tisch-dashboard">
              Tisch-Dashboard
            </a>
            <a className="kiju-admin-link-pill" href="#drucker">
              Drucker
            </a>
            <a className="kiju-admin-link-pill" href="#changelog">
              Changelog
            </a>
            <a className="kiju-admin-link-pill" href="#hinweise">
              Hinweise
            </a>
            <a className="kiju-admin-link-pill" href="#leistungen">
              Leistungen
            </a>
            <a className="kiju-admin-link-pill" href="#mitarbeiter">
              Mitarbeiter
            </a>
            <a className="kiju-admin-link-pill" href="#tische">
              Tische
            </a>
            <a className="kiju-admin-link-pill" href="#bestellungen">
              Bestellungen
            </a>
            <a className="kiju-admin-link-pill" href="#tagesreset">
              Tagesreset
            </a>
          </div>
          <div className="kiju-admin-status-pills">
            <span className="kiju-admin-mini-pill">
              <Users size={14} />
              {currentUser?.name ?? "Admin"} · {roleLabels[currentUser?.role ?? "admin"]}
            </span>
            <span className="kiju-admin-mini-pill">
              <Bell size={14} />
              {unreadNotifications.length} Hinweise
            </span>
            <span className="kiju-admin-mini-pill">
              <ReceiptText size={14} />
              {closedSessions.length} Abschlüsse
            </span>
          </div>
        </section>

        {feedback ? (
          <div className={`kiju-admin-feedback is-${feedback.tone}`}>
            <strong>{feedback.tone === "success" ? "Erfolgreich" : "Hinweis"}</strong>
            <span>{feedback.message}</span>
          </div>
        ) : null}

        {activeReceiptAlarm ? (
          <aside
            className="kiju-admin-receipt-alarm"
            role="alertdialog"
            aria-labelledby="kiju-admin-receipt-alarm-title"
            aria-describedby="kiju-admin-receipt-alarm-body"
          >
            <div className="kiju-admin-receipt-alarm__icon">
              <AlertTriangle size={34} />
            </div>
            <div className="kiju-admin-receipt-alarm__body">
              <span>Abrechnung</span>
              <h2 id="kiju-admin-receipt-alarm-title">{activeReceiptAlarm.title}</h2>
              <p id="kiju-admin-receipt-alarm-body">{activeReceiptAlarm.body}</p>
              {activeReceiptAlarmActor ? (
                <small>
                  {activeReceiptAlarmActor.label}: {activeReceiptAlarmActor.name}
                </small>
              ) : null}
              <small>Erfasst: {formatAdminDateTime(activeReceiptAlarm.createdAt)}</small>
            </div>
            <div className="kiju-admin-receipt-alarm__actions">
              <button
                type="button"
                className="kiju-button kiju-button--secondary"
                onClick={() =>
                  document.getElementById("hinweise")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                  })
                }
              >
                Hinweise öffnen
              </button>
              <button
                type="button"
                className="kiju-button kiju-button--primary"
                onClick={() => handleDismissNotification(activeReceiptAlarm.id)}
              >
                Alarm bestätigen
              </button>
            </div>
          </aside>
        ) : null}

        {isLiveDashboardOpen ? (
          <section
            ref={liveDashboardRef}
            className="kiju-admin-live-dashboard"
            aria-label="Live-Dashboard"
          >
            <header className="kiju-admin-live-dashboard__header">
              <div>
                <span className="kiju-admin-mini-pill">
                  <MonitorUp size={14} />
                  Live-Dashboard
                </span>
                <h2>Executive Cockpit</h2>
                <p>KiJu Betriebsmonitor · Liveanalyse über Service, Küche, Bar und Hinweise in Echtzeit.</p>
              </div>
              <div className="kiju-admin-live-dashboard__actions">
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={() => {
                    const fullscreenRequest = liveDashboardRef.current?.requestFullscreen?.();
                    void fullscreenRequest?.catch(() => undefined);
                  }}
                >
                  <Maximize2 size={18} />
                  Vollbild
                </button>
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={closeLiveDashboard}
                  aria-label="Live-Dashboard schließen"
                >
                  <X size={18} />
                  Schließen
                </button>
              </div>
            </header>

            <div className="kiju-admin-live-dashboard__filters" aria-label="Live-Dashboard Fokus">
              <div className="kiju-admin-live-filter-group">
                <span>Zeitraum</span>
                <strong className="kiju-admin-live-filter-chip">30 Tage</strong>
                <strong className="kiju-admin-live-filter-chip is-active">Heute</strong>
                <strong className="kiju-admin-live-filter-chip">Live</strong>
              </div>
              <div className="kiju-admin-live-filter-group">
                <span>Fokus</span>
                <strong className="kiju-admin-live-filter-chip is-active">Alles</strong>
                <strong className="kiju-admin-live-filter-chip">Service</strong>
                <strong className="kiju-admin-live-filter-chip">Küche</strong>
                <strong className="kiju-admin-live-filter-chip">Bar</strong>
              </div>
              <strong className="kiju-admin-live-filter-action">
                {liveDashboardDate} · {liveDashboardTime}
              </strong>
            </div>

            <div className="kiju-admin-live-dashboard__kpis">
              <article>
                <span>Umsatz heute</span>
                <strong>{euro(state.dailyStats.revenueCents)}</strong>
                <small>{state.dailyStats.servedTables} Abschlüsse · {state.dailyStats.servedGuests} Gäste</small>
              </article>
              <article>
                <span>Offen im Service</span>
                <strong>{euro(liveOpenTotal)}</strong>
                <small>{openSessions.length} laufende Bestellungen</small>
              </article>
              <article>
                <span>Produktion</span>
                <strong>{liveProductionStatus.kitchenOpen + liveProductionStatus.barOpen}</strong>
                <small>{liveProductionStatus.kitchenOpen} Küche · {liveProductionStatus.barOpen} Bar</small>
              </article>
              <article>
                <span>Hinweise</span>
                <strong>{unreadNotifications.length}</strong>
                <small>Küche, Service und Abrechnung</small>
              </article>
              <article>
                <span>Aufnahme bis Küche/Bar</span>
                <strong>{formatDuration(liveTimingMetrics.orderToProduction)}</strong>
                <small>Ø vom Buchen bis zum Senden</small>
              </article>
              <article>
                <span>Küche/Bar fertig</span>
                <strong>{formatDuration(liveTimingMetrics.production)}</strong>
                <small>Ø Produktionszeit je Position</small>
              </article>
              <article>
                <span>Auslieferung</span>
                <strong>{formatDuration(liveTimingMetrics.delivery)}</strong>
                <small>Ø von fertig bis serviert</small>
              </article>
              <article>
                <span>Bestellung gesamt</span>
                <strong>{formatDuration(liveTimingMetrics.completedOrder)}</strong>
                <small>Ø von Aufnahme bis am Tisch</small>
              </article>
              <article>
                <span>Tischbelegung</span>
                <strong>{formatDuration(liveTimingMetrics.occupancy)}</strong>
                <small>Ø aktive Tischzeit</small>
              </article>
              <article>
                <span>Auslastung</span>
                <strong>{liveTimingMetrics.occupancyRate}%</strong>
                <small>{openSessions.length} von {state.tables.length} Tischen aktiv</small>
              </article>
              <article>
                <span>Top-Artikel</span>
                <strong>{liveTimingMetrics.topProductCount}</strong>
                <small>{liveTimingMetrics.topProductName}</small>
              </article>
              <article>
                <span>Service-Team</span>
                <strong>{liveTimingMetrics.activeServiceUsers}</strong>
                <small>aktive Kellner im System</small>
              </article>
            </div>

            <div className="kiju-admin-live-dashboard__grid">
              <section className="kiju-admin-live-dashboard__panel kiju-admin-live-dashboard__panel--trend">
                <div className="kiju-admin-live-dashboard__panel-head">
                  <div>
                    <strong>Service-Zeitanalyse</strong>
                    <span>Aufnahme, Produktion und Auslieferung im direkten Verlauf.</span>
                  </div>
                  <span>Ø Bestellung: {formatDuration(liveTimingMetrics.completedOrder)}</span>
                </div>
                <div className="kiju-admin-live-chart">
                  <svg
                    viewBox={`0 0 ${liveTimingChart.chartWidth} ${liveTimingChart.chartHeight}`}
                    role="img"
                    aria-label="Durchschnittliche Betriebszeiten"
                  >
                    <defs>
                      <linearGradient id="kiju-live-chart-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.42" />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>
                    {liveTimingChart.gridTicks.map((tick) => (
                      <g key={`grid-${tick.label}`}>
                        <line x1="46" x2="692" y1={tick.y} y2={tick.y} />
                        <text x="18" y={tick.y + 4}>
                          {tick.label}
                        </text>
                      </g>
                    ))}
                    <path d={liveTimingChart.areaPath} className="kiju-admin-live-chart__area" />
                    <path d={liveTimingChart.linePath} className="kiju-admin-live-chart__line" />
                    {liveTimingChart.points.map((point) => (
                      <g key={point.label}>
                        <circle cx={point.x} cy={point.y} r="5" />
                        <text x={point.x} y="238" textAnchor="middle">
                          {point.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                  <div className="kiju-admin-live-chart__legend">
                    {liveTimingChart.points.map((point) => (
                      <span key={point.legend}>
                        <i style={{ background: point.color }} />
                        {point.legend}: {point.display}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <section className="kiju-admin-live-dashboard__panel kiju-admin-live-dashboard__panel--status">
                <div className="kiju-admin-live-dashboard__panel-head">
                  <strong>Produktionsstatus</strong>
                  <span>Gesamt: {liveProductionDonut.total}</span>
                </div>
                <div className="kiju-admin-live-donut-layout">
                  <div
                    className="kiju-admin-live-donut"
                    style={{ background: liveProductionDonut.background }}
                    aria-label={`${liveProductionDonut.total} offene Betriebssignale`}
                  >
                    <div>
                      <strong>{liveProductionDonut.total}</strong>
                      <span>Signale</span>
                    </div>
                  </div>
                  <div className="kiju-admin-live-donut-legend">
                    {liveProductionDonut.segments.map((segment) => (
                      <span key={segment.label}>
                        <i style={{ background: segment.color }} />
                        {segment.label}
                        <strong>{segment.value}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <section className="kiju-admin-live-dashboard__panel kiju-admin-live-dashboard__panel--alerts">
                <div className="kiju-admin-live-dashboard__panel-head">
                  <strong>Aktuelle Hinweise</strong>
                  <span>{unreadNotifications.length} offen</span>
                </div>
                <div className="kiju-admin-live-list">
                  {unreadNotifications.length === 0 ? (
                    <article>
                      <strong>Keine offenen Hinweise</strong>
                      <span>Der Betrieb läuft ohne offene Meldungen.</span>
                    </article>
                  ) : (
                    unreadNotifications.slice(0, 4).map((notification) => {
                      const actor = resolveNotificationActor(state, notification);
                      const tableName = notification.tableId
                        ? tableNames.get(notification.tableId) ?? notification.tableId
                        : "Betrieb";

                      return (
                        <article key={notification.id}>
                          <strong>{notification.title}</strong>
                          <span>{notification.body}</span>
                          <small>
                            {tableName}
                            {actor ? ` · ${actor.label}: ${actor.name}` : ""}
                          </small>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        <section id="cockpit" className="kiju-admin-kpi-grid">
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Umsatz heute</span>
            <strong>{euro(state.dailyStats.revenueCents)}</strong>
            <small>{state.dailyStats.servedTables} Tische abgeschlossen</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Offene Bestellungen</span>
            <strong>{openSessions.length}</strong>
            <small>{tablesNeedingAttention} benötigen direkte Aufmerksamkeit</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Aktive Tische</span>
            <strong>{state.tables.filter((table) => table.active).length}</strong>
            <small>von {state.tables.length} hinterlegten Tischen</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Leistungen</span>
            <strong>{state.products.length}</strong>
            <small>mit Preisen, Kategorien und Produktionszielen</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Aktive Admins</span>
            <strong>{activeAdminCount}</strong>
            <small>{adminCount} Admin-Konten insgesamt</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Offene Hinweise</span>
            <strong>{unreadNotifications.length}</strong>
            <small>Küche, Service und Abrechnung live synchronisiert</small>
          </article>
        </section>

        <SectionCard
          title="Betriebsfokus"
          eyebrow="Live-Überblick"
          className="kiju-admin-section-card"
          action={<StatusPill label={`${state.sessions.length} Sessions`} tone="navy" />}
        >
          <div className="kiju-admin-focus-grid">
            <div className="kiju-admin-focus-list">
              <strong>Dringende Hinweise</strong>
              {unreadNotifications.length === 0 ? (
                <div className="kiju-inline-panel">
                  <span>Aktuell sind keine ungelesenen Hinweise offen.</span>
                </div>
              ) : (
                unreadNotifications.slice(0, 4).map((notification) => {
                  const actor = resolveNotificationActor(state, notification);

                  return (
                    <article key={notification.id} className="kiju-admin-focus-item">
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                      {actor ? (
                        <span>
                          {actor.label}: {actor.name}
                        </span>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>

            <div className="kiju-admin-focus-list">
              <strong>Letzte Abschlüsse</strong>
              {closedSessions.length === 0 ? (
                <div className="kiju-inline-panel">
                  <span>Noch keine abgeschlossenen Bestellungen vorhanden.</span>
                </div>
              ) : (
                closedSessions.slice(0, 4).map((session) => {
                  const tableName =
                    state.tables.find((table) => table.id === session.tableId)?.name ??
                    session.tableId.replace("table-", "Tisch ");

                  return (
                    <article key={session.id} className="kiju-admin-focus-item">
                      <strong>{tableName}</strong>
                      <span>
                        {calculateGuestCount(session)} Gäste ·{" "}
                        {euro(calculateSessionTotal(session, state.products))}
                      </span>
                    </article>
                  );
                })
              )}
            </div>

            <div className="kiju-admin-focus-list">
              <strong>Teamstatus</strong>
              <article className="kiju-admin-focus-item">
                <strong>Service</strong>
                <span>
                  {
                    state.users.filter((user) => user.role === "waiter" && user.active).length
                  } aktive Kellner
                </span>
              </article>
              <article className="kiju-admin-focus-item">
                <strong>Küche</strong>
                <span>
                  {
                    state.users.filter((user) => user.role === "kitchen" && user.active).length
                  } aktive Küchenkonten
                </span>
              </article>
              <article className="kiju-admin-focus-item">
                <strong>Bar</strong>
                <span>
                  {state.users.filter((user) => user.role === "bar" && user.active).length} aktive Barkonten
                </span>
              </article>
              <article className="kiju-admin-focus-item">
                <strong>Tagesreset</strong>
                <span>
                  {openSessions.length} offene {openSessions.length === 1 ? "Bestellung" : "Bestellungen"}
                </span>
              </article>
            </div>
          </div>
        </SectionCard>

        <div id="tisch-dashboard">
          <AccordionSection
            title="Tisch-Dashboard"
            eyebrow="Buchungen, Bearbeitung und Rechnungen"
            defaultOpen
            className="kiju-admin-accordion"
            action={<StatusPill label={`${state.tables.length} Tische`} tone="navy" />}
          >
            <div className="kiju-admin-table-dashboard">
              {state.tables.map((table) => {
                const session = getSessionForTable(state.sessions, table.id);
                const bookedBy = session
                  ? state.users.find((user) => user.id === session.waiterId)
                  : undefined;
                const itemCount =
                  session?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
                const selectedProductId =
                  dashboardProductByTable[table.id] ?? dashboardProducts[0]?.id ?? "";

                return (
                  <article key={table.id} className="kiju-admin-table-dashboard-card">
                    <header className="kiju-admin-table-dashboard-card__header">
                      <div className="kiju-admin-heading-stack">
                        <strong>{table.name}</strong>
                        <span>
                          {session
                            ? `Gebucht von ${bookedBy?.name ?? "Unbekannt"}`
                            : "Keine laufende Buchung"}
                        </span>
                      </div>
                      <div className="kiju-admin-action-row">
                        <StatusPill
                          label={session ? sessionStatusLabels[session.status] ?? "Aktiv" : "Frei"}
                          tone={
                            session
                              ? sessionStatusTones[session.status] ?? "slate"
                              : table.active
                                ? "green"
                                : "slate"
                          }
                        />
                        <StatusPill label={euro(calculateSessionTotal(session, state.products))} tone="slate" />
                      </div>
                    </header>

                    <div className="kiju-admin-table-dashboard-card__meta">
                      <span>{itemCount} {itemCount === 1 ? "Position" : "Positionen"}</span>
                      <span>{table.seatCount} Sitzplätze</span>
                      <span>{table.active ? "Im Service sichtbar" : "Nicht aktiv"}</span>
                    </div>

                    <div className="kiju-admin-booking-list">
                      {session && session.items.length > 0 ? (
                        session.items.map((item) => {
                          const product = state.products.find((entry) => entry.id === item.productId);
                          const itemTarget = item.target;
                          const targetLabel =
                            itemTarget.type === "seat"
                              ? table.seats.find((seat) => seat.id === itemTarget.seatId)?.label ??
                                "Sitzplatz"
                              : "Tisch";

                          return (
                            <div key={item.id} className="kiju-admin-booking-row">
                              <div className="kiju-admin-heading-stack">
                                <strong>{product?.name ?? resolveProductName(state.products, item.productId)}</strong>
                                <span>
                                  {courseLabels[item.category]} · {targetLabel}
                                </span>
                              </div>
                              <label className="kiju-inline-field">
                                <span>Menge</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="20"
                                  step="1"
                                  value={item.quantity}
                                  onChange={(event) =>
                                    actions.updateItem(table.id, item.id, {
                                      quantity: Number(event.target.value)
                                    })
                                  }
                                />
                              </label>
                              <label className="kiju-inline-field">
                                <span>Hinweis</span>
                                <input
                                  value={item.note ?? ""}
                                  onChange={(event) =>
                                    actions.updateItem(table.id, item.id, {
                                      note: event.target.value
                                    })
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="kiju-button kiju-button--danger"
                                onClick={() => actions.removeItem(table.id, item.id)}
                              >
                                <Trash2 size={16} />
                                Löschen
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="kiju-inline-panel">
                          <span>Auf diesem Tisch ist aktuell nichts gebucht.</span>
                        </div>
                      )}
                    </div>

                    <div className="kiju-admin-table-dashboard-card__actions">
                      <label className="kiju-inline-field">
                        <span>Leistung hinzufügen</span>
                        <select
                          value={selectedProductId}
                          onChange={(event) =>
                            handleDashboardProductChange(table.id, event.target.value)
                          }
                          disabled={dashboardProducts.length === 0}
                        >
                          {productCategoryOrder.map((category) => (
                            <optgroup key={category} label={courseLabels[category]}>
                              {dashboardProducts
                                .filter((product) => product.category === category)
                                .map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name} · {euro(product.priceCents)}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => handleDashboardAddItem(table.id)}
                        disabled={dashboardProducts.length === 0}
                      >
                        <PlusCircle size={16} />
                        Hinzufügen
                      </button>
                      <button
                        type="button"
                        className="kiju-button kiju-button--primary"
                        onClick={() => session && void handleDashboardPrintReceipt(session)}
                        disabled={!session || session.items.length === 0}
                      >
                        <Printer size={16} />
                        {session?.receipt.printedAt ? "Rechnung erneut drucken" : "Rechnung drucken"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </AccordionSection>
        </div>

        <div className="kiju-admin-stack">
          <PrinterAdminPanel />

          <div id="changelog">
            <AccordionSection
              title="Changelog"
              eyebrow="Tagesweiser Änderungsverlauf"
              defaultOpen={false}
              className="kiju-admin-accordion kiju-admin-changelog"
              action={<StatusPill label={`${adminChangelogEntries.length} Einträge`} tone="navy" />}
            >
              <div className="kiju-admin-changelog__hero">
                <div className="kiju-admin-heading-stack">
                  <span className="kiju-admin-mini-pill">
                    <ReceiptText size={14} />
                    Live-Changelog
                  </span>
                  <strong>Alle Änderungen im Betrieb nachvollziehbar</strong>
                  <span>
                    Vollständige Änderungshistorie in deutscher Sprache, nach Versionen gruppiert und
                    mit den wichtigsten Detailpunkten dokumentiert.
                  </span>
                </div>
                <div className="kiju-admin-changelog__stats">
                  <article>
                    <span>Sichtbar</span>
                    <strong>{adminChangelogEntries.length}</strong>
                    <small>Versionseinträge</small>
                  </article>
                  <article>
                    <span>Kategorien</span>
                    <strong>{changelogCategoryCount}</strong>
                    <small>Themenbereiche</small>
                  </article>
                  <article>
                    <span>Tage</span>
                    <strong>{changelogDayCount}</strong>
                    <small>Änderungstage</small>
                  </article>
                </div>
              </div>

              {latestChangelogEntry ? (
                <article className="kiju-admin-changelog__latest">
                  <div className="kiju-admin-row kiju-admin-row--top">
                    <div className="kiju-admin-heading-stack">
                      <span className="kiju-admin-changelog__date">{latestChangelogEntry.date}</span>
                      <strong>{latestChangelogEntry.title}</strong>
                      <span>{latestChangelogEntry.summary}</span>
                    </div>
                    <StatusPill label={`Neueste Version ${latestChangelogEntry.version}`} tone="green" />
                  </div>
                </article>
              ) : null}

              <div className="kiju-admin-changelog__timeline">
                {adminChangelogEntries.map((entry) => (
                  <article key={entry.version} className="kiju-admin-changelog-entry">
                    <div className="kiju-admin-changelog-entry__head">
                      <div className="kiju-admin-heading-stack">
                        <div className="kiju-admin-changelog-entry__meta">
                          <StatusPill label={entry.version} tone="navy" />
                          <StatusPill label={entry.type} tone="slate" />
                          <StatusPill label={`${entry.date} · ${entry.time}`} tone="slate" />
                        </div>
                        <strong>{entry.title}</strong>
                        <span>{entry.summary}</span>
                      </div>
                      <StatusPill label={`${entry.categories.length} Kategorien`} tone="slate" />
                    </div>

                    <div className="kiju-admin-changelog-entry__categories">
                      {entry.categories.map((category) => (
                        <span key={`${entry.version}-${category}`}>{category}</span>
                      ))}
                    </div>

                    <div className="kiju-admin-changelog-entry__changes">
                      {entry.changes.map((change) => (
                        <div key={`${entry.version}-${change}`}>
                          <CheckCircle2 size={16} />
                          <span>{change}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </AccordionSection>
          </div>

          <div id="hinweise">
            <AccordionSection
              title="Hinweise"
              eyebrow="Benachrichtigungen aus Küche, Service und Abrechnung"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={
                <StatusPill
                  label={`${unreadNotifications.length} offen`}
                  tone={unreadNotifications.length > 0 ? "amber" : "slate"}
                />
              }
            >
              <div className="kiju-admin-list">
                {unreadNotifications.length === 0 ? (
                  <div className="kiju-inline-panel">
                    <span>Aktuell sind keine offenen Benachrichtigungen vorhanden.</span>
                  </div>
                ) : (
                  unreadNotifications.map((notification) => {
                    const tableName = notification.tableId
                      ? tableNames.get(notification.tableId) ?? notification.tableId
                      : undefined;
                    const actor = resolveNotificationActor(state, notification);

                    return (
                      <article
                        key={notification.id}
                        className={`kiju-admin-panel ${
                          notification.kind === "admin-receipt-alarm" ? "is-receipt-alarm" : ""
                        }`.trim()}
                      >
                        <div className="kiju-admin-row kiju-admin-row--top">
                          <div className="kiju-admin-heading-stack">
                            <strong>{notification.title}</strong>
                            <span>{notification.body}</span>
                          </div>
                          <div className="kiju-admin-action-row">
                            <StatusPill
                              label={notificationToneLabels[notification.tone]}
                              tone={notificationTonePills[notification.tone]}
                            />
                            {tableName ? <StatusPill label={tableName} tone="slate" /> : null}
                            <button
                              type="button"
                              className="kiju-button kiju-button--secondary"
                              onClick={() => handleDismissNotification(notification.id)}
                            >
                              Löschen
                            </button>
                          </div>
                        </div>

                        <div className="kiju-admin-meta">
                          {actor ? (
                            <span>
                              {actor.label}: {actor.name}
                            </span>
                          ) : null}
                          <span>Erfasst: {formatAdminDateTime(notification.createdAt)}</span>
                          {tableName ? <span>Quelle: {tableName}</span> : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </AccordionSection>
          </div>

          <div id="leistungen">
            <AccordionSection
              title="Leistungen"
              eyebrow="Serviceleistungen, Preise und Kategorien"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label={`${state.products.length} Einträge`} tone="navy" />}
            >
              <div className="kiju-admin-layout">
                <div className="kiju-admin-list">
                  <form className="kiju-admin-panel" onSubmit={handleCreateProduct}>
                    <strong>Neue Leistung anlegen</strong>
                    <label className="kiju-inline-field">
                      <span>Name</span>
                      <input
                        value={productForm.name}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </label>
                    <label className="kiju-inline-field">
                      <span>Beschreibung</span>
                      <textarea
                        value={productForm.description}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            description: event.target.value
                          }))
                        }
                      />
                    </label>
                    <div className="kiju-admin-row">
                      <label className="kiju-inline-field">
                        <span>Kategorie</span>
                        <select
                          value={productForm.category}
                          onChange={(event) =>
                            setProductForm((current) => ({
                              ...current,
                              category: event.target.value as ProductCategory
                            }))
                          }
                        >
                          {productCategoryOrder.map((category) => (
                            <option key={category} value={category}>
                              {courseLabels[category]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="kiju-inline-field">
                        <span>Produktionsziel</span>
                        <select
                          value={productForm.productionTarget}
                          onChange={(event) =>
                            setProductForm((current) => ({
                              ...current,
                              productionTarget: event.target.value as ProductionTarget
                            }))
                          }
                        >
                          <option value="service">Service</option>
                          <option value="bar">Bar</option>
                          <option value="kitchen">Küche</option>
                        </select>
                      </label>
                    </div>
                    <label className="kiju-checkbox-row">
                      <input
                        type="checkbox"
                        checked={productForm.supportsExtraIngredients}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            supportsExtraIngredients: event.target.checked
                          }))
                        }
                      />
                      <span>Extra-Zutaten-Popup aktivieren</span>
                    </label>
                    {productForm.category === "drinks" ? (
                      <label className="kiju-inline-field">
                        <span>Getränkegruppe</span>
                        <input
                          value={productForm.drinkSubcategory}
                          placeholder="z. B. Alkoholfrei"
                          onChange={(event) =>
                            setProductForm((current) => ({
                              ...current,
                              drinkSubcategory: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    <div className="kiju-admin-row">
                      <label className="kiju-inline-field">
                        <span>Preis EUR</span>
                        <input
                          type="number"
                          min="0"
                          step="0.10"
                          value={productForm.price}
                          onChange={(event) =>
                            setProductForm((current) => ({ ...current, price: event.target.value }))
                          }
                        />
                      </label>
                      <label className="kiju-inline-field">
                        <span>Steuer %</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={productForm.taxRate}
                          onChange={(event) =>
                            setProductForm((current) => ({
                              ...current,
                              taxRate: event.target.value
                            }))
                          }
                        />
                      </label>
                    </div>
                    <button type="submit" className="kiju-button kiju-button--primary">
                      <PlusCircle size={18} />
                      Leistung anlegen
                    </button>
                  </form>

                  <article className="kiju-admin-panel">
                    <div className="kiju-admin-row kiju-admin-row--top">
                      <div className="kiju-admin-heading-stack">
                        <strong>Extra-Zutaten verwalten</strong>
                        <span>
                          Globaler Zutaten-Katalog für alle Artikel mit aktivem Extra-Zutaten-Popup.
                        </span>
                      </div>
                      <StatusPill
                        label={`${extraIngredients.length} ${
                          extraIngredients.length === 1 ? "Zutat" : "Zutaten"
                        }`}
                        tone="navy"
                      />
                    </div>

                    <form className="kiju-admin-list" onSubmit={handleCreateExtraIngredient}>
                      <div className="kiju-admin-row">
                        <label className="kiju-inline-field">
                          <span>Name</span>
                          <input
                            value={extraIngredientForm.name}
                            onChange={(event) =>
                              setExtraIngredientForm((current) => ({
                                ...current,
                                name: event.target.value
                              }))
                            }
                          />
                        </label>
                        <label className="kiju-inline-field">
                          <span>Aufpreis EUR</span>
                          <input
                            type="number"
                            min="0"
                            step="0.10"
                            value={extraIngredientForm.price}
                            onChange={(event) =>
                              setExtraIngredientForm((current) => ({
                                ...current,
                                price: event.target.value
                              }))
                            }
                          />
                        </label>
                      </div>

                      <button type="submit" className="kiju-button kiju-button--primary">
                        <PlusCircle size={18} />
                        Extra-Zutat anlegen
                      </button>
                    </form>

                    {extraIngredients.length > 0 ? (
                      <div className="kiju-admin-extra-ingredient-list">
                        {extraIngredients.map((ingredient) => (
                          <div key={ingredient.id} className="kiju-admin-extra-ingredient-row">
                            <label className="kiju-inline-field">
                              <span>Name</span>
                              <input
                                value={ingredient.name}
                                onChange={(event) =>
                                  actions.updateExtraIngredient(ingredient.id, {
                                    name: event.target.value
                                  })
                                }
                              />
                            </label>
                            <label className="kiju-inline-field">
                              <span>Aufpreis EUR</span>
                              <input
                                type="number"
                                min="0"
                                step="0.10"
                                value={(ingredient.priceDeltaCents / 100).toFixed(2)}
                                onChange={(event) =>
                                  actions.updateExtraIngredient(ingredient.id, {
                                    priceDeltaCents: Math.round(
                                      Number(event.target.value || "0") * 100
                                    )
                                  })
                                }
                              />
                            </label>
                            <label className="kiju-checkbox-row">
                              <input
                                type="checkbox"
                                checked={ingredient.active}
                                onChange={(event) =>
                                  actions.updateExtraIngredient(ingredient.id, {
                                    active: event.target.checked
                                  })
                                }
                              />
                              <span>Aktiv</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="kiju-inline-panel">
                        <span>Aktuell ist noch keine Extra-Zutat angelegt.</span>
                      </div>
                    )}
                  </article>
                </div>

                <div className="kiju-admin-list">
                  {groupedProducts.map(({ category, label, products }) => (
                    <section key={category} className="kiju-admin-category-group">
                      <div className="kiju-admin-category-group__header">
                        <div className="kiju-admin-heading-stack">
                          <strong>{label}</strong>
                          <span>
                            {products.length} {products.length === 1 ? "Leistung" : "Leistungen"}
                          </span>
                        </div>
                        <StatusPill
                          label={`${products.length} ${products.length === 1 ? "Eintrag" : "Einträge"}`}
                          tone="slate"
                        />
                      </div>

                      {products.length === 0 ? (
                        <div className="kiju-inline-panel">
                          <span>Aktuell ist in dieser Kategorie noch keine Leistung angelegt.</span>
                        </div>
                      ) : (
                        products.map((product) => {
                          const usage = productUsage.get(product.id) ?? { open: 0, closed: 0 };

                          return (
                            <AccordionSection
                              key={product.id}
                              title={product.name}
                              eyebrow={productionLabels[product.productionTarget]}
                              defaultOpen={false}
                              className="kiju-admin-accordion kiju-admin-product-accordion"
                              contentClassName="kiju-admin-product-accordion__content"
                              action={
                                <>
                                  <StatusPill label={courseLabels[product.category]} tone="navy" />
                                  <StatusPill label={euro(product.priceCents)} tone="slate" />
                                </>
                              }
                            >
                              <div className="kiju-admin-row kiju-admin-row--top">
                                <div className="kiju-admin-heading-stack">
                                  <strong>Leistung bearbeiten</strong>
                                  <span>
                                    Offen genutzt: {usage.open} · Historisch genutzt: {usage.closed}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="kiju-button kiju-button--danger"
                                  onClick={() => handleDeleteProduct(product.id)}
                                >
                                  <Trash2 size={16} />
                                  Löschen
                                </button>
                              </div>

                              <div className="kiju-admin-row">
                                <label className="kiju-inline-field">
                                  <span>Name</span>
                                  <input
                                    value={product.name}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, { name: event.target.value })
                                    }
                                  />
                                </label>
                                <label className="kiju-inline-field">
                                  <span>Kategorie</span>
                                  <select
                                    value={product.category}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        category: event.target.value as ProductCategory
                                      })
                                    }
                                  >
                                    {productCategoryOrder.map((entryCategory) => (
                                      <option key={entryCategory} value={entryCategory}>
                                        {courseLabels[entryCategory]}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              {product.category === "drinks" ? (
                                <label className="kiju-inline-field">
                                  <span>Getränkegruppe</span>
                                  <input
                                    value={product.drinkSubcategory ?? ""}
                                    placeholder="z. B. Alkoholfrei"
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        drinkSubcategory: event.target.value
                                      })
                                    }
                                  />
                                </label>
                              ) : null}

                              <label className="kiju-inline-field">
                                <span>Beschreibung</span>
                                <textarea
                                  value={product.description}
                                  onChange={(event) =>
                                    actions.updateProduct(product.id, {
                                      description: event.target.value
                                    })
                                  }
                                />
                              </label>

                              <div className="kiju-admin-row">
                                <label className="kiju-inline-field">
                                  <span>Produktionsziel</span>
                                  <select
                                    value={product.productionTarget}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        productionTarget: event.target.value as ProductionTarget
                                      })
                                    }
                                  >
                                    <option value="service">Service</option>
                                    <option value="bar">Bar</option>
                                    <option value="kitchen">Küche</option>
                                  </select>
                                </label>
                                <label className="kiju-inline-field">
                                  <span>Preis EUR</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.10"
                                    value={(product.priceCents / 100).toFixed(2)}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        priceCents: Math.round(Number(event.target.value || "0") * 100)
                                      })
                                    }
                                  />
                                </label>
                                <label className="kiju-inline-field">
                                  <span>Steuer %</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={product.taxRate}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        taxRate: Number(event.target.value || "0")
                                      })
                                    }
                                  />
                                </label>
                              </div>

                              <label className="kiju-checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={product.supportsExtraIngredients === true}
                                  onChange={(event) =>
                                    actions.updateProduct(product.id, {
                                      supportsExtraIngredients: event.target.checked
                                    })
                                  }
                                />
                                <span>Extra-Zutaten-Popup aktivieren</span>
                              </label>
                            </AccordionSection>
                          );
                        })
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </AccordionSection>
          </div>

          <div id="mitarbeiter">
            <AccordionSection
              title="Mitarbeiter"
              eyebrow="Zugänge, Rollen und Aktivstatus"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label={`${state.users.length} Konten`} tone="navy" />}
            >
              <article className="kiju-admin-panel kiju-staff-login-export">
                <div className="kiju-admin-row kiju-admin-row--top">
                  <div className="kiju-admin-heading-stack">
                    <strong>Mitarbeiter-Logins</strong>
                    <span>
                      {staffLoginUsers.length} Service-, Küchen- und Barkonten, Admin-Konten ausgeschlossen.
                    </span>
                  </div>
                  <div className="kiju-admin-action-row">
                    <button
                      type="button"
                      className="kiju-button kiju-button--secondary"
                      onClick={handleDownloadStaffLoginBlanko}
                    >
                      <FileDown size={16} />
                      Blanko herunterladen
                    </button>
                    <button
                      type="button"
                      className="kiju-button kiju-button--secondary"
                      onClick={handlePrintStaffLogins}
                      disabled={staffLoginUsers.length === 0}
                    >
                      <FileDown size={16} />
                      PDF speichern
                    </button>
                    <button
                      type="button"
                      className="kiju-button kiju-button--secondary"
                      onClick={handlePrintStaffLogins}
                      disabled={staffLoginUsers.length === 0}
                    >
                      <Printer size={16} />
                      Drucken
                    </button>
                  </div>
                </div>
              </article>

              <div className="kiju-admin-layout">
                <form className="kiju-admin-panel" onSubmit={handleCreateUser}>
                  <strong>Neues Konto anlegen</strong>
                  <label className="kiju-inline-field">
                    <span>Name</span>
                    <input
                      value={userForm.name}
                      onChange={(event) =>
                        setUserForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <div className="kiju-admin-row">
                    <label className="kiju-inline-field">
                      <span>Benutzername</span>
                      <input
                        value={userForm.username}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            username: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="kiju-inline-field">
                      <span>Rolle</span>
                      <select
                        value={userForm.role}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            role: event.target.value as Role
                          }))
                        }
                      >
                        <option value="waiter">Kellner</option>
                        <option value="kitchen">Küche</option>
                        <option value="bar">Bar</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                  </div>
                  <div className="kiju-admin-row">
                    <label className="kiju-inline-field">
                      <span>Passwort</span>
                      <input
                        value={userForm.password}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            password: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="kiju-inline-field">
                      <span>PIN</span>
                      <input
                        value={userForm.pin}
                        onChange={(event) =>
                          setUserForm((current) => ({ ...current, pin: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <button type="submit" className="kiju-button kiju-button--primary">
                    <PlusCircle size={18} />
                    Mitarbeiter anlegen
                  </button>
                </form>

                <div className="kiju-admin-list">
                  {state.users.map((user) => {
                    const draft = userDrafts[user.id] ?? {
                      name: user.name,
                      username: user.username,
                      role: user.role,
                      password: user.password,
                      pin: user.pin ?? "",
                      active: user.active
                    };

                    return (
                      <article key={user.id} className="kiju-admin-panel">
                        <div className="kiju-admin-row kiju-admin-row--top">
                          <div className="kiju-admin-heading-stack">
                            <strong>{user.name}</strong>
                            <span>{user.username}</span>
                          </div>
                          <div className="kiju-admin-action-row">
                            <StatusPill
                              label={`${roleLabels[draft.role]}${draft.active ? "" : " · inaktiv"}`}
                              tone={draft.active ? "green" : "slate"}
                            />
                            <button
                              type="button"
                              className="kiju-button kiju-button--danger"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 size={16} />
                              Löschen
                            </button>
                          </div>
                        </div>

                        <div className="kiju-admin-row">
                          <label className="kiju-inline-field">
                            <span>Name</span>
                            <input
                              value={draft.name}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { name: event.target.value })
                              }
                            />
                          </label>
                          <label className="kiju-inline-field">
                            <span>Benutzername</span>
                            <input
                              value={draft.username}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { username: event.target.value })
                              }
                            />
                          </label>
                        </div>

                        <div className="kiju-admin-row">
                          <label className="kiju-inline-field">
                            <span>Rolle</span>
                            <select
                              value={draft.role}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, {
                                  role: event.target.value as Role
                                })
                              }
                            >
                              <option value="waiter">Kellner</option>
                              <option value="kitchen">Küche</option>
                              <option value="bar">Bar</option>
                              <option value="admin">Admin</option>
                            </select>
                          </label>
                          <label className="kiju-inline-field">
                            <span>PIN</span>
                            <input
                              value={draft.pin}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { pin: event.target.value })
                              }
                            />
                          </label>
                        </div>

                        <div className="kiju-admin-row">
                          <label className="kiju-inline-field">
                            <span>Passwort</span>
                            <input
                              value={draft.password}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { password: event.target.value })
                              }
                            />
                          </label>
                          <label className="kiju-checkbox-row">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { active: event.target.checked })
                              }
                            />
                            <span>Konto aktiv</span>
                          </label>
                        </div>

                        <div className="kiju-admin-meta">
                          <span>{userAssignments.get(user.id) ?? 0} Session-Zuordnungen</span>
                          <span>
                            Zuletzt aktiv:{" "}
                            {user.lastSeenAt
                              ? new Date(user.lastSeenAt).toLocaleString("de-DE")
                              : "Noch kein Login"}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="kiju-button kiju-button--primary"
                          onClick={() => handleSaveUser(user.id)}
                        >
                          <Save size={18} />
                          Änderungen speichern
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            </AccordionSection>
          </div>

          <div id="tische">
            <AccordionSection
              title="Tische"
              eyebrow="Raumlogik, Sitzplätze und Status"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label={`${state.tables.length} Tische`} tone="navy" />}
            >
              <article className="kiju-admin-panel kiju-admin-mode-panel">
                <div className="kiju-admin-row kiju-admin-row--top">
                  <div className="kiju-admin-heading-stack">
                    <strong>Bestellmodus im Service</strong>
                    <span>Standard ist ganzer Tisch, Sitzplätze können bei Bedarf aktiviert werden.</span>
                  </div>
                  <StatusPill
                    label={state.serviceOrderMode === "seat" ? "Sitzplätze" : "Ganzer Tisch"}
                    tone={state.serviceOrderMode === "seat" ? "amber" : "green"}
                  />
                </div>
                <div className="kiju-admin-action-row">
                  <button
                    type="button"
                    className={`kiju-button ${
                      state.serviceOrderMode === "table"
                        ? "kiju-button--primary"
                        : "kiju-button--secondary"
                    }`}
                    onClick={() => handleServiceOrderModeChange("table")}
                  >
                    Ganzer Tisch
                  </button>
                  <button
                    type="button"
                    className={`kiju-button ${
                      state.serviceOrderMode === "seat"
                        ? "kiju-button--primary"
                        : "kiju-button--secondary"
                    }`}
                    onClick={() => handleServiceOrderModeChange("seat")}
                  >
                    Sitzplätze verwenden
                  </button>
                </div>
              </article>
              <div className="kiju-admin-layout">
                <form className="kiju-admin-panel" onSubmit={handleCreateTable}>
                  <strong>Neuen Tisch anlegen</strong>
                  <label className="kiju-inline-field">
                    <span>Name</span>
                    <input
                      value={tableForm.name}
                      onChange={(event) =>
                        setTableForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <div className="kiju-admin-row">
                    <label className="kiju-inline-field">
                      <span>Sitzplätze</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        step="1"
                        value={tableForm.seatCount}
                        onChange={(event) =>
                          setTableForm((current) => ({
                            ...current,
                            seatCount: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="kiju-checkbox-row">
                      <input
                        type="checkbox"
                        checked={tableForm.active}
                        onChange={(event) =>
                          setTableForm((current) => ({ ...current, active: event.target.checked }))
                        }
                      />
                      <span>Direkt aktiv</span>
                    </label>
                  </div>
                  <label className="kiju-inline-field">
                    <span>Notiz</span>
                    <textarea
                      value={tableForm.note}
                      onChange={(event) =>
                        setTableForm((current) => ({ ...current, note: event.target.value }))
                      }
                    />
                  </label>
                  <button type="submit" className="kiju-button kiju-button--primary">
                    <PlusCircle size={18} />
                    Tisch anlegen
                  </button>
                </form>

                <div className="kiju-admin-list">
                  {state.tables.map((table) => {
                    const usage = tableAssignments.get(table.id) ?? {
                      sessions: 0,
                      items: 0,
                      closed: 0
                    };

                    return (
                      <article key={table.id} className="kiju-admin-panel">
                        <div className="kiju-admin-row kiju-admin-row--top">
                          <div className="kiju-admin-heading-stack">
                            <strong>{table.name}</strong>
                            <span>{table.seatCount} Sitzplätze</span>
                          </div>
                          <div className="kiju-admin-action-row">
                            <StatusPill
                              label={table.active ? "Aktiv" : "Geplant"}
                              tone={table.active ? "green" : "slate"}
                            />
                            <button
                              type="button"
                              className="kiju-button kiju-button--danger"
                              onClick={() => handleDeleteTable(table.id)}
                            >
                              <Trash2 size={16} />
                              Löschen
                            </button>
                          </div>
                        </div>

                        <div className="kiju-admin-row">
                          <label className="kiju-inline-field">
                            <span>Name</span>
                            <input
                              value={table.name}
                              onChange={(event) =>
                                actions.updateTable(table.id, { name: event.target.value })
                              }
                            />
                          </label>
                          <label className="kiju-checkbox-row">
                            <input
                              type="checkbox"
                              checked={table.active}
                              onChange={(event) =>
                                actions.updateTable(table.id, { active: event.target.checked })
                              }
                            />
                            <span>Tisch ist aktiv und im Service sichtbar</span>
                          </label>
                        </div>

                        <label className="kiju-inline-field">
                          <span>Notiz</span>
                          <textarea
                            value={table.note ?? ""}
                            onChange={(event) =>
                              actions.updateTable(table.id, { note: event.target.value })
                            }
                          />
                        </label>

                        <div className="kiju-admin-seat-list">
                          <div className="kiju-admin-heading-stack">
                            <strong>Sitzplätze im Service</strong>
                            <span>Ausgeblendete Plätze werden nicht mehr für neue Bestellungen angeboten.</span>
                          </div>
                          <div className="kiju-admin-seat-grid">
                            {table.seats.map((seat) => (
                              <label key={seat.id} className="kiju-checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={seat.visible !== false}
                                  onChange={(event) =>
                                    handleSeatVisibleChange(
                                      table.id,
                                      seat.id,
                                      event.target.checked
                                    )
                                  }
                                />
                                <span>{seat.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="kiju-admin-meta">
                          <span>{usage.sessions} Sessions gesamt</span>
                          <span>{usage.closed} Abschlüsse</span>
                          <span>{usage.items} Positionen am Tisch</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </AccordionSection>
          </div>

          <div id="bestellungen">
            <AccordionSection
              title="Bestellungen"
              eyebrow="Offene und abgeschlossene Sessions"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label={`${sortedSessions.length} Sessions`} tone="navy" />}
            >
              {sortedSessions.length === 0 ? (
                <div className="kiju-inline-panel">
                  <span>Aktuell sind keine Bestellungen vorhanden.</span>
                </div>
              ) : (
                <div className="kiju-admin-session-grid">
                  {sortedSessions.map((session) => {
                    const table =
                      state.tables.find((entry) => entry.id === session.tableId) ?? null;
                    const waiter =
                      state.users.find((entry) => entry.id === session.waiterId) ?? null;

                    return (
                      <article key={session.id} className="kiju-admin-session-card">
                        <div className="kiju-admin-session-card__header">
                          <div className="kiju-admin-heading-stack">
                            <strong>{table?.name ?? session.tableId.replace("table-", "Tisch ")}</strong>
                            <span>{waiter?.name ?? "Nicht zugeordnet"}</span>
                          </div>
                          <div className="kiju-admin-action-row">
                            <StatusPill
                              label={sessionStatusLabels[session.status] ?? "Status"}
                              tone={sessionStatusTones[session.status] ?? "slate"}
                            />
                            <button
                              type="button"
                              className="kiju-button kiju-button--danger"
                              onClick={() => handleDeleteSession(session.id)}
                            >
                              <Trash2 size={16} />
                              Löschen
                            </button>
                          </div>
                        </div>

                        <div className="kiju-admin-session-card__meta">
                          <span>{calculateGuestCount(session)} Gäste</span>
                          <span>{session.items.length} Positionen</span>
                          <span>{euro(calculateSessionTotal(session, state.products))}</span>
                        </div>

                        <div className="kiju-admin-session-card__items">
                          {session.items.length === 0 ? (
                            <div className="kiju-inline-panel">
                              <span>Diese Session enthält aktuell keine Positionen.</span>
                            </div>
                          ) : (
                            session.items.map((item) => {
                              const targetLabel = (() => {
                                if (item.target.type === "table") {
                                  return "Tisch";
                                }

                                const seatId = item.target.seatId;
                                return table?.seats.find((seat) => seat.id === seatId)?.label ?? seatId;
                              })();

                              return (
                                <div key={item.id} className="kiju-line-item">
                                  <span>
                                    {item.quantity}× {resolveProductName(state.products, item.productId)}
                                  </span>
                                  <span>
                                    {targetLabel} · {courseLabels[item.category]}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </AccordionSection>
          </div>

          <div id="tagesreset">
            <AccordionSection
              title="Tagesreset"
              eyebrow="Neuer Tag ohne Altlasten"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={
                <StatusPill
                  label={canUndoDailyReset ? "Rückgängig möglich" : `${openSessions.length} offen`}
                  tone={canUndoDailyReset ? "amber" : openSessions.length > 0 ? "red" : "green"}
                />
              }
            >
              <div className="kiju-danger-zone">
                <article className="kiju-danger-block">
                  <div className="kiju-danger-copy">
                    <strong>Tagesstand zurücksetzen</strong>
                    <p>
                      Setzt Umsatz heute, Tagesgäste und Tagesabschlüsse auf 0. Offene
                      Bestellungen werden geschlossen, damit ein neuer Tag ohne Altlasten starten
                      kann. Tische, Leistungen, Benutzer und Hinweise bleiben erhalten.
                    </p>
                    <small>
                      Vor dem Tagesreset wird ein Rückgängig-Snapshot für diese Admin-Sitzung
                      gespeichert.
                    </small>
                  </div>
                  <div className="kiju-danger-actions">
                    <button
                      type="button"
                      className="kiju-button kiju-button--danger"
                      onClick={handleDailyReset}
                    >
                      <AlertTriangle size={18} />
                      Tagesstand zurücksetzen
                    </button>
                    <button
                      type="button"
                      className="kiju-button kiju-button--secondary"
                      onClick={handleUndoDailyReset}
                      disabled={!canUndoDailyReset}
                    >
                      <RotateCcw size={18} />
                      Tagesreset rückgängig
                    </button>
                  </div>
                </article>
              </div>
            </AccordionSection>
          </div>
        </div>
        {adminPrintMode === "staff-logins" ? (
        <div className="kiju-print-root kiju-print-root--staff-logins" aria-hidden="true">
          <section className="kiju-staff-login-sheet">
            <header className="kiju-staff-login-sheet__header">
              <span>KiJu Gastro Order System</span>
              <h1>Mitarbeiter-Logins</h1>
              <p>Service, Küche und Bar ohne Admin-Konten · Stand {staffLoginPrintDate}</p>
            </header>

            <table className="kiju-staff-login-sheet__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Bereich</th>
                  <th>Benutzername</th>
                  <th>Passwort</th>
                  <th>PIN</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {staffLoginUsers.length > 0 ? (
                  staffLoginUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{staffLoginRoleLabels[user.role as StaffLoginRole]}</td>
                      <td>{user.username}</td>
                      <td>{user.password || "Nicht gesetzt"}</td>
                      <td>{user.pin || "Nicht gesetzt"}</td>
                      <td>{user.active ? "Aktiv" : "Inaktiv"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>Keine Service-, Küchen- oder Barkonten vorhanden.</td>
                  </tr>
                )}
              </tbody>
            </table>

            <footer className="kiju-staff-login-sheet__footer">
              <span>Admin-Konten werden aus Sicherheitsgründen nicht gedruckt.</span>
              <span>{staffLoginUsers.length} Konten</span>
            </footer>
          </section>
        </div>
        ) : null}
      </main>
    </RouteGuard>
  );
};
