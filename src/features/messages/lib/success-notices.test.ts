import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

test("app routes do not display success notices from URL query parameters", () => {
  const appDirectory = path.resolve(process.cwd(), "src", "app");
  const successParameterAccess =
    /searchParams(?:\.|\[\s*["'])(?:created|updated|deleted|archived|payment|cancelled)/;

  const affectedRoutes = listTypeScriptFiles(appDirectory).filter((filePath) =>
    successParameterAccess.test(readFileSync(filePath, "utf8")),
  );

  assert.deepEqual(
    affectedRoutes.map((filePath) => path.relative(appDirectory, filePath)),
    [],
    "Success banners must not trust user-controlled or replayable query parameters.",
  );
});
