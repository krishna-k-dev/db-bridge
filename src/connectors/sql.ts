import sql from "mssql";
import { SQLConnection } from "../types";
import { logger } from "../core/logger";
import { ConnectionPoolManager } from "./ConnectionPoolManager";

export class SQLConnector {
  private pool: sql.ConnectionPool | null = null;
  private config: SQLConnection | null = null;
  private static activeConnections = 0;
  private static readonly MAX_CONCURRENT_CONNECTIONS = Number(
    process.env.MAX_CONCURRENT_CONNECTIONS || 50
  );

  private static decrementActiveConnections(): void {
    SQLConnector.activeConnections = Math.max(
      0,
      SQLConnector.activeConnections - 1
    );
  }

  async connect(config: SQLConnection): Promise<void> {
    // If already connected with same config, return
    if (
      this.pool &&
      (this.pool as any).connected &&
      this.config &&
      this.config.server === config.server &&
      this.config.database === config.database
    ) {
      return;
    }

    // Wait if too many concurrent connections
    while (
      SQLConnector.activeConnections >= SQLConnector.MAX_CONCURRENT_CONNECTIONS
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      SQLConnector.activeConnections++;

      // Use shared pool manager
      const manager = ConnectionPoolManager.getInstance();
      this.pool = await manager.acquire(config);
      this.config = config;

      // Increase max listeners to prevent warning during parallel tests
      if (
        this.pool &&
        typeof (this.pool as any).setMaxListeners === "function"
      ) {
        (this.pool as any).setMaxListeners(200);
      }

      logger.info("Connected to SQL Server", undefined, {
        server: config.server,
        database: config.database,
      });
    } catch (error) {
      // Release reserved slot on error
      SQLConnector.decrementActiveConnections();

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to connect to SQL Server (${config.server}/${config.database}): ${errorMessage}`,
        undefined,
        error
      );
      throw error;
    }
  }

  async executeQuery(
    query: string,
    params?: Record<string, any>
  ): Promise<any[]> {
    if (!this.pool) {
      throw new Error("Not connected to database. Call connect() first.");
    }

    try {
      const request = this.pool.request();

      // Add parameters if provided
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Query execution failed: ${errorMessage}`, undefined, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool && this.config) {
      try {
        // Release to pool manager (may close later when no users)
        const manager = ConnectionPoolManager.getInstance();
        manager.release(this.config);
      } catch (error) {
        logger.error("Failed to release SQL pool", undefined, error);
      } finally {
        SQLConnector.decrementActiveConnections();
        this.pool = null;
        this.config = null;
        logger.info("Disconnected from SQL Server (released to manager)");
      }
    }
  }

  isConnected(): boolean {
    return this.pool !== null && (this.pool as any).connected;
  }

  static getActiveConnections(): number {
    return SQLConnector.activeConnections;
  }
}
