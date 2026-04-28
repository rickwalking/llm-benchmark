import { World, setWorldConstructor, type IWorldOptions } from "@cucumber/cucumber";
import type { Db } from "../../backend/src/db";
import type { FineRow } from "../../backend/src/services/types";

export class LibraryWorld extends World {
  baseUrl = "";
  db: Db | null = null;
  books = new Map<string, string>();
  members = new Map<string, string>();
  lastStatus = 0;
  lastBody: unknown = null;
  lastFine: FineRow | null = null;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers
      }
    });
    this.lastStatus = response.status;
    const text = await response.text();
    this.lastBody = text ? (JSON.parse(text) as unknown) : null;
    return this.lastBody;
  }

  requireDb(): Db {
    if (!this.db) {
      throw new Error("BDD database is not initialized");
    }
    return this.db;
  }

  memberId(name: string): string {
    const id = this.members.get(name);
    if (!id) {
      throw new Error(`Unknown member ${name}`);
    }
    return id;
  }

  bookId(title: string): string {
    const id = this.books.get(title);
    if (!id) {
      throw new Error(`Unknown book ${title}`);
    }
    return id;
  }
}

setWorldConstructor(LibraryWorld);
