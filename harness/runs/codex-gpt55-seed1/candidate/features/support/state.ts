import type { Server } from "node:http";
import type { Db } from "../../backend/src/db";

export type RuntimeState = {
  baseUrl: string;
  db: Db | null;
  server: Server | null;
};

export const runtimeState: RuntimeState = {
  baseUrl: "",
  db: null,
  server: null
};
