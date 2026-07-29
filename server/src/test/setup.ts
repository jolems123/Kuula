/**
 * Test bootstrap.
 *
 * Loads `.env.test` BEFORE anything imports `lib/config.ts`, which snapshots
 * configuration at module load. Refuses to run against any database whose name
 * does not end in `_test`, because these tests truncate tables.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env.test"), override: true });

const url = process.env.DATABASE_URL ?? "";
if (!/_test(\?|$)/.test(url)) {
  throw new Error(
    `Refusing to run tests against "${url.replace(/:[^:@]*@/, ":***@")}". ` +
      `DATABASE_URL must point at a database whose name ends in _test.`
  );
}

process.env.NODE_ENV = "test";
