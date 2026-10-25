import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadEnvFile, readConfig } from './config';
import { openDatabase } from './db/client';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnvFile(path.join(repoRoot, '.env'));

const config = readConfig(process.env, process.env.APP_CWD ? path.resolve(process.env.APP_CWD) : repoRoot);
const database = openDatabase(config.databasePath);
const { app, services } = createApp(config, database.db);

await services.users.ensureInitialAdmin(config.initialAdmin);

const HOUR = 60 * 60 * 1000;
const purgeSessions = () => services.sessions.purgeExpired();
const purgeLogs = () => services.activity.purgeOlderThan(config.logRetentionDays);
purgeSessions();
purgeLogs();
setInterval(purgeSessions, HOUR).unref();
setInterval(purgeLogs, 24 * HOUR).unref();

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`[server] listening on http://${info.address}:${info.port} (data: ${config.dataDir})`);
});

const shutdown = () => {
  server.close(() => {
    database.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
