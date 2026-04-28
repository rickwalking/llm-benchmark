import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';
import * as memberService from '../services/memberService.js';
import * as reservationService from '../services/reservationService.js';
import { createMemberSchema } from '../validators.js';
import { DomainError, NotFoundError } from '../errors.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const members = memberService.listMembers(db);
  res.json(members);
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  reservationService.expireStaleReservations(db);

  const id = req.params.id as string;
  const member = memberService.getMember(db, id);
  if (!member) throw new NotFoundError('Member not found');

  const activeLoans = memberService.getMemberActiveLoans(db, id);
  const reservations = memberService.getMemberReservations(db, id);
  const fines = memberService.getMemberFines(db, id);

  res.json({ ...member, active_loans: activeLoans, reservations, fines });
});

router.post('/', (req: Request, res: Response) => {
  const parsed = createMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const db = getDb();
  try {
    const member = memberService.createMember(db, parsed.data);
    res.status(201).json(member);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
