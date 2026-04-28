import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bookService } from '../services/book.js';
import { reservationService } from '../services/reservation.js';
import type Database from 'better-sqlite3';

interface RouteParams {
  id: string;
}

export function bookRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/api/books', (_req: Request, res: Response) => {
    const books = bookService.list(db);
    res.json(books);
  });

  router.get('/api/books/:id', (req: Request<RouteParams>, res: Response) => {
    reservationService.expireStaleReservations(db);
    try {
      const book = bookService.get(db, req.params.id);
      res.json(book);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Book not found') {
        res.status(404).json({ error: 'Book not found' });
        return;
      }
      throw err;
    }
  });

  const createBookSchema = z.object({
    title: z.string().min(1),
    author: z.string().min(1),
    isbn: z.string().min(1),
    total_copies: z.number().int().min(1),
  });

  router.post('/api/books', (req: Request, res: Response) => {
    const parsed = createBookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      const book = bookService.create(db, parsed.data);
      res.status(201).json(book);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'ISBN already exists') {
        res.status(409).json({ error: 'ISBN already exists' });
        return;
      }
      throw err;
    }
  });

  return router;
}