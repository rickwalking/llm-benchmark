import { AfterAll, Before, BeforeAll } from "@cucumber/cucumber";
import { createServer } from "node:http";

import { createApp } from "../../backend/src/app";
import { createMemoryDatabase, resetDatabase } from "../../backend/src/db";
import { runtimeState } from "./state";
import type { LibraryWorld } from "./world";

BeforeAll(async function () {
  const db = createMemoryDatabase(false);
  const server = createServer(createApp(db));
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start BDD API server");
  }
  runtimeState.db = db;
  runtimeState.server = server;
  runtimeState.baseUrl = `http://127.0.0.1:${address.port}`;
});

Before(function (this: LibraryWorld) {
  if (!runtimeState.db) {
    throw new Error("BDD database is not initialized");
  }
  resetDatabase(runtimeState.db);
  this.baseUrl = runtimeState.baseUrl;
  this.db = runtimeState.db;
  this.books = new Map();
  this.members = new Map();
  this.lastStatus = 0;
  this.lastBody = null;
  this.lastFine = null;
});

AfterAll(async function () {
  await new Promise<void>((resolve, reject) => {
    runtimeState.server?.close((error) => (error ? reject(error) : resolve()));
  });
  runtimeState.db?.close();
});
