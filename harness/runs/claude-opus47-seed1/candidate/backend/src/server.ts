import SwaggerParser from '@apidevtools/swagger-parser';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { openDatabase } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT ?? 3003);

async function main(): Promise<void> {
  const openapiPath = resolve(__dirname, '../openapi.yaml');
  try {
    await SwaggerParser.validate(openapiPath);
  } catch (err) {
    console.error('OpenAPI validation failed:', err);
    process.exit(1);
  }

  const dbFile = process.env.DATABASE_FILE;
  const db = openDatabase(dbFile ? { filename: dbFile } : undefined);

  const app = buildApp(db, {
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  });

  app.listen(PORT, () => {
    console.log(`[backend] listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
