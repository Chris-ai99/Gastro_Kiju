import { readdir, writeFile } from "node:fs/promises";
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
