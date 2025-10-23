import sql from "mssql";
import { SQLConnection } from "../types";
import { logger } from "../core/logger";

interface PoolEntry {
  pool: sql.ConnectionPool;
  refCount: number;
  idleTimer?: NodeJS.Timeout;
  createdAt: Date;
  lastUsed: Date;
}

interface PoolMetrics {
  totalPools: number;
  activePools: number;
  totalConnections: number;
  poolsByServer: Map<string, number>;
}

export class ConnectionPoolManager {
  private static instance: ConnectionPoolManager;
  private pools = new Map<string, PoolEntry>();
  private poolMax: number;
  private idleCloseMs: number;
  private connectionTimeout: number;
  private requestTimeout: number;

  private constructor() {
    this.poolMax = Number(process.env.DB_POOL_MAX || 20);
    this.idleCloseMs = Number(process.env.DB_POOL_IDLE_MS || 30000);
    this.connectionTimeout = Number(process.env.DB_CONNECTION_TIMEOUT || 20000);
    this.requestTimeout = Number(process.env.DB_REQUEST_TIMEOUT || 30000);

    logger.info("ConnectionPoolManager initialized", undefined, {
      poolMax: this.poolMax,
      idleCloseMs: this.idleCloseMs,
      connectionTimeout: this.connectionTimeout,
      requestTimeout: this.requestTimeout,
    });
  }

  static getInstance(): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance) {
      ConnectionPoolManager.instance = new ConnectionPoolManager();
    }
    return ConnectionPoolManager.instance;
  }

  /**
   * Update configuration dynamically (from settings page)
   */
  updateConfig(config: {
    poolMax?: number;
    idleCloseMs?: number;
    connectionTimeout?: number;
    requestTimeout?: number;
  }): void {
    if (config.poolMax !== undefined) this.poolMax = config.poolMax;
    if (config.idleCloseMs !== undefined) this.idleCloseMs = config.idleCloseMs;
    if (config.connectionTimeout !== undefined)
      this.connectionTimeout = config.connectionTimeout;
    if (config.requestTimeout !== undefined)
      this.requestTimeout = config.requestTimeout;

    logger.info("ConnectionPoolManager config updated", undefined, config);
  }

  private keyFor(cfg: SQLConnection): string {
    // Create unique key based on server, database, user, port
    const key = {
      server: cfg.server,
      database: cfg.database,
      user: cfg.user || "",
      port: cfg.port || 1433,
    };
    return JSON.stringify(key);
  }

  async acquire(cfg: SQLConnection): Promise<sql.ConnectionPool> {
    const key = this.keyFor(cfg);
    const existing = this.pools.get(key);

    if (existing) {
      // Cancel scheduled close, bump refCount, update last used
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = undefined;
      }
      existing.refCount++;
      existing.lastUsed = new Date();

      // Ensure pool is connected
      if ((existing.pool as any).connected) {
        logger.info("Reusing existing pool", undefined, {
          key,
          refCount: existing.refCount,
        });
        return existing.pool;
      }

      // Try reconnecting if pool was disconnected
      try {
        await existing.pool.connect();
        logger.info("Reconnected existing pool", undefined, { key });
        return existing.pool;
      } catch (err) {
        logger.error("Failed to reconnect existing pool", undefined, err);
        // Remove failed pool and create new one below
        this.pools.delete(key);
      }
    }

    // Create new pool entry
    const connectionConfig = {
      ...cfg,
      pool: {
        max: this.poolMax,
        min: 0,
        idleTimeoutMillis: this.idleCloseMs,
      },
      connectionTimeout: this.connectionTimeout,
      requestTimeout: this.requestTimeout,
      options: {
        trustServerCertificate: true,
        encrypt: false,
        ...cfg.options,
      },
    } as sql.config;

    const pool = new sql.ConnectionPool(connectionConfig);

    // Attach error listener
    pool.on("error", (err: any) => {
      logger.error("SQL pool error", undefined, {
        error: err,
        server: cfg.server,
        database: cfg.database,
      });
    });

    try {
      await pool.connect();
      logger.info("Created new SQL pool", undefined, {
        server: cfg.server,
        database: cfg.database,
        poolMax: this.poolMax,
      });
    } catch (err) {
      // Ensure pool closed on failure
      try {
        await pool.close();
      } catch (_) {
        // ignore
      }
      logger.error("Failed to create SQL pool", undefined, {
        error: err,
        server: cfg.server,
        database: cfg.database,
      });
      throw err;
    }

    this.pools.set(key, {
      pool,
      refCount: 1,
      createdAt: new Date(),
      lastUsed: new Date(),
    });

    return pool;
  }

  release(cfg: SQLConnection): void {
    const key = this.keyFor(cfg);
    const entry = this.pools.get(key);

    if (!entry) {
      logger.warn("Attempted to release non-existent pool", undefined, { key });
      return;
    }

    entry.refCount = Math.max(0, entry.refCount - 1);
    entry.lastUsed = new Date();

    logger.info("Pool released", undefined, {
      key,
      refCount: entry.refCount,
    });

    if (entry.refCount === 0) {
      // Schedule close after idleCloseMs
      entry.idleTimer = setTimeout(async () => {
        logger.info("Closing idle pool", undefined, { key });
        try {
          await entry.pool.close();
        } catch (err) {
          logger.error("Error closing idle pool", undefined, err);
        } finally {
          this.pools.delete(key);
        }
      }, this.idleCloseMs);
    }
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): PoolMetrics {
    const poolsByServer = new Map<string, number>();
    let totalConnections = 0;
    let activePools = 0;

    for (const [key, entry] of this.pools) {
      if ((entry.pool as any).connected) {
        activePools++;
      }

      const poolSize = (entry.pool as any).size || 0;
      totalConnections += poolSize;

      try {
        const keyObj = JSON.parse(key);
        const server = keyObj.server || "unknown";
        poolsByServer.set(server, (poolsByServer.get(server) || 0) + 1);
      } catch (e) {
        // ignore parse errors
      }
    }

    return {
      totalPools: this.pools.size,
      activePools,
      totalConnections,
      poolsByServer,
    };
  }

  /**
   * Force close all pools (on shutdown)
   */
  async destroyAll(): Promise<void> {
    logger.info("Destroying all pools", undefined, {
      count: this.pools.size,
    });

    const promises: Promise<void>[] = [];

    for (const [key, entry] of this.pools) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      promises.push(
        entry.pool.close().catch((err) =>
          logger.error("Error closing pool during destroyAll", undefined, {
            key,
            error: err,
          })
        )
      );
      this.pools.delete(key);
    }

    await Promise.all(promises);
    logger.info("All pools destroyed");
  }

  /**
   * Get pool info for debugging/monitoring
   */
  getPoolInfo(): Array<{
    key: string;
    server: string;
    database: string;
    refCount: number;
    connected: boolean;
    createdAt: Date;
    lastUsed: Date;
    poolSize: number;
  }> {
    const info: Array<any> = [];

    for (const [key, entry] of this.pools) {
      try {
        const keyObj = JSON.parse(key);
        info.push({
          key,
          server: keyObj.server,
          database: keyObj.database,
          refCount: entry.refCount,
          connected: (entry.pool as any).connected || false,
          createdAt: entry.createdAt,
          lastUsed: entry.lastUsed,
          poolSize: (entry.pool as any).size || 0,
        });
      } catch (e) {
        // ignore parse errors
      }
    }

    return info;
  }
}
