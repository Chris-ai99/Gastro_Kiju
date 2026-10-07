import assert from "node:assert/strict";
import test from "node:test";

import {
  probeWindowsPrinter,
  sendRawEscPosToWindowsPrinter
} from "../src/windows-spooler.ts";

test("RAW-Ausgabe übergibt die ESC/POS-Bytes unverändert an den Spooler", async () => {
  const expected = Buffer.from([0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, 0x80, 0xff]);
  let captured;

  await sendRawEscPosToWindowsPrinter("  \\\\KASSE-PC\\Bon  ", expected, async (script, name, input) => {
    captured = { script, name, input };
  });

  assert.equal(captured.name, "\\\\KASSE-PC\\Bon");
  assert.match(captured.script, /pDataType = 'RAW'/);
  assert.deepEqual(Buffer.from(captured.input, "base64"), expected);
});

test("Windows-Druckerprüfung fragt den konfigurierten Namen mit Get-Printer ab", async () => {
  let captured;
  await probeWindowsPrinter("Bon-Drucker", async (script, name) => {
    captured = { script, name };
  });

  assert.equal(captured.name, "Bon-Drucker");
  assert.match(captured.script, /Get-Printer -Name \$env:KIJU_WINDOWS_PRINTER_NAME/);
});

test("RAW-Ausgabe lehnt fehlende Namen und leere Druckdaten ab", async () => {
  await assert.rejects(
    sendRawEscPosToWindowsPrinter("  ", Buffer.from([0x1b]), async () => {}),
    /Windows-Druckername oder Freigabepfad/
  );
  await assert.rejects(
    sendRawEscPosToWindowsPrinter("Bon-Drucker", Buffer.alloc(0), async () => {}),
    /Druckdaten sind leer/
  );
});
