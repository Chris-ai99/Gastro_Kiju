import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadDurableJsonFile,
  writeDurableJsonFile
} from "../../apps/web/src/server/durable-json-file.ts";

const parseState = (value) => {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.version !== "number" ||
    typeof value.label !== "string"
  ) {
    throw new Error("Ungültiger Testzustand");
  }

  return value;
};

test("restores the newest valid backup after a corrupted primary file", () => {
  const directoryPath = mkdtempSync(join(tmpdir(), "kiju-durable-json-"));
  const filePath = join(directoryPath, "state.json");

  try {
    writeDurableJsonFile(filePath, { version: 1, label: "eins" }, { backupCount: 5 });
    writeDurableJsonFile(filePath, { version: 2, label: "zwei" }, { backupCount: 5 });
    writeDurableJsonFile(filePath, { version: 3, label: "drei" }, { backupCount: 5 });
    writeFileSync(filePath, "{abgebrochen", "utf8");

    const result = loadDurableJsonFile({
      filePath,
      backupCount: 5,
      parse: parseState,
      createInitial: () => ({ version: 1, label: "neu" })
    });

    assert.equal(result.value.version, 2);
    assert.equal(result.recoveredFrom, `${filePath}.bak.1`);
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), {
      version: 2,
      label: "zwei"
    });
  } finally {
    rmSync(directoryPath, { recursive: true, force: true });
  }
});

test("restores a backup when the primary file was deleted", () => {
  const directoryPath = mkdtempSync(join(tmpdir(), "kiju-durable-json-"));
  const filePath = join(directoryPath, "state.json");

  try {
    writeDurableJsonFile(filePath, { version: 1, label: "eins" }, { backupCount: 5 });
    writeDurableJsonFile(filePath, { version: 2, label: "zwei" }, { backupCount: 5 });
    rmSync(filePath);

    const result = loadDurableJsonFile({
      filePath,
      backupCount: 5,
      parse: parseState,
      createInitial: () => ({ version: 1, label: "neu" })
    });

    assert.equal(result.value.version, 1);
    assert.equal(result.created, false);
    assert.equal(result.recoveredFrom, `${filePath}.bak.1`);
  } finally {
    rmSync(directoryPath, { recursive: true, force: true });
  }
});

test("does not silently replace stored data when every copy is invalid", () => {
  const directoryPath = mkdtempSync(join(tmpdir(), "kiju-durable-json-"));
  const filePath = join(directoryPath, "state.json");

  try {
    writeFileSync(filePath, "{defekt", "utf8");
    writeFileSync(`${filePath}.bak.1`, JSON.stringify({ unexpected: true }), "utf8");

    assert.throws(
      () =>
        loadDurableJsonFile({
          filePath,
          backupCount: 5,
          parse: parseState,
          createInitial: () => ({ version: 1, label: "neu" })
        }),
      /Keine gültige Zustandsdatei/
    );
    assert.equal(readFileSync(filePath, "utf8"), "{defekt");
  } finally {
    rmSync(directoryPath, { recursive: true, force: true });
  }
});
