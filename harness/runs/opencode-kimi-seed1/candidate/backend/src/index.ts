import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getDatabase, runMigrations, seedData } from './db/database.js';
import { createBookRoutes } from './routes/books.js';
import { createMemberRoutes } from './routes/members.js';
import { createLoanRoutes } from './routes/loans.js';
import { createReservationRoutes } from './routes/reservations.js';
import { createFineRoutes } from './routes/fines.js';
import { expireStaleReservations } from './services/reservationService.js';
import SwaggerParser from '@apidevtools/swagger-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3005;

// Initialize database
const db = getDatabase();
runMigrations(db);
seedData(db);

// Validate OpenAPI spec on boot
const openApiPath = join(__dirname, '../openapi.yaml');
try {
  await SwaggerParser.validate(openApiPath);
  console.log('OpenAPI spec is valid');
} catch (error) {
  console.error('OpenAPI spec validation failed:', error);
  process.exit(1);
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: 'http://localhost:5173'
}));
app.use(express.json());

// Expire stale reservations on every request (AC-5.5)
app.use((_req, _res, next) => {
  expireStaleReservations(db);
  next();
});

// Routes
app.use('/api/books', createBookRoutes(db));
app.use('/api/members', createMemberRoutes(db));
app.use('/api/loans', createLoanRoutes(db));
app.use('/api/reservations', createReservationRoutes(db));
app.use('/api/fines', createFineRoutes(db));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
