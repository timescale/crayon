import { createAppFactory } from "./createApp.js";
import { createDatabaseFactory } from "./createDatabase.js";
import { setupAppSchemaFactory } from "./setupAppSchema.js";

export async function getApiFactories() {
  return [
    createAppFactory,
    createDatabaseFactory,
    setupAppSchemaFactory,
  ] as const;
}
