import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPipaReceiptDocument,
  buildPipaReceiptText,
  buildReceiptPrintDocument
} from "../dist/index.js";
import { buildEscPosReceiptBuffer } from "../dist/server.js";

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

  assert.deepEqual([...buffer.slice(0, 9)], [0x1b, 0x40, 0x1b, 0x74, 16, 0x1b, 0x32, 0x1b, 0x61]);
  assert.ok(buffer.includes(Buffer.from([0x80])), "Euro-Zeichen sollte als CP1252-Byte 0x80 kodiert sein");
  assert.ok(
    buffer.includes(Buffer.from("                  PiPa Bistro                   \n", "latin1")),
    "zentrierte Leerzeichen im Header sollten unverändert in den Druckdaten bleiben"
  );
  assert.deepEqual([...buffer.slice(-8)], [0x00, 0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]);
});

test("buildReceiptPrintDocument bleibt kompatibel und integriert Stornos in die PiPa-Vorlage", () => {
  const document = buildReceiptPrintDocument({
    openedAt: "2026-04-24T18:30:00.000Z",
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
  assert.ok(lines.some((line) => line.includes("Pizza Salami                     2x      16,00 €")));
  assert.ok(lines.some((line) => line.includes("STORNO Pizza Salami              1x      -8,00 €")));
  assert.ok(lines.some((line) => line.includes("SUMME                                     8,00 €")));
});
