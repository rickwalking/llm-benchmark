import { request, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001';

export async function api(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API });
}

export async function resetState(): Promise<void> {
  const ctx = await api();
  await ctx.post('/api/dev/reset');
  await ctx.dispose();
}

export interface CreatedBook {
  id: string;
  title: string;
  total_copies: number;
}

export interface CreatedMember {
  id: string;
  name: string;
  email: string;
}

let counter = 0;

export async function createBook(
  override: Partial<{ title: string; author: string; isbn: string; total_copies: number }> = {},
): Promise<CreatedBook> {
  counter += 1;
  const ctx = await api();
  const body = {
    title: `Spec Book ${counter}`,
    author: 'Spec Author',
    isbn: `978${String(counter + 1_000_000).padStart(10, '0')}`,
    total_copies: 1,
    ...override,
  };
  const res = await ctx.post('/api/books', { data: body });
  if (!res.ok()) throw new Error(`createBook failed: ${res.status()} ${await res.text()}`);
  const data = await res.json();
  await ctx.dispose();
  return { id: data.id, title: body.title, total_copies: body.total_copies };
}

export async function createMember(
  override: Partial<{ name: string; email: string }> = {},
): Promise<CreatedMember> {
  counter += 1;
  const ctx = await api();
  const body = {
    name: `Spec Member ${counter}`,
    email: `spec${counter}@example.com`,
    ...override,
  };
  const res = await ctx.post('/api/members', { data: body });
  if (!res.ok()) throw new Error(`createMember failed: ${res.status()} ${await res.text()}`);
  const data = await res.json();
  await ctx.dispose();
  return { id: data.id, name: body.name, email: body.email };
}

export async function borrow(memberId: string, bookId: string): Promise<{ id: string; due_at: string }> {
  const ctx = await api();
  const res = await ctx.post('/api/loans', { data: { member_id: memberId, book_id: bookId } });
  if (!res.ok()) throw new Error(`borrow failed: ${res.status()} ${await res.text()}`);
  const data = await res.json();
  await ctx.dispose();
  return data;
}

export async function reserve(memberId: string, bookId: string): Promise<{ id: string }> {
  const ctx = await api();
  const res = await ctx.post('/api/reservations', { data: { member_id: memberId, book_id: bookId } });
  if (!res.ok()) throw new Error(`reserve failed: ${res.status()} ${await res.text()}`);
  const data = await res.json();
  await ctx.dispose();
  return data;
}

export async function backdateLoan(loanId: string, days: number): Promise<void> {
  const ctx = await api();
  await ctx.post('/api/dev/backdate-loan', { data: { loan_id: loanId, days } });
  await ctx.dispose();
}
