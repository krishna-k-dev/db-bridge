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

    SQLConnector.activeConnections++;
    const manager = ConnectionPoolManager.getInstance();
    let lastError: Error | null = null;

    // Try static server first
    try {
      logger.info("Attempting connection to static server", undefined, {
        server: config.server,
        database: config.database,
      });

      this.pool = await manager.acquire(config);
      this.config = { ...config, activeServerType: "static" };

      // Increase max listeners to prevent warning during parallel tests
      if (
        this.pool &&
        typeof (this.pool as any).setMaxListeners === "function"
      ) {
        (this.pool as any).setMaxListeners(200);
      }

      logger.info("Connected to SQL Server via static server", undefined, {
        server: config.server,
        database: config.database,
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        `Static server connection failed (${config.server}/${config.database}): ${lastError.message}`,
        undefined,
        error
      );
    }

    // Try VPN server if static failed and VPN is configured
    if (config.vpnServer) {
      try {
        logger.info("Attempting connection to VPN server", undefined, {
          vpnServer: config.vpnServer,
          database: config.database,
        });

        const vpnConfig: SQLConnection = {
          ...config,
          server: config.vpnServer,
          port: config.vpnPort || config.port,
        };

        this.pool = await manager.acquire(vpnConfig);
        this.config = { ...config, activeServerType: "vpn" };

        // Increase max listeners
        if (
          this.pool &&
          typeof (this.pool as any).setMaxListeners === "function"
        ) {
          (this.pool as any).setMaxListeners(200);
        }

        logger.info("Connected to SQL Server via VPN server", undefined, {
          vpnServer: config.vpnServer,
          database: config.database,
        });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(
          `VPN server connection also failed (${config.vpnServer}/${config.database}): ${lastError.message}`,
          undefined,
          error
        );
      }
    }

    // Both failed - release reserved slot and throw
    SQLConnector.decrementActiveConnections();

    const errorMessage = lastError?.message || "Unknown connection error";
    logger.error(
      `Failed to connect to SQL Server via both static and VPN servers (${config.server}/${config.database}): ${errorMessage}`,
      undefined,
      lastError
    );
    throw lastError || new Error("Connection failed");
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
