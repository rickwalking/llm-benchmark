import { z } from 'zod';

export const createBookSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().min(1, 'Author is required'),
  isbn: z.string().regex(/^[0-9-]{10,17}$/, 'ISBN must be 10 or 13 digits, hyphens allowed'),
  total_copies: z.number().int().min(1, 'Must have at least 1 copy'),
});

export const createMemberSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
});

export const createLoanSchema = z.object({
  member_id: z.string().uuid('Invalid member ID'),
  book_id: z.string().uuid('Invalid book ID'),
});

export const createReservationSchema = z.object({
  member_id: z.string().uuid('Invalid member ID'),
  book_id: z.string().uuid('Invalid book ID'),
});
