import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${signal ?? code}`));
    });
  });
}

try {
  console.log(JSON.stringify({ event: "production.startup", stage: "validate" }));
  await run(process.execPath, ["scripts/validate-production-env.mjs"]);
  console.log(JSON.stringify({ event: "production.startup", stage: "migrate" }));
  await run("npx", ["prisma", "migrate", "deploy"]);
  console.log(JSON.stringify({ event: "production.startup", stage: "serve" }));
  await run(process.execPath, ["dist/index.js"]);
} catch (error) {
  console.error(JSON.stringify({
    event: "production.startup_failed",
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exit(1);
}
