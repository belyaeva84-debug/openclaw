import chokidar, { type FSWatcher } from "chokidar";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveSessionTranscriptsDirForAgent } from "../config/sessions/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { onSessionTranscriptUpdate } from "../sessions/transcript-events.js";
import { enforceEmbeddingMaxInputTokens } from "./embedding-chunk-limits.js";
import type { EmbeddingManager } from "./manager-embedding.js";
import type { MemoryManagerContext, MemorySyncProgressState } from "./manager-types.js";
import {
  buildFileEntry,
  chunkMarkdown,
  hashText,
  listMemoryFiles,
  normalizeExtraMemoryPaths,
  remapChunkLines,
  runWithConcurrency,
  type MemoryChunk,
  type MemoryFileEntry,
} from "./internal.js";
import {
  buildSessionEntry,
  listSessionFilesForAgent,
  sessionPathForFile,
  type SessionFileEntry,
} from "./session-files.js";
import type { MemorySource, MemorySyncProgressUpdate } from "./types.js";

const log = createSubsystemLogger("memory");

const VECTOR_TABLE = "chunks_vec";
const FTS_TABLE = "chunks_fts";
const SESSION_DIRTY_DEBOUNCE_MS = 5000;
const SESSION_DELTA_READ_CHUNK_BYTES = 64 * 1024;

const vectorToBlob = (embedding: number[]): Buffer =>
  Buffer.from(new Float32Array(embedding).buffer);

export class MemorySyncer {
  private watcher: FSWatcher | null = null;
  private watchTimer: NodeJS.Timeout | null = null;
  private sessionWatchTimer: NodeJS.Timeout | null = null;
  private sessionUnsubscribe: (() => void) | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private dirty = false;
  private sessionsDirty = false;
  private sessionsDirtyFiles = new Set<string>();
  private sessionPendingFiles = new Set<string>();
  private sessionDeltas = new Map<
    string,
    { lastSize: number; pendingBytes: number; pendingMessages: number }
  >();
  private sessionWarm = new Set<string>();
  private syncing: Promise<void> | null = null;
  private readonly sources: Set<MemorySource>;

  constructor(
    private readonly ctx: MemoryManagerContext,
    private readonly embeddingManager: EmbeddingManager,
  ) {
    this.sources = new Set(ctx.settings.sources);
    this.dirty = this.sources.has("memory");

    this.ensureWatcher();
    this.ensureSessionListener();
    this.ensureIntervalSync();
  }

  async warmSession(sessionKey?: string): Promise<void> {
    if (!this.ctx.settings.sync.onSessionStart) {
      return;
    }
    const key = sessionKey?.trim() || "";
    if (key && this.sessionWarm.has(key)) {
      return;
    }
    void this.sync({ reason: "session-start" }).catch((err) => {
      log.warn(`memory sync failed (session-start): ${String(err)}`);
    });
    if (key) {
      this.sessionWarm.add(key);
    }
  }

  async sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void> {
    if (this.syncing) {
      return this.syncing;
    }
    this.syncing = this.runSync(params).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  status() {
    return {
      dirty: this.dirty || this.sessionsDirty,
    };
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
      this.watchTimer = null;
    }
    if (this.sessionWatchTimer) {
      clearTimeout(this.sessionWatchTimer);
      this.sessionWatchTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    if (this.sessionUnsubscribe) {
      this.sessionUnsubscribe();
      this.sessionUnsubscribe = null;
    }
  }

  private ensureWatcher() {
    if (!this.sources.has("memory") || !this.ctx.settings.sync.watch || this.watcher) {
      return;
    }
    const additionalPaths = normalizeExtraMemoryPaths(this.ctx.workspaceDir, this.ctx.settings.extraPaths)
      .map((entry) => {
        try {
          const stat = fsSync.lstatSync(entry);
          return stat.isSymbolicLink() ? null : entry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is string => Boolean(entry));
    const watchPaths = new Set<string>([
      path.join(this.ctx.workspaceDir, "MEMORY.md"),
      path.join(this.ctx.workspaceDir, "memory.md"),
      path.join(this.ctx.workspaceDir, "memory"),
      ...additionalPaths,
    ]);
    this.watcher = chokidar.watch(Array.from(watchPaths), {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.ctx.settings.sync.watchDebounceMs,
        pollInterval: 100,
      },
    });
    const markDirty = () => {
      this.dirty = true;
      this.scheduleWatchSync();
    };
    this.watcher.on("add", markDirty);
    this.watcher.on("change", markDirty);
    this.watcher.on("unlink", markDirty);
  }

  private ensureSessionListener() {
    if (!this.sources.has("sessions") || this.sessionUnsubscribe) {
      return;
    }
    this.sessionUnsubscribe = onSessionTranscriptUpdate((update) => {
      if (this.closed) {
        return;
      }
      const sessionFile = update.sessionFile;
      if (!this.isSessionFileForAgent(sessionFile)) {
        return;
      }
      this.scheduleSessionDirty(sessionFile);
    });
  }

  private scheduleSessionDirty(sessionFile: string) {
    this.sessionPendingFiles.add(sessionFile);
    if (this.sessionWatchTimer) {
      return;
    }
    this.sessionWatchTimer = setTimeout(() => {
      this.sessionWatchTimer = null;
      void this.processSessionDeltaBatch().catch((err) => {
        log.warn(`memory session delta failed: ${String(err)}`);
      });
    }, SESSION_DIRTY_DEBOUNCE_MS);
  }

  private async processSessionDeltaBatch(): Promise<void> {
    if (this.sessionPendingFiles.size === 0) {
      return;
    }
    const pending = Array.from(this.sessionPendingFiles);
    this.sessionPendingFiles.clear();
    let shouldSync = false;
    for (const sessionFile of pending) {
      const delta = await this.updateSessionDelta(sessionFile);
      if (!delta) {
        continue;
      }
      const bytesThreshold = delta.deltaBytes;
      const messagesThreshold = delta.deltaMessages;
      const bytesHit =
        bytesThreshold <= 0 ? delta.pendingBytes > 0 : delta.pendingBytes >= bytesThreshold;
      const messagesHit =
        messagesThreshold <= 0
          ? delta.pendingMessages > 0
          : delta.pendingMessages >= messagesThreshold;
      if (!bytesHit && !messagesHit) {
        continue;
      }
      this.sessionsDirtyFiles.add(sessionFile);
      this.sessionsDirty = true;
      delta.pendingBytes =
        bytesThreshold > 0 ? Math.max(0, delta.pendingBytes - bytesThreshold) : 0;
      delta.pendingMessages =
        messagesThreshold > 0 ? Math.max(0, delta.pendingMessages - messagesThreshold) : 0;
      shouldSync = true;
    }
    if (shouldSync) {
      void this.sync({ reason: "session-delta" }).catch((err) => {
        log.warn(`memory sync failed (session-delta): ${String(err)}`);
      });
    }
  }

  private async updateSessionDelta(sessionFile: string): Promise<{
    deltaBytes: number;
    deltaMessages: number;
    pendingBytes: number;
    pendingMessages: number;
  } | null> {
    const thresholds = this.ctx.settings.sync.sessions;
    if (!thresholds) {
      return null;
    }
    let stat: { size: number };
    try {
      stat = await fs.stat(sessionFile);
    } catch {
      return null;
    }
    const size = stat.size;
    let state = this.sessionDeltas.get(sessionFile);
    if (!state) {
      state = { lastSize: 0, pendingBytes: 0, pendingMessages: 0 };
      this.sessionDeltas.set(sessionFile, state);
    }
    const deltaBytes = Math.max(0, size - state.lastSize);
    if (deltaBytes === 0 && size === state.lastSize) {
      return {
        deltaBytes: thresholds.deltaBytes,
        deltaMessages: thresholds.deltaMessages,
        pendingBytes: state.pendingBytes,
        pendingMessages: state.pendingMessages,
      };
    }
    if (size < state.lastSize) {
      state.lastSize = size;
      state.pendingBytes += size;
      const shouldCountMessages =
        thresholds.deltaMessages > 0 &&
        (thresholds.deltaBytes <= 0 || state.pendingBytes < thresholds.deltaBytes);
      if (shouldCountMessages) {
        state.pendingMessages += await this.countNewlines(sessionFile, 0, size);
      }
    } else {
      state.pendingBytes += deltaBytes;
      const shouldCountMessages =
        thresholds.deltaMessages > 0 &&
        (thresholds.deltaBytes <= 0 || state.pendingBytes < thresholds.deltaBytes);
      if (shouldCountMessages) {
        state.pendingMessages += await this.countNewlines(sessionFile, state.lastSize, size);
      }
      state.lastSize = size;
    }
    this.sessionDeltas.set(sessionFile, state);
    return {
      deltaBytes: thresholds.deltaBytes,
      deltaMessages: thresholds.deltaMessages,
      pendingBytes: state.pendingBytes,
      pendingMessages: state.pendingMessages,
    };
  }

  private async countNewlines(absPath: string, start: number, end: number): Promise<number> {
    if (end <= start) {
      return 0;
    }
    const handle = await fs.open(absPath, "r");
    try {
      let offset = start;
      let count = 0;
      const buffer = Buffer.alloc(SESSION_DELTA_READ_CHUNK_BYTES);
      while (offset < end) {
        const toRead = Math.min(buffer.length, end - offset);
        const { bytesRead } = await handle.read(buffer, 0, toRead, offset);
        if (bytesRead <= 0) {
          break;
        }
        for (let i = 0; i < bytesRead; i += 1) {
          if (buffer[i] === 10) {
            count += 1;
          }
        }
        offset += bytesRead;
      }
      return count;
    } finally {
      await handle.close();
    }
  }

  private resetSessionDelta(absPath: string, size: number): void {
    const state = this.sessionDeltas.get(absPath);
    if (!state) {
      return;
    }
    state.lastSize = size;
    state.pendingBytes = 0;
    state.pendingMessages = 0;
  }

  private isSessionFileForAgent(sessionFile: string): boolean {
    if (!sessionFile) {
      return false;
    }
    const sessionsDir = resolveSessionTranscriptsDirForAgent(this.ctx.agentId);
    const resolvedFile = path.resolve(sessionFile);
    const resolvedDir = path.resolve(sessionsDir);
    return resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
  }

  private ensureIntervalSync() {
    const minutes = this.ctx.settings.sync.intervalMinutes;
    if (!minutes || minutes <= 0 || this.intervalTimer) {
      return;
    }
    const ms = minutes * 60 * 1000;
    this.intervalTimer = setInterval(() => {
      void this.sync({ reason: "interval" }).catch((err) => {
        log.warn(`memory sync failed (interval): ${String(err)}`);
      });
    }, ms);
  }

  private scheduleWatchSync() {
    if (!this.sources.has("memory") || !this.ctx.settings.sync.watch) {
      return;
    }
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
    }
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      void this.sync({ reason: "watch" }).catch((err) => {
        log.warn(`memory sync failed (watch): ${String(err)}`);
      });
    }, this.ctx.settings.sync.watchDebounceMs);
  }

  private shouldSyncSessions(
    params?: { reason?: string; force?: boolean },
    needsFullReindex = false,
  ) {
    if (!this.sources.has("sessions")) {
      return false;
    }
    if (params?.force) {
      return true;
    }
    const reason = params?.reason;
    if (reason === "session-start" || reason === "watch") {
      return false;
    }
    if (needsFullReindex) {
      return true;
    }
    return this.sessionsDirty && this.sessionsDirtyFiles.size > 0;
  }

  private createSyncProgress(
    onProgress: (update: MemorySyncProgressUpdate) => void,
  ): MemorySyncProgressState {
    const state: MemorySyncProgressState = {
      completed: 0,
      total: 0,
      label: undefined,
      report: (update) => {
        if (update.label) {
          state.label = update.label;
        }
        const label =
          update.total > 0 && state.label
            ? `${state.label} ${update.completed}/${update.total}`
            : state.label;
        onProgress({
          completed: update.completed,
          total: update.total,
          label,
        });
      },
    };
    return state;
  }

  private async runSync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }) {
    const progress = params?.progress ? this.createSyncProgress(params.progress) : undefined;
    if (progress) {
      progress.report({
        completed: progress.completed,
        total: progress.total,
        label: "Loading vector extension…",
      });
    }
    const vectorReady = await this.ctx.ensureVectorReady();
    const meta = this.ctx.readMeta();
    const needsFullReindex =
      params?.force ||
      !meta ||
      meta.model !== this.embeddingManager.provider.model ||
      meta.provider !== this.embeddingManager.provider.id ||
      meta.providerKey !== this.embeddingManager.providerKey ||
      meta.chunkTokens !== this.ctx.settings.chunking.tokens ||
      meta.chunkOverlap !== this.ctx.settings.chunking.overlap ||
      (vectorReady && !meta?.vectorDims);

    try {
      if (needsFullReindex) {
        await this.ctx.reindex(async () => {
          await this.performSyncLogic(params, true, progress);
        });
        return;
      }

      await this.performSyncLogic(params, false, progress);

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const activated =
        this.shouldFallbackOnError(reason) && (await this.embeddingManager.activateFallback(reason));
      if (activated) {
        // Retry with full reindex since provider changed
        await this.ctx.reindex(async () => {
          await this.performSyncLogic({ ...params, reason: params?.reason ?? "fallback", force: true }, true, progress);
        });
        return;
      }
      throw err;
    }
  }

  private async performSyncLogic(
    params: { reason?: string; force?: boolean } | undefined,
    needsFullReindex: boolean,
    progress?: MemorySyncProgressState
  ) {
    // Seed cache if full reindex (cache seeding logic is handled by reindex implementation in manager)
    // But reindex calls this callback.
    // The cache seeding is done BEFORE calling callback in runSafeReindex.

    const shouldSyncMemory =
        this.sources.has("memory") && (params?.force || needsFullReindex || this.dirty);
      const shouldSyncSessions = this.shouldSyncSessions(params, needsFullReindex);

      if (shouldSyncMemory) {
        await this.syncMemoryFiles({ needsFullReindex, progress });
        this.dirty = false;
      }

      if (shouldSyncSessions) {
        await this.syncSessionFiles({ needsFullReindex, progress });
        this.sessionsDirty = false;
        this.sessionsDirtyFiles.clear();
      } else if (this.sessionsDirtyFiles.size > 0) {
        this.sessionsDirty = true;
      } else {
        this.sessionsDirty = false;
      }
  }

  private shouldFallbackOnError(message: string): boolean {
    return /embedding|embeddings|batch/i.test(message);
  }

  private async syncMemoryFiles(params: {
    needsFullReindex: boolean;
    progress?: MemorySyncProgressState;
  }) {
    const files = await listMemoryFiles(this.ctx.workspaceDir, this.ctx.settings.extraPaths);
    const fileEntries = await Promise.all(
      files.map(async (file) => buildFileEntry(file, this.ctx.workspaceDir)),
    );
    log.debug("memory sync: indexing memory files", {
      files: fileEntries.length,
      needsFullReindex: params.needsFullReindex,
      batch: this.embeddingManager.status().batch?.enabled,
      concurrency: this.embeddingManager.indexConcurrency,
    });
    const activePaths = new Set(fileEntries.map((entry) => entry.path));
    if (params.progress) {
      params.progress.total += fileEntries.length;
      params.progress.report({
        completed: params.progress.completed,
        total: params.progress.total,
        label: this.embeddingManager.status().batch?.enabled ? "Indexing memory files (batch)..." : "Indexing memory files…",
      });
    }

    const tasks = fileEntries.map((entry) => async () => {
      const record = this.ctx.db
        .prepare(`SELECT hash FROM files WHERE path = ? AND source = ?`)
        .get(entry.path, "memory") as { hash: string } | undefined;
      if (!params.needsFullReindex && record?.hash === entry.hash) {
        if (params.progress) {
          params.progress.completed += 1;
          params.progress.report({
            completed: params.progress.completed,
            total: params.progress.total,
          });
        }
        return;
      }
      await this.indexFile(entry, { source: "memory" });
      if (params.progress) {
        params.progress.completed += 1;
        params.progress.report({
          completed: params.progress.completed,
          total: params.progress.total,
        });
      }
    });
    await runWithConcurrency(tasks, this.embeddingManager.indexConcurrency);

    const staleRows = this.ctx.db
      .prepare(`SELECT path FROM files WHERE source = ?`)
      .all("memory") as Array<{ path: string }>;
    for (const stale of staleRows) {
      if (activePaths.has(stale.path)) {
        continue;
      }
      this.ctx.db.prepare(`DELETE FROM files WHERE path = ? AND source = ?`).run(stale.path, "memory");
      try {
        this.ctx.db
          .prepare(
            `DELETE FROM ${VECTOR_TABLE} WHERE id IN (SELECT id FROM chunks WHERE path = ? AND source = ?)`,
          )
          .run(stale.path, "memory");
      } catch {}
      this.ctx.db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(stale.path, "memory");
      if (this.ctx.settings.query.hybrid.enabled) { // Using settings for FTS enabled
        try {
          this.ctx.db
            .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
            .run(stale.path, "memory", this.embeddingManager.provider.model);
        } catch {}
      }
    }
  }

  private async syncSessionFiles(params: {
    needsFullReindex: boolean;
    progress?: MemorySyncProgressState;
  }) {
    const files = await listSessionFilesForAgent(this.ctx.agentId);
    const activePaths = new Set(files.map((file) => sessionPathForFile(file)));
    const indexAll = params.needsFullReindex || this.sessionsDirtyFiles.size === 0;
    log.debug("memory sync: indexing session files", {
      files: files.length,
      indexAll,
      dirtyFiles: this.sessionsDirtyFiles.size,
      batch: this.embeddingManager.status().batch?.enabled,
      concurrency: this.embeddingManager.indexConcurrency,
    });
    if (params.progress) {
      params.progress.total += files.length;
      params.progress.report({
        completed: params.progress.completed,
        total: params.progress.total,
        label: this.embeddingManager.status().batch?.enabled ? "Indexing session files (batch)..." : "Indexing session files…",
      });
    }

    const tasks = files.map((absPath) => async () => {
      if (!indexAll && !this.sessionsDirtyFiles.has(absPath)) {
        if (params.progress) {
          params.progress.completed += 1;
          params.progress.report({
            completed: params.progress.completed,
            total: params.progress.total,
          });
        }
        return;
      }
      const entry = await buildSessionEntry(absPath);
      if (!entry) {
        if (params.progress) {
          params.progress.completed += 1;
          params.progress.report({
            completed: params.progress.completed,
            total: params.progress.total,
          });
        }
        return;
      }
      const record = this.ctx.db
        .prepare(`SELECT hash FROM files WHERE path = ? AND source = ?`)
        .get(entry.path, "sessions") as { hash: string } | undefined;
      if (!params.needsFullReindex && record?.hash === entry.hash) {
        if (params.progress) {
          params.progress.completed += 1;
          params.progress.report({
            completed: params.progress.completed,
            total: params.progress.total,
          });
        }
        this.resetSessionDelta(absPath, entry.size);
        return;
      }
      await this.indexFile(entry, { source: "sessions", content: entry.content });
      this.resetSessionDelta(absPath, entry.size);
      if (params.progress) {
        params.progress.completed += 1;
        params.progress.report({
          completed: params.progress.completed,
          total: params.progress.total,
        });
      }
    });
    await runWithConcurrency(tasks, this.embeddingManager.indexConcurrency);

    const staleRows = this.ctx.db
      .prepare(`SELECT path FROM files WHERE source = ?`)
      .all("sessions") as Array<{ path: string }>;
    for (const stale of staleRows) {
      if (activePaths.has(stale.path)) {
        continue;
      }
      this.ctx.db
        .prepare(`DELETE FROM files WHERE path = ? AND source = ?`)
        .run(stale.path, "sessions");
      try {
        this.ctx.db
          .prepare(
            `DELETE FROM ${VECTOR_TABLE} WHERE id IN (SELECT id FROM chunks WHERE path = ? AND source = ?)`,
          )
          .run(stale.path, "sessions");
      } catch {}
      this.ctx.db
        .prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`)
        .run(stale.path, "sessions");
      if (this.ctx.settings.query.hybrid.enabled) {
        try {
          this.ctx.db
            .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
            .run(stale.path, "sessions", this.embeddingManager.provider.model);
        } catch {}
      }
    }
  }

  private async indexFile(
    entry: MemoryFileEntry | SessionFileEntry,
    options: { source: MemorySource; content?: string },
  ) {
    const content = options.content ?? (await fs.readFile(entry.absPath, "utf-8"));
    const chunks = enforceEmbeddingMaxInputTokens(
      this.embeddingManager.provider,
      chunkMarkdown(content, this.ctx.settings.chunking).filter(
        (chunk) => chunk.text.trim().length > 0,
      ),
    );
    if (options.source === "sessions" && "lineMap" in entry) {
      remapChunkLines(chunks, entry.lineMap);
    }
    const embeddings = await this.embeddingManager.embedChunks(chunks, entry, options.source);
    const sample = embeddings.find((embedding) => embedding.length > 0);
    const vectorReady = sample ? await this.ctx.ensureVectorReady(sample.length) : false;
    const now = Date.now();

    if (vectorReady) {
      try {
        this.ctx.db
          .prepare(
            `DELETE FROM ${VECTOR_TABLE} WHERE id IN (SELECT id FROM chunks WHERE path = ? AND source = ?)`,
          )
          .run(entry.path, options.source);
      } catch {}
    }
    if (this.ctx.settings.query.hybrid.enabled) {
      // We check fts availability via settings or assume manager checks it.
      // But manager stores "available". We can't access "available" directly without manager exposing it.
      // Actually manager context doesn't expose FTS availability.
      // But FTS availability is usually persistent if enabled.
      // We can try/catch insert.
      try {
        this.ctx.db
          .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
          .run(entry.path, options.source, this.embeddingManager.provider.model);
      } catch {}
    }
    this.ctx.db
      .prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`)
      .run(entry.path, options.source);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i] ?? [];
      const id = hashText(
        `${options.source}:${entry.path}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}:${this.embeddingManager.provider.model}`,
      );
      this.ctx.db
        .prepare(
          `INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             hash=excluded.hash,
             model=excluded.model,
             text=excluded.text,
             embedding=excluded.embedding,
             updated_at=excluded.updated_at`,
        )
        .run(
          id,
          entry.path,
          options.source,
          chunk.startLine,
          chunk.endLine,
          chunk.hash,
          this.embeddingManager.provider.model,
          chunk.text,
          JSON.stringify(embedding),
          now,
        );
      if (vectorReady && embedding.length > 0) {
        try {
          this.ctx.db.prepare(`DELETE FROM ${VECTOR_TABLE} WHERE id = ?`).run(id);
        } catch {}
        this.ctx.db
          .prepare(`INSERT INTO ${VECTOR_TABLE} (id, embedding) VALUES (?, ?)`)
          .run(id, vectorToBlob(embedding));
      }
      if (this.ctx.settings.query.hybrid.enabled) {
        try {
          this.ctx.db
            .prepare(
              `INSERT INTO ${FTS_TABLE} (text, id, path, source, model, start_line, end_line)\n` +
                ` VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              chunk.text,
              id,
              entry.path,
              options.source,
              this.embeddingManager.provider.model,
              chunk.startLine,
              chunk.endLine,
            );
        } catch {}
      }
    }
    this.ctx.db
      .prepare(
        `INSERT INTO files (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           source=excluded.source,
           hash=excluded.hash,
           mtime=excluded.mtime,
           size=excluded.size`,
      )
      .run(entry.path, options.source, entry.hash, entry.mtimeMs, entry.size);
  }
}
