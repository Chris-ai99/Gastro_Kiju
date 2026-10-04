import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

type DurableJsonLoadOptions<T> = {
  filePath: string;
  parse: (value: unknown) => T;
  createInitial: () => T;
  backupCount: number;
  onRecovery?: (backupPath: string) => void;
};

const backupPathFor = (filePath: string, index: number) => `${filePath}.bak.${index}`;

const syncDirectory = (directoryPath: string) => {
  let descriptor: number | undefined;

  try {
    descriptor = openSync(directoryPath, "r");
    fsyncSync(descriptor);
  } catch {
    // Directory fsync is not supported on every platform.
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
};

const writeAndSyncFile = (filePath: string, content: string) => {
  const descriptor = openSync(filePath, "wx", 0o600);

  try {
    writeFileSync(descriptor, content, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

const rotateBackups = (filePath: string, backupCount: number) => {
  if (backupCount <= 0 || !existsSync(filePath)) return;

  for (let index = backupCount; index >= 2; index -= 1) {
    const targetPath = backupPathFor(filePath, index);
    const sourcePath = backupPathFor(filePath, index - 1);

    rmSync(targetPath, { force: true });
    if (existsSync(sourcePath)) {
      renameSync(sourcePath, targetPath);
    }
  }

  const firstBackupPath = backupPathFor(filePath, 1);
  const backupTempPath = `${firstBackupPath}.tmp-${process.pid}-${randomUUID()}`;

  try {
    writeAndSyncFile(backupTempPath, readFileSync(filePath, "utf8"));
    rmSync(firstBackupPath, { force: true });
    renameSync(backupTempPath, firstBackupPath);
  } finally {
    rmSync(backupTempPath, { force: true });
  }
};

export const writeDurableJsonFile = <T>(
  filePath: string,
  value: T,
  backupCount: number,
  backupCurrent = true
) => {
  const normalizedBackupCount = Math.max(0, backupCount);
  const directoryPath = dirname(filePath);
  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  JSON.parse(serialized);
  mkdirSync(directoryPath, { recursive: true });

  try {
    writeAndSyncFile(tempPath, serialized);
    if (backupCurrent) {
      rotateBackups(filePath, normalizedBackupCount);
    }
    renameSync(tempPath, filePath);
    syncDirectory(directoryPath);
  } finally {
    rmSync(tempPath, { force: true });
  }
};

const archiveInvalidPrimary = (filePath: string) => {
  if (!existsSync(filePath)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  renameSync(filePath, `${filePath}.corrupt-${timestamp}`);
};

export const loadDurableJsonFile = <T>({
  filePath,
  parse,
  createInitial,
  backupCount,
  onRecovery
}: DurableJsonLoadOptions<T>): T => {
  const normalizedBackupCount = Math.max(0, backupCount);
  const candidatePaths = [
    filePath,
    ...Array.from({ length: normalizedBackupCount }, (_, index) =>
      backupPathFor(filePath, index + 1)
    )
  ];
  let foundStoredFile = false;

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) continue;
    foundStoredFile = true;

    try {
      const value = parse(JSON.parse(readFileSync(candidatePath, "utf8")) as unknown);

      if (candidatePath !== filePath) {
        archiveInvalidPrimary(filePath);
        writeDurableJsonFile(filePath, value, normalizedBackupCount, false);
        onRecovery?.(candidatePath);
      }

      return value;
    } catch {
      // Try the next retained snapshot.
    }
  }

  if (foundStoredFile) {
    throw new Error(`Keine gültige Zustandsdatei oder Sicherung gefunden: ${filePath}`);
  }

  const initialValue = createInitial();
  writeDurableJsonFile(filePath, initialValue, normalizedBackupCount, false);
  return initialValue;
};
