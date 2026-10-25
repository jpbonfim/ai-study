import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const intFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt(value ?? '', 10);
      return Number.isNaN(parsed) ? fallback : parsed;
    });

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: intFromEnv(3000),
  DATA_DIR: z.string().default('./data'),
  /** Optional: directory with the built SPA (apps/web/dist) to serve from this process. */
  WEB_DIST_DIR: z.string().optional(),
  /** Optional dev overlay: read this user's archive from a local folder (e.g. the skills' archive/). */
  LOCAL_ARCHIVE_DIR: z.string().optional(),
  LOCAL_ARCHIVE_USER_ID: intFromEnv(1),

  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('admin123'),
  ADMIN_DISPLAY_NAME: z.string().default('Administrador'),

  SESSION_MAX_AGE_DAYS: intFromEnv(7),
  LOGIN_MAX_ATTEMPTS: intFromEnv(5),
  LOGIN_WINDOW_MINUTES: intFromEnv(15),
  LOG_RETENTION_DAYS: intFromEnv(90),
  MAX_UPLOAD_MB_NORMAL: intFromEnv(50),
  MAX_UPLOAD_MB_ADMIN: intFromEnv(100),
  CLIENT_CACHE_TTL_MINUTES: intFromEnv(1440),
  CLIENT_CACHE_MAX_ENTRIES: intFromEnv(50),
});

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  webDistDir: string | null;
  localArchive: { dir: string; userId: number } | null;
  initialAdmin: { username: string; password: string; displayName: string };
  sessionMaxAgeMs: number;
  loginRateLimit: { maxAttempts: number; windowMs: number };
  logRetentionDays: number;
  maxUploadBytes: { normal: number; admin: number };
  clientCache: { ttlMinutes: number; maxEntries: number };
}

/** Loads `<root>/.env` into process.env (without overriding variables already set). */
export function loadEnvFile(envPath: string): void {
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): AppConfig {
  const parsed = envSchema.parse(env);
  const resolve = (p: string) => (path.isAbsolute(p) ? p : path.resolve(cwd, p));
  const dataDir = resolve(parsed.DATA_DIR);
  const mb = 1024 * 1024;

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    dataDir,
    databasePath: path.join(dataDir, 'study.db'),
    webDistDir: parsed.WEB_DIST_DIR ? resolve(parsed.WEB_DIST_DIR) : null,
    localArchive: parsed.LOCAL_ARCHIVE_DIR
      ? { dir: resolve(parsed.LOCAL_ARCHIVE_DIR), userId: parsed.LOCAL_ARCHIVE_USER_ID }
      : null,
    initialAdmin: {
      username: parsed.ADMIN_USERNAME.trim(),
      password: parsed.ADMIN_PASSWORD,
      displayName: parsed.ADMIN_DISPLAY_NAME.trim(),
    },
    sessionMaxAgeMs: parsed.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    loginRateLimit: { maxAttempts: parsed.LOGIN_MAX_ATTEMPTS, windowMs: parsed.LOGIN_WINDOW_MINUTES * 60 * 1000 },
    logRetentionDays: parsed.LOG_RETENTION_DAYS,
    maxUploadBytes: { normal: parsed.MAX_UPLOAD_MB_NORMAL * mb, admin: parsed.MAX_UPLOAD_MB_ADMIN * mb },
    clientCache: { ttlMinutes: parsed.CLIENT_CACHE_TTL_MINUTES, maxEntries: parsed.CLIENT_CACHE_MAX_ENTRIES },
  };
}
