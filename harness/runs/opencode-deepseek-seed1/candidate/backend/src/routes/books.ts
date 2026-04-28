import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';
import * as bookService from '../services/bookService.js';
import * as reservationService from '../services/reservationService.js';
import { createBookSchema } from '../validators.js';
import { DomainError, NotFoundError } from '../errors.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  reservationService.expireStaleReservations(db);
  const books = bookService.listBooks(db);
  res.json(books);
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  reservationService.expireStaleReservations(db);

  const id = req.params.id as string;
  const book = bookService.getBook(db, id);
  if (!book) throw new NotFoundError('Book not found');

  const queueDepth = bookService.getBookReservationQueueDepth(db, id);

  let queuePosition: {
    position: number | null;
    hasNotification: boolean;
    expiresIn: number | null;
  } | null = null;

  const memberId = req.query.member_id as string | undefined;
  if (memberId) {
    queuePosition = reservationService.getBookQueuePosition(db, id, memberId);
  }

  res.json({ ...book, queue_depth: queueDepth, queue_position: queuePosition });
});

router.post('/', (req: Request, res: Response) => {
  const parsed = createBookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const db = getDb();
  try {
    const book = bookService.createBook(db, parsed.data);
    res.status(201).json(book);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
