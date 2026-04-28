import { setWorldConstructor, type IWorldOptions, World } from '@cucumber/cucumber';
import type { Express } from 'express';
import request, { type Response } from 'supertest';
import { buildApp } from '../../backend/src/app.js';
import { openDatabase } from '../../backend/src/db/index.js';
import type { DB } from '../../backend/src/db/index.js';

interface Catalog {
  members: Record<string, string>; // name -> id
  books: Record<string, string>; // title -> id
}

export class LibraryWorld extends World {
  db!: DB;
  app!: Express;
  currentMember: string | null = null;
  lastResponse: Response | null = null;
  catalog: Catalog = { members: {}, books: {} };

  constructor(options: IWorldOptions) {
    super(options);
  }

  async start(): Promise<void> {
    this.db = openDatabase({ filename: ':memory:', seed: false });
    this.app = buildApp(this.db);
    this.currentMember = null;
    this.lastResponse = null;
    this.catalog = { members: {}, books: {} };
  }

  async stop(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  agent() {
    return request(this.app);
  }

  bookId(title: string): string {
    const id = this.catalog.books[title];
    if (!id) throw new Error(`Unknown book in scenario: ${title}`);
    return id;
  }

  memberId(name: string): string {
    const id = this.catalog.members[name];
    if (!id) throw new Error(`Unknown member in scenario: ${name}`);
    return id;
  }

  resolveMember(name: string): string {
    if (name === 'the current member' || name === 'they') {
      if (!this.currentMember) throw new Error('No current member set');
      return this.currentMember;
    }
    return this.memberId(name);
  }
}

setWorldConstructor(LibraryWorld);
