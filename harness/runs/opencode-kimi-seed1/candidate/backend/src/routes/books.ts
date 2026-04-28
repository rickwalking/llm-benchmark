import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseInstance } from '../db/database.js';
import * as bookService from '../services/bookService.js';
import { NotFoundError, ConflictError } from '../errors.js';

const router = Router();

const createBookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  isbn: z.string().min(1),
  total_copies: z.number().int().min(1)
});

export function createBookRoutes(db: DatabaseInstance) {
  // GET /api/books - List all books
  router.get('/', (_req, res) => {
    try {
      const books = bookService.listBooks(db);
      res.json(books);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/books/:id - Get single book
  router.get('/:id', (req, res) => {
    try {
      const book = bookService.getBook(db, req.params.id);
      res.json(book);
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: 'Book not found' });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // POST /api/books - Create a book
  router.post('/', (req, res) => {
    try {
      const input = createBookSchema.parse(req.body);
      const book = bookService.createBook(db, input);
      res.status(201).json(book);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
      } else if (error instanceof ConflictError) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  return router;
}
