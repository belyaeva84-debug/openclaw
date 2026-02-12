import type { DatabaseSync } from "node:sqlite";
import type { ResolvedMemorySearchConfig } from "../agents/memory-search.js";
import type { OpenClawConfig } from "../config/config.js";
import type { MemorySyncProgressUpdate } from "./types.js";

export type MemoryIndexMeta = {
  model: string;
  provider: string;
  providerKey?: string;
  chunkTokens: number;
  chunkOverlap: number;
  vectorDims?: number;
};

export type MemorySyncProgressState = {
  completed: number;
  total: number;
  label?: string;
  report: (update: MemorySyncProgressUpdate) => void;
};

export interface MemoryManagerContext {
  readonly db: DatabaseSync;
  readonly cfg: OpenClawConfig;
  readonly agentId: string;
  readonly workspaceDir: string;
  readonly settings: ResolvedMemorySearchConfig;

  ensureVectorReady(dimensions?: number): Promise<boolean>;
  readMeta(): MemoryIndexMeta | null;
  writeMeta(meta: MemoryIndexMeta): void;
  reindex(callback: () => Promise<void>): Promise<void>;
}
