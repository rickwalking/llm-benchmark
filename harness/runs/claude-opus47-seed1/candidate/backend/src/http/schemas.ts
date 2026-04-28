import { z } from 'zod';

export const isbnSchema = z
  .string()
  .min(10)
  .max(20)
  .refine(
    (val) => /^(?:\d[-\s]?){9}[\dXx]$|^(?:\d[-\s]?){12}\d$/.test(val.trim()),
    { message: 'ISBN must be 10 or 13 digits (hyphens allowed)' },
  );

export const createBookSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  author: z.string().min(1, 'Author is required').max(200),
  isbn: isbnSchema,
  total_copies: z
    .number({ invalid_type_error: 'total_copies must be a number' })
    .int('total_copies must be an integer')
    .min(1, 'total_copies must be >= 1'),
});

export const createMemberSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email').max(200),
});

export const createLoanSchema = z.object({
  member_id: z.string().uuid('member_id must be a UUID'),
  book_id: z.string().uuid('book_id must be a UUID'),
});

export const createReservationSchema = z.object({
  member_id: z.string().uuid('member_id must be a UUID'),
  book_id: z.string().uuid('book_id must be a UUID'),
});

export const advanceClockSchema = z.object({
  days: z.number().int(),
});
