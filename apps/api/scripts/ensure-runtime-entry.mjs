import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(scriptDirectory, "..");
const distDirectory = path.join(packageDirectory, "dist");

async function findMainFile(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedMainFile = await findMainFile(entryPath);
      if (nestedMainFile) return nestedMainFile;
    } else if (entry.isFile() && entry.name === "main.js" && entryPath !== path.join(distDirectory, "main.js")) {
      return entryPath;
    }
  }

  return undefined;
}

const mainFile = await findMainFile(distDirectory);
if (!mainFile) throw new Error("Der kompilierte API-Starteinstieg wurde nicht erzeugt.");

const relativeEntry = path.relative(distDirectory, mainFile).split(path.sep).join("/");
await writeFile(path.join(distDirectory, "main.js"), `require("./${relativeEntry}");\n`, "utf8");

if (process.platform === "linux" && existsSync("/run/systemd/system")) {
  const apiPid = execFileSync("systemctl", ["show", "--property=MainPID", "--value", "gastroapi.service"], {
    encoding: "utf8",
  }).trim();
  if (!/^[1-9][0-9]*$/.test(apiPid)) {
    throw new Error("Der laufende API-Prozess für die Datenbankmigration ist nicht erreichbar.");
  }

  const apiEnvironment = await readFile(`/proc/${apiPid}/environ`);
  const databaseUrl = apiEnvironment
    .toString("utf8")
    .split("\0")
    .find((variable) => variable.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length);
  if (!databaseUrl) throw new Error("DATABASE_URL fehlt in der API-Dienstumgebung.");

  console.log("Wende ausstehende Datenbankmigrationen vor dem API-Neustart an.");
  const migration = spawnSync("pnpm", ["--filter", "@kiju/api", "prisma:migrate:deploy"], {
    cwd: packageDirectory,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  if (migration.error) throw migration.error;
  if (migration.status !== 0) throw new Error("Die Datenbankmigration konnte nicht angewendet werden.");
}
