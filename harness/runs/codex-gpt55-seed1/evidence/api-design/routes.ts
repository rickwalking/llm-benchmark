import cors from "cors";
import express, { type Request, type RequestHandler, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";

import { BadRequestError, DomainError } from "./errors";
import type { Db } from "./services/dbTypes";
import { createBook, getBook, listBooks } from "./services/bookService";
import { createMember, getMember, listMembers } from "./services/memberService";
import { borrowBook, returnLoan } from "./services/loanService";
import { expireStaleReservations, reserveBook } from "./services/reservationService";
import { payFine } from "./services/fineService";

type Handler = (req: Request, res: Response) => void | Promise<void>;

const isbnSchema = z
  .string()
  .trim()
  .refine((isbn) => /^(\d{10}|\d{13})$/.test(isbn.replaceAll("-", "")), "ISBN must be 10 or 13 digits");

const bookCreateSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1),
  isbn: isbnSchema,
  total_copies: z.number().int().min(1)
});

const memberCreateSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email()
});

const loanCreateSchema = z.object({
  member_id: z.string().uuid(),
  book_id: z.string().uuid()
});

const reservationCreateSchema = z.object({
  member_id: z.string().uuid(),
  book_id: z.string().uuid()
});

function route(handler: Handler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError("Invalid request");
  }
  return result.data;
}

function pathParam(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== "string") {
    throw new BadRequestError("Invalid request");
  }
  return value;
}

export function createApp(db: Db): express.Express {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: "http://localhost:5173"
    })
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get(
    "/api/books",
    route((_req, res) => {
      res.json(listBooks(db));
    })
  );

  app.get(
    "/api/books/:id",
    route((req, res) => {
      expireStaleReservations(db);
      const memberId = typeof req.query.member_id === "string" ? req.query.member_id : undefined;
      res.json(getBook(db, pathParam(req, "id"), memberId));
    })
  );

  app.post(
    "/api/books",
    route((req, res) => {
      res.status(201).json(createBook(db, parseBody(bookCreateSchema, req.body)));
    })
  );

  app.get(
    "/api/members",
    route((_req, res) => {
      res.json(listMembers(db));
    })
  );

  app.get(
    "/api/members/:id",
    route((req, res) => {
      expireStaleReservations(db);
      res.json(getMember(db, pathParam(req, "id")));
    })
  );

  app.post(
    "/api/members",
    route((req, res) => {
      res.status(201).json(createMember(db, parseBody(memberCreateSchema, req.body)));
    })
  );

  app.post(
    "/api/loans",
    route((req, res) => {
      res.status(201).json(borrowBook(db, parseBody(loanCreateSchema, req.body)));
    })
  );

  app.post(
    "/api/loans/:id/return",
    route((req, res) => {
      res.json(returnLoan(db, pathParam(req, "id")));
    })
  );

  app.post(
    "/api/reservations",
    route((req, res) => {
      res.status(201).json(reserveBook(db, parseBody(reservationCreateSchema, req.body)));
    })
  );

  app.post(
    "/api/reservations/expire",
    route((_req, res) => {
      res.json(expireStaleReservations(db));
    })
  );

  app.post(
    "/api/fines/:id/pay",
    route((req, res) => {
      res.json(payFine(db, pathParam(req, "id")));
    })
  );

  app.use((_req, _res, next) => {
    next(new BadRequestError("Route not found"));
  });

  app.use((err: unknown, _req: Request, res: Response, _next: (error?: unknown) => void) => {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
