import { config } from "dotenv";
import { resolve } from "node:path";

/**
 * Loads .env from the project root before workers connect to the database.
 */
export function loadEnv() {
  config({ path: resolve(process.cwd(), ".env") });
}
