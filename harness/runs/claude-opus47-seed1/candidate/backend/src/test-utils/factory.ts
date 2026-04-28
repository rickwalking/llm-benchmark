import type { Express } from 'express';
import request from 'supertest';
import { buildApp } from '../app.js';
import { openDatabase, type DB } from '../db/index.js';

export interface TestStack {
  app: Express;
  db: DB;
  agent: ReturnType<typeof request>;
  close: () => void;
}

export function makeStack(): TestStack {
  const db = openDatabase({ filename: ':memory:', seed: false });
  const app = buildApp(db);
  return {
    app,
    db,
    agent: request(app),
    close: () => db.close(),
  };
}

export async function makeBook(
  agent: ReturnType<typeof request>,
  overrides: Partial<{ title: string; author: string; isbn: string; total_copies: number }> = {},
): Promise<{ id: string }> {
  const counter = (makeBook.counter = (makeBook.counter ?? 0) + 1);
  const body = {
    title: `Test Book ${counter}`,
    author: 'Test Author',
    isbn: `978${String(counter).padStart(10, '0')}`,
    total_copies: 1,
    ...overrides,
  };
  const res = await agent.post('/api/books').send(body);
  if (res.status !== 201) {
    throw new Error(`book create failed (${res.status}): ${res.text}`);
  }
  return res.body;
}
makeBook.counter = 0;

export async function makeMember(
  agent: ReturnType<typeof request>,
  overrides: Partial<{ name: string; email: string }> = {},
): Promise<{ id: string }> {
  const counter = (makeMember.counter = (makeMember.counter ?? 0) + 1);
  const body = {
    name: `Member ${counter}`,
    email: `member${counter}@example.com`,
    ...overrides,
  };
  const res = await agent.post('/api/members').send(body);
  if (res.status !== 201) {
    throw new Error(`member create failed (${res.status}): ${res.text}`);
  }
  return res.body;
}
makeMember.counter = 0;
