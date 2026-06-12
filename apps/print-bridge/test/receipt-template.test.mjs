import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKitchenPlateLabelPrintDocument,
  buildKitchenTicketPrintDocument,
  buildPipaReceiptDocument,
  buildPipaReceiptText,
  buildPickupTicketPrintDocument,
  buildReceiptPrintDocument
} from "../dist/index.js";
import { buildEscPosDocumentBuffer, buildEscPosReceiptBuffer } from "../dist/server.js";

test("buildPipaReceiptText erzeugt den erwarteten PiPa-Beispielbon", () => {
  const receiptText = buildPipaReceiptText({
    bonNummer: "4711",
    datum: "24.04.2026 18:30",
    bedienung: "Service",
    positionen: [
      { name: "Pizza Salami", menge: 1, betrag: 800 },
      { name: "Pasta mit Pesto", menge: 1, betrag: 700 },
      { name: "Cola", menge: 2, betrag: 500 }
    ],
    gesamt: 2000
  });

  assert.deepEqual(receiptText.split("\n"), [
    "                  PiPa Bistro                   ",
    "                 Pizza & Pasta                  ",
    "------------------------------------------------",
    "                   KASSENBON                    ",
    "                   TISCH-BON                    ",
    "------------------------------------------------",
    "BON NR.    4711",
    "DATUM      24.04.2026 18:30",
    "BEDIENUNG  Service",
    "------------------------------------------------",
    "ARTIKEL                        MNG        BETRAG",
    "------------------------------------------------",
    "Pizza Salami                     1x       8,00 €",
    "Pasta mit Pesto                  1x       7,00 €",
    "Cola                             2x       5,00 €",
    "================================================",
    "SUMME                                    20,00 €",
    "================================================",
    "",
    "         Vielen Dank für deinen Besuch!         ",
    "    Dieser Beleg dient nur der Orientierung     ",
    "       und ist kein offizielles Dokument.       ",
    "",
    "            Zionsgemeinde Haus Amos             ",
    "        Paracelsusweg 8, 33689 Bielefeld        "
  ]);
});

test("BEDIENUNG wird sauber weggelassen, wenn kein Wert vorhanden ist", () => {
  const document = buildPipaReceiptDocument({
    bonNummer: "0815",
    datum: "24.04.2026 20:15",
    positionen: [{ name: "Wasser", menge: 1, betrag: 250 }],
    gesamt: 250
  });

  const lines = document.lines.map((line) => line.text);

  assert.ok(!lines.some((line) => line.startsWith("BEDIENUNG")));
  assert.ok(lines.includes("SUMME                                     2,50 €"));
});

test("lange Artikelnamen umbrechen ohne Preis- oder Mengenspalte zu verschieben", () => {
  const document = buildPipaReceiptDocument({
    bonNummer: "9001",
    datum: "24.04.2026 19:00",
    positionen: [
      {
        name: "Pizza Spezial mit extra langem Namen ohne Umbau der Preis-Spalte",
        menge: 2,
        betrag: 1890
      }
    ],
    gesamt: 1890
  });

  const lines = document.lines.map((line) => line.text);
  const firstItemLine = lines[11];
  const secondItemLine = lines[12];
  const thirdItemLine = lines[13];

  assert.equal(firstItemLine, "Pizza Spezial mit extra langem   2x      18,90 €");
  assert.equal(secondItemLine, "Namen ohne Umbau der          ");
  assert.equal(thirdItemLine, "Preis-Spalte                  ");
  assert.ok(!secondItemLine.includes("€"));
  assert.ok(!thirdItemLine.includes("€"));
});

test("buildEscPosReceiptBuffer erzeugt Epson-kompatible Initialisierung und Cut", () => {
  const buffer = buildEscPosReceiptBuffer({
    bonNummer: "4711",
    datum: "24.04.2026 18:30",
    positionen: [{ name: "Pizza Salami", menge: 1, betrag: 800 }],
    gesamt: 800
  });

  assert.deepEqual(
    [...buffer.slice(0, 12)],
    [0x1b, 0x40, 0x1b, 0x7b, 0x01, 0x1b, 0x74, 16, 0x1b, 0x32, 0x1b, 0x61]
  );
  assert.ok(buffer.includes(Buffer.from([0x80])), "Euro-Zeichen sollte als CP1252-Byte 0x80 kodiert sein");
  assert.ok(
    buffer.includes(Buffer.from("                  PiPa Bistro                   \n", "latin1")),
    "zentrierte Leerzeichen im Header sollten unverändert in den Druckdaten bleiben"
  );
  assert.deepEqual([...buffer.slice(-8)], [0x00, 0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]);
});

test("ESC/POS-Drehmodus umschließt den Boninhalt", () => {
  const buffer = buildEscPosDocumentBuffer({
    title: "Drehprüfung",
    width: 42,
    lines: [{ text: "Testbon" }]
  });
  const rotationOn = buffer.indexOf(Buffer.from([0x1b, 0x7b, 0x01]));
  const content = buffer.indexOf(Buffer.from("Testbon\n", "latin1"));
  const rotationOff = buffer.indexOf(Buffer.from([0x1b, 0x7b, 0x00]));
  const paperFeed = buffer.indexOf(Buffer.from([0x1b, 0x64, 0x04]));

  assert.equal(rotationOn, 2);
  assert.ok(content > rotationOn);
  assert.ok(rotationOff > content);
  assert.ok(paperFeed > rotationOff);
});

test("ESC/POS-Druck setzt große Schrift und stellt danach Normalgröße wieder her", () => {
  const buffer = buildEscPosDocumentBuffer({
    title: "Größenprüfung",
    width: 42,
    lines: [
      { text: "TISCH 7", size: "large", emphasis: true },
      { text: "Normal" }
    ]
  });
  const largeText = buffer.indexOf(Buffer.from("TISCH 7\n", "latin1"));
  const largeCommand = buffer.lastIndexOf(Buffer.from([0x1d, 0x21, 0x11]), largeText);
  const normalText = buffer.indexOf(Buffer.from("Normal\n", "latin1"));
  const normalCommand = buffer.lastIndexOf(Buffer.from([0x1d, 0x21, 0x00]), normalText);

  assert.ok(largeCommand >= 0 && largeCommand < largeText);
  assert.ok(normalCommand > largeText && normalCommand < normalText);
});

test("Abholbon enthält die Bedienung", () => {
  const document = buildPickupTicketPrintDocument({
    tableLabel: "Zum Abholen 4",
    pickupNumber: 4,
    bedienung: "Chris",
    createdAt: "2026-06-12T18:30:00.000Z"
  });
  const lines = document.lines.map((line) => line.text);

  assert.ok(lines.includes("BEDIENUNG: Chris"));
  assert.equal(document.lines.find((line) => line.text === "NUMMER 4")?.size, "large");
});

test("buildReceiptPrintDocument bleibt kompatibel und integriert Stornos in die PiPa-Vorlage", () => {
  const document = buildReceiptPrintDocument({
    openedAt: "2026-04-24T18:30:00.000Z",
    tableLabel: "Tisch 1",
    products: [
      {
        id: "pizza-salami",
        name: "Pizza Salami",
        category: "main",
        description: "",
        priceCents: 800,
        taxRate: 0.19,
        allergens: [],
        showInKitchen: true,
        productionTarget: "kitchen",
        modifierGroups: []
      }
    ],
    session: {
      id: "session-4711",
      tableId: "table-1",
      waiterId: "waiter-1",
      status: "ready-to-bill",
      items: [
        {
          id: "item-1",
          target: { type: "table" },
          productId: "pizza-salami",
          category: "main",
          quantity: 2,
          modifiers: []
        }
      ],
      skippedCourses: [],
      courseTickets: {
        drinks: {
          course: "drinks",
          status: "not-recorded",
          manualRelease: false,
          countdownMinutes: 0
        },
        starter: {
          course: "starter",
          status: "not-recorded",
          manualRelease: false,
          countdownMinutes: 0
        },
        main: {
          course: "main",
          status: "not-recorded",
          manualRelease: false,
          countdownMinutes: 0
        },
        dessert: {
          course: "dessert",
          status: "not-recorded",
          manualRelease: false,
          countdownMinutes: 0
        }
      },
      kitchenTicketBatches: [],
      barTicketBatches: [],
      payments: [],
      cancellations: [
        {
          id: "cancel-1",
          label: "Rechnungsstorno",
          createdAt: "2026-04-24T18:45:00.000Z",
          lineItems: [{ itemId: "item-1", quantity: 1 }]
        }
      ],
      partyGroups: [],
      receipt: {}
    }
  });

  const lines = document.lines.map((line) => line.text);

  assert.equal(document.title, "Tisch-Bon");
  assert.equal(document.width, 48);
  assert.ok(lines.includes("TISCH      Tisch 1"));
  assert.ok(lines.some((line) => line.includes("Pizza Salami                     2x      16,00 €")));
  assert.ok(lines.some((line) => line.includes("STORNO Pizza Salami              1x      -8,00 €")));
  assert.ok(lines.some((line) => line.includes("SUMME                                     8,00 €")));
});

test("buildReceiptPrintDocument druckt den Bedienungsnamen", () => {
  const document = buildReceiptPrintDocument({
    mode: "table",
    bonNummer: "123456",
    datum: "24.04.2026 18:30",
    tableLabel: "Tisch 3",
    bedienung: "Chris",
    sections: [{ positionen: [{ name: "Pizza Salami", menge: 1, betrag: 800 }] }],
    gesamt: 800
  });

  const lines = document.lines.map((line) => line.text);

  assert.ok(lines.includes("TISCH      Tisch 3"));
  assert.ok(lines.includes("BEDIENUNG  Chris"));
});

test("buildKitchenTicketPrintDocument druckt Vorspeisenbon mit Bedienungsnamen", () => {
  const input = {
    printedAt: "2026-04-24T18:30:00.000Z",
    table: {
      id: "table-1",
      name: "Tisch 1",
      seatCount: 2,
      active: true,
      seats: [
        { id: "table-1-seat-1", label: "P1", visible: true },
        { id: "table-1-seat-2", label: "P2", visible: true }
      ],
      x: 0,
      y: 0,
      width: 10,
      height: 10
    },
    products: [
      {
        id: "bruschetta",
        name: "Bruschetta",
        category: "starter",
        description: "",
        priceCents: 500,
        taxRate: 0.19,
        allergens: [],
        showInKitchen: true,
        productionTarget: "kitchen",
        modifierGroups: []
      }
    ],
    session: {
      id: "session-1",
      tableId: "table-1",
      waiterId: "waiter-1",
      status: "waiting",
      items: [
        {
          id: "item-starter-1",
          target: { type: "seat", seatId: "table-1-seat-1" },
          productId: "bruschetta",
          category: "starter",
          quantity: 1,
          modifiers: [],
          sentAt: "2026-04-24T18:29:00.000Z"
        }
      ],
      skippedCourses: [],
      courseTickets: {
        drinks: { course: "drinks", status: "not-recorded", manualRelease: false, countdownMinutes: 0 },
        starter: { course: "starter", status: "ready", manualRelease: false, countdownMinutes: 0 },
        main: { course: "main", status: "not-recorded", manualRelease: false, countdownMinutes: 0 },
        dessert: { course: "dessert", status: "not-recorded", manualRelease: false, countdownMinutes: 0 }
      },
      kitchenTicketBatches: [],
      barTicketBatches: [],
      payments: [],
      cancellations: [],
      partyGroups: [],
      receipt: {}
    },
    batch: {
      id: "batch-starter-1",
      course: "starter",
      itemIds: ["item-starter-1"],
      bedienung: "Chris",
      status: "ready",
      sentAt: "2026-04-24T18:29:00.000Z",
      releasedAt: "2026-04-24T18:29:00.000Z",
      manualRelease: false,
      countdownMinutes: 0,
      sequence: 1
    }
  };
  const document = buildKitchenTicketPrintDocument(input);

  const lines = document.lines.map((line) => line.text);

  assert.equal(document.title, "Vorspeise");
  assert.ok(lines.includes("BESTELLT: Chris"));
  assert.ok(lines.some((line) => line.includes("1x Bruschetta")));

  const plateLabel = buildKitchenPlateLabelPrintDocument({
    ...input,
    itemId: "item-starter-1",
    unitIndex: 0,
    completedAt: "2026-04-24T18:45:30.000Z"
  });
  const plateLines = plateLabel.lines.map((line) => line.text);

  assert.ok(plateLines.includes("BEDIENUNG Chris"));
  assert.ok(plateLines.includes("WARTEZEIT: 16:30 Min"));
  assert.ok(!plateLines.includes("Zum Teller kleben"));
  assert.equal(
    plateLabel.lines.find((line) => line.text === "Tisch 1")?.size,
    "large"
  );
  assert.equal(
    plateLabel.lines.find((line) => line.text === "1x Bruschetta")?.size,
    "large"
  );
});
