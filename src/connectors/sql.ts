import sql from "mssql";
import { SQLConnection } from "../types";
import { logger } from "../core/logger";

export class SQLConnector {
  private pool: sql.ConnectionPool | null = null;

  async connect(config: SQLConnection): Promise<void> {
    try {
      this.pool = await sql.connect(config as sql.config);
      logger.info("Connected to SQL Server", undefined, {
        server: config.server,
        database: config.database,
      });
    } catch (error) {
      logger.error("Failed to connect to SQL Server", undefined, error);
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
      logger.error("Query execution failed", undefined, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      logger.info("Disconnected from SQL Server");
    }
  }

  isConnected(): boolean {
    return this.pool !== null && this.pool.connected;
  }
}
