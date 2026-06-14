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
    "[Grafik: Bistro PiPa mit Pizza-, Besteck- und Pasta-Symbolen]",
    "Bon Nr.:                              4711",
    "Datum:                    24.04.2026 18:30",
    "Bedienung:                         Service",
    "------------------------------------------",
    "ARTIKEL                 MENGE       BETRAG",
    "------------------------------------------",
    "Pizza Salami               1x       8,00 €",
    "Pasta mit Pesto            1x       7,00 €",
    "Cola                       2x       5,00 €",
    "------------------------------------------",
    "SUMME         20,00 €",
    "------------------------------------------",
    "",
    "      Vielen Dank für deinen Besuch!      ",
    "[Grafik: Herz]",
    "------------------------------------------",
    " Dieser Beleg dient nur der Orientierung  ",
    "    und ist kein offizielles Dokument.    ",
    "     Keine steuerliche Absetzbarkeit.     ",
    "------------------------------------------",
    "[Grafik: Standort Zionsgemeinde Haus Amos]"
  ]);

  const document = buildPipaReceiptDocument({
    bonNummer: "4711",
    datum: "24.04.2026 18:30",
    bedienung: "Service",
    positionen: [{ name: "Pizza Salami", menge: 1, betrag: 800 }],
    gesamt: 800
  });

  document.lines.forEach((line) => {
    if (line.bitmap) {
      assert.equal(
        Buffer.from(line.bitmap.dataBase64, "base64").length,
        Math.ceil(line.bitmap.width / 8) * line.bitmap.height
      );
      return;
    }

    const maximumWidth = line.size === "xlarge" ? 14 : line.size === "large" ? 21 : 42;
    assert.ok(
      line.text.length <= maximumWidth,
      `"${line.text}" überschreitet mit ${line.text.length} Zeichen die Breite ${maximumWidth}`
    );
  });
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
  assert.ok(lines.includes("SUMME          2,50 €"));
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
  const firstItemLine = lines[6];
  const secondItemLine = lines[7];
  const thirdItemLine = lines[8];

  assert.equal(firstItemLine, "Pizza Spezial mit extra    2x      18,90 €");
  assert.equal(secondItemLine, "langem Namen ohne Umbau");
  assert.equal(thirdItemLine, "der Preis-Spalte       ");
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
    [0x1b, 0x40, 0x1b, 0x7b, 0x00, 0x1b, 0x74, 16, 0x1b, 0x32, 0x1b, 0x61]
  );
  assert.ok(buffer.includes(Buffer.from([0x80])), "Euro-Zeichen sollte als CP1252-Byte 0x80 kodiert sein");
  assert.ok(
    buffer.includes(Buffer.from([0x1d, 0x76, 0x30, 0x00, 0x40, 0x00, 0x54, 0x01])),
    "der 512 x 340 Pixel große PiPa-Kopf sollte als ESC/POS-Rastergrafik enthalten sein"
  );
  assert.deepEqual([...buffer.slice(-8)], [0x00, 0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]);
});

test("Kassenbon druckt den Grafik-Kopf nicht im Drehmodus", () => {
  const buffer = buildEscPosReceiptBuffer({
    bonNummer: "4711",
    datum: "24.04.2026 18:30",
    positionen: [{ name: "Pizza Salami", menge: 1, betrag: 800 }],
    gesamt: 800
  });

  const rotationOff = buffer.indexOf(Buffer.from([0x1b, 0x7b, 0x00]));
  const rotationOn = buffer.indexOf(Buffer.from([0x1b, 0x7b, 0x01]));
  const firstRaster = buffer.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00]));

  assert.equal(rotationOff, 2);
  assert.equal(rotationOn, -1);
  assert.ok(firstRaster > rotationOff);
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

test("Abholbon enthält Gastdaten und Ort der Selbstbestellung", () => {
  const document = buildPickupTicketPrintDocument({
    tableLabel: "Zum Abholen 8",
    pickupNumber: 8,
    bedienung: "Selbstbestellung",
    customerName: "Alex Beispiel",
    guestCount: 4,
    locationName: "Saal",
    createdAt: "2026-06-13T20:00:00.000Z"
  });
  const lines = document.lines.map((line) => line.text);

  assert.ok(lines.includes("NAME  : Alex Beispiel"));
  assert.ok(lines.includes("PERSONEN: 4"));
  assert.ok(lines.includes("ORT   : Saal"));
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
      },
      {
        id: "mineralwasser",
        name: "Mineralwasser",
        category: "drinks",
        description: "",
        priceCents: 250,
        taxRate: 0.19,
        allergens: [],
        showInKitchen: false,
        productionTarget: "bar",
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
        },
        {
          id: "item-2",
          target: { type: "table" },
          productId: "mineralwasser",
          category: "drinks",
          quantity: 1,
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
  assert.equal(document.width, 42);
  assert.ok(lines.includes("Tisch:                             Tisch 1"));
  assert.ok(lines.some((line) => line.includes("Pizza Salami               2x      16,00 €")));
  assert.ok(lines.some((line) => line.includes("STORNO Pizza Salami        1x      -8,00 €")));
  assert.ok(lines.some((line) => line.includes("Mineralwasser              1x       2,50 €")));
  assert.ok(lines.some((line) => line.includes("SUMME         10,50 €")));

  const pizzaLineIndex = lines.findIndex((line) => line.startsWith("Pizza Salami"));
  const cancellationLineIndex = lines.findIndex((line) => line.startsWith("STORNO Pizza Salami"));
  const waterLineIndex = lines.findIndex((line) => line.startsWith("Mineralwasser"));

  assert.ok(pizzaLineIndex < cancellationLineIndex);
  assert.ok(cancellationLineIndex < waterLineIndex);
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

  assert.ok(lines.includes("Tisch:                             Tisch 3"));
  assert.ok(lines.includes("Bedienung:                           Chris"));
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
