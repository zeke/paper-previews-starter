import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
for (const folder of ["src", "scripts", "test"]) {
  for (const name of await readdir(folder)) {
    if (name.endsWith(".mjs"))
      execFileSync(process.execPath, ["--check", `${folder}/${name}`], {
        stdio: "inherit",
      });
  }
}
