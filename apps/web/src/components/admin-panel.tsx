"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  ChefHat,
  FileDown,
  LayoutGrid,
  PlusCircle,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Trash2,
  Users
} from "lucide-react";

import { routeConfig } from "@kiju/config";
import {
  buildClosedSessions,
  calculateGuestCount,
  calculateSessionTotal,
  euro,
  type DesignMode,
  type OrderSession,
  type OrderTarget,
  type NotificationTone,
  type ProductCategory,
  type ProductionTarget,
  type Role,
  type ServiceOrderMode
} from "@kiju/domain";
import { AccordionSection, SectionCard, StatusPill } from "@kiju/ui";

import { courseLabels, getSessionForTable, resolveProductName, useDemoApp } from "../lib/app-state";
import { RoleSwitchPopover } from "./role-switch-popover";
import { RouteGuard } from "./route-guard";
import { ThermalReceiptPaper } from "./thermal-receipt-paper";

const resetSteps = [
  "Schritt 1 von 3: Standarddaten wirklich vorbereiten?",
  "Schritt 2 von 3: Dabei werden alle Änderungen und Bestellungen gelöscht.",
  "Schritt 3 von 3: Jetzt endgültig alles auf Standard zurücksetzen."
] as const;

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  waiter: "Kellner",
  kitchen: "Küche"
};

type StaffLoginRole = Extract<Role, "waiter" | "kitchen">;

const staffLoginRoleLabels: Record<StaffLoginRole, string> = {
  waiter: "Service",
  kitchen: "Küche"
};

const staffLoginRoleOrder: Record<StaffLoginRole, number> = {
  waiter: 0,
  kitchen: 1
};

const isStaffLoginRole = (role: Role): role is StaffLoginRole =>
  role === "waiter" || role === "kitchen";

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

const zeroResetSteps = [
  "Schritt 1 von 3: Standardkonfiguration wirklich wiederherstellen?",
  "Schritt 2 von 3: Laufende Bestellungen, Hinweise und Tageswerte werden zurückgesetzt.",
  "Schritt 3 von 3: Jetzt endgültig die Standardkonfiguration laden."
] as const;

const formatAdminDateTime = (value: string) =>
  new Date(value).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  });

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
  const [resetStep, setResetStep] = useState(0);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    category: "drinks" as ProductCategory,
    drinkSubcategory: "",
    price: "0.00",
    taxRate: "19",
    productionTarget: "service" as ProductionTarget
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
  const [adminPrintMode, setAdminPrintMode] = useState<"staff-logins" | "receipt" | null>(null);
  const [adminReceiptPrint, setAdminReceiptPrint] = useState<{
    tableId: string;
    sessionId: string;
    mode: "print" | "reprint";
    openedAt: string;
  } | null>(null);
  const playedReceiptAlarmIdsRef = useRef<Set<string>>(new Set());

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
  const adminReceiptSession = adminReceiptPrint
    ? state.sessions.find((session) => session.id === adminReceiptPrint.sessionId) ??
      getSessionForTable(state.sessions, adminReceiptPrint.tableId)
    : undefined;

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
      setAdminReceiptPrint(null);
    };

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const handleOpenWorkspace = (role: "waiter" | "kitchen") => {
    const targetUser = state.users.find((user) => user.role === role && user.active);
    if (!targetUser) {
      setFeedback({
        tone: "alert",
        message:
          role === "waiter"
            ? "Es ist aktuell kein aktives Service-Konto vorhanden."
            : "Es ist aktuell kein aktives Küchenkonto vorhanden."
      });
      return;
    }

    const result = actions.login(targetUser.username, targetUser.password);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message:
          result.message ??
          (role === "waiter"
            ? "Service-Ansicht konnte nicht geöffnet werden."
            : "Küchenansicht konnte nicht geöffnet werden.")
      });
      return;
    }

    router.push(role === "waiter" ? routeConfig.waiter : routeConfig.kitchen);
  };

  const handlePrintStaffLogins = () => {
    if (staffLoginUsers.length === 0) {
      setFeedback({
        tone: "alert",
        message: "Es gibt aktuell keine Service- oder Küchenkonten für den Ausdruck."
      });
      return;
    }

    setAdminReceiptPrint(null);
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

    setAdminReceiptPrint(null);
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

  const handleDashboardPrintReceipt = (session: OrderSession) => {
    if (session.items.length === 0) {
      setFeedback({
        tone: "alert",
        message: "Für diesen Tisch sind noch keine Leistungen gebucht."
      });
      return;
    }

    const mode = session.receipt.printedAt ? "reprint" : "print";
    setAdminPrintMode("receipt");
    setAdminReceiptPrint({
      tableId: session.tableId,
      sessionId: session.id,
      mode,
      openedAt: new Date().toISOString()
    });

    if (mode === "reprint") {
      actions.reprintReceipt(session.tableId);
    } else {
      actions.printReceipt(session.tableId);
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
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

  const handleResetClick = () => {
    if (resetStep < zeroResetSteps.length - 1) {
      setResetStep((current) => current + 1);
      return;
    }

    actions.resetDemoState();
    setResetStep(0);
    setUserDrafts({});
    setFeedback({
      tone: "success",
      message:
        "Standardkonfiguration wiederhergestellt. Tische, Leistungen und Benutzer sind wieder gesetzt; Bestellungen, Hinweise und Tageswerte wurden zurückgesetzt."
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
      productionTarget: productForm.productionTarget
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
      productionTarget: "service"
    });
    setFeedback({ tone: "success", message: "Leistung erfolgreich angelegt." });
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
            <RoleSwitchPopover />
          </div>
        </section>

        <section className="kiju-admin-toolbar">
          <div className="kiju-admin-link-pills">
            <a className="kiju-admin-link-pill" href="#cockpit">
              Cockpit
            </a>
            <a className="kiju-admin-link-pill" href="#tisch-dashboard">
              Tisch-Dashboard
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
            <a className="kiju-admin-link-pill" href="#reset">
              Reset
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
                unreadNotifications.slice(0, 4).map((notification) => (
                  <article key={notification.id} className="kiju-admin-focus-item">
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                  </article>
                ))
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
                <strong>Reset-Schutz</strong>
                <span>{zeroResetSteps.length - resetStep} Sicherheitsstufen verbleiben</span>
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
                        onClick={() => session && handleDashboardPrintReceipt(session)}
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
                      {staffLoginUsers.length} Service- und Küchenkonten, Admin-Konten ausgeschlossen.
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

          <div id="reset">
            <AccordionSection
              title="Reset"
              eyebrow="Systemstart und Standardkonfiguration"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label="Geschützt" tone="red" />}
            >
              <div className="kiju-danger-zone">
                <article className="kiju-danger-block">
                  <div className="kiju-danger-copy">
                    <strong>Standardkonfiguration wiederherstellen</strong>
                    <p>
                      Lädt die feste Grundkonfiguration neu. Tische, Leistungen und Benutzer werden
                      auf Standard gesetzt; laufende Bestellungen, Hinweise und Tageswerte werden
                      zurückgesetzt.
                    </p>
                    <small>{zeroResetSteps[resetStep]}</small>
                  </div>
                  <div className="kiju-danger-actions">
                    <button
                      type="button"
                      className="kiju-button kiju-button--danger"
                      onClick={handleResetClick}
                    >
                      <AlertTriangle size={18} />
                      {resetStep === zeroResetSteps.length - 1
                        ? "Jetzt endgültig Standard laden"
                        : "Sicherheitsstufe bestätigen"}
                    </button>
                    {resetStep > 0 ? (
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => setResetStep(0)}
                      >
                        <RotateCcw size={18} />
                        Sicherheitsstufen zurücksetzen
                      </button>
                    ) : null}
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
              <p>Service und Küche ohne Admin-Konten · Stand {staffLoginPrintDate}</p>
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
                    <td colSpan={6}>Keine Service- oder Küchenkonten vorhanden.</td>
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
        {adminPrintMode === "receipt" && adminReceiptPrint && adminReceiptSession ? (
          <div className="kiju-print-root kiju-print-root--admin-receipt" aria-hidden="true">
            <ThermalReceiptPaper
              session={adminReceiptSession}
              products={state.products}
              openedAt={adminReceiptPrint.openedAt}
              className="kiju-receipt-paper--print"
            />
          </div>
        ) : null}
      </main>
    </RouteGuard>
  );
};
