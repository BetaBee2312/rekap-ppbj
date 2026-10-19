import mysql, { type Pool } from "mysql2/promise";

let pool: Pool | undefined;

export function getDbPool(): Pool {
  if (pool) return pool;

  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;

  if (!host || !database || !user) {
    throw new Error("Konfigurasi MySQL belum lengkap. Periksa DB_HOST, DB_NAME, dan DB_USER di .env.local.");
  }

  pool = mysql.createPool({
    host,
    port: Number(process.env.DB_PORT || 3306),
    user,
    password: process.env.DB_PASSWORD || "",
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    charset: "utf8mb4",
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
  });

  return pool;
}
