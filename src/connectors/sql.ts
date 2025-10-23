import sql from "mssql";
import { SQLConnection } from "../types";
import { logger } from "../core/logger";

export class SQLConnector {
  private pool: sql.ConnectionPool | null = null;
  private static activeConnections = 0;
  private static readonly MAX_CONCURRENT_CONNECTIONS = 20;

  async connect(config: SQLConnection): Promise<void> {
    // Wait if too many concurrent connections
    while (
      SQLConnector.activeConnections >= SQLConnector.MAX_CONCURRENT_CONNECTIONS
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      SQLConnector.activeConnections++;

      // Add connection timeout to config
      const connectionConfig = {
        ...config,
        connectionTimeout: 10000, // 10 seconds - give connections enough time
        requestTimeout: 15000, // 15 seconds
        pool: {
          max: 5,
          min: 0,
          idleTimeoutMillis: 10000, // 10 seconds
        },
      } as sql.config;

      this.pool = await sql.connect(connectionConfig);

      // Increase max listeners to prevent warning during parallel tests
      if (
        this.pool &&
        typeof (this.pool as any).setMaxListeners === "function"
      ) {
        (this.pool as any).setMaxListeners(30);
      }

      logger.info("Connected to SQL Server", undefined, {
        server: config.server,
        database: config.database,
      });
    } catch (error) {
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
    if (this.pool) {
      try {
        await this.pool.close();
        SQLConnector.activeConnections--;
      } catch (error) {
        SQLConnector.activeConnections--;
        logger.error("Failed to disconnect from SQL Server", undefined, error);
      }
      this.pool = null;
      logger.info("Disconnected from SQL Server");
    }
  }

  isConnected(): boolean {
    return this.pool !== null && this.pool.connected;
  }
}
