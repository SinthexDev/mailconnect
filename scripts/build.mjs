import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "release");
rmSync(release, { recursive: true, force: true });
mkdirSync(release, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "apps/api/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: join(release, "server.cjs"),
  external: ["better-sqlite3", "argon2"],
  sourcemap: true,
  legalComments: "none",
  logLevel: "info",
});

cpSync(join(root, "apps/web/dist"), join(release, "public"), { recursive: true });
mkdirSync(join(release, "data/providers"), { recursive: true });
cpSync(join(root, "data/providers/de-eu.json"), join(release, "data/providers/de-eu.json"));

writeFileSync(
  join(release, "package.json"),
  JSON.stringify(
    {
      name: "mailconnect",
      private: true,
      version: "1.0.0",
      description: "MailConnect runtime. Native dependencies only.",
      dependencies: {
        argon2: "0.44.0",
        "better-sqlite3": "12.11.1",
      },
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(release, "ecosystem.config.cjs"),
  `module.exports = {
  apps: [
    {
      name: "mailconnect",
      script: "server.cjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
`,
);

console.log("Release gebaut:", release);
