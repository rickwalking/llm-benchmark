import SwaggerParser from "@apidevtools/swagger-parser";
import { createApp } from "./app";
import { openDatabase, resolveBackendPath } from "./db";

const PORT = 3002;

async function main(): Promise<void> {
  await SwaggerParser.validate(resolveBackendPath("openapi.yaml"));
  const db = openDatabase();
  const app = createApp(db);
  app.listen(PORT, () => {
    console.log(`Library API listening on http://localhost:${PORT}`);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
