import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { DomainError, ValidationError, statusForError } from '../errors.js';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof DomainError) {
    res.status(statusForError(err)).json({ error: err.message });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
};
