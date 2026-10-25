import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { adminRoutes } from './admin/routes';
import { ArchiveStore } from './archive/archive-store';
import { DocumentIndex } from './archive/document-index';
import { archiveRoutes } from './archive/routes';
import { SubjectCatalog } from './archive/subject-catalog';
import { identify } from './auth/middleware';
import { LoginRateLimiter } from './auth/rate-limiter';
import { authRoutes } from './auth/routes';
import { SessionStore } from './auth/session-store';
import type { AppConfig } from './config';
import type { AppDatabase } from './db/client';
import type { AppEnv } from './http/context';
import { ActivityLog, PageViewThrottle } from './logs/activity-log';
import { SubjectAccessPolicy } from './permissions/authorization';
import { PermissionRepository } from './permissions/permission-repository';
import { ArchiveTransfer } from './transfer/archive-transfer';
import { transferRoutes } from './transfer/routes';
import { UserRepository } from './users/user-repository';
import { UserService } from './users/user-service';

export interface Services {
  config: AppConfig;
  users: UserService;
  sessions: SessionStore;
  activity: ActivityLog;
}

/** Wires repositories, services and routes. Returns the Hono app and the services main.ts needs. */
export function createApp(config: AppConfig, db: AppDatabase): { app: Hono<AppEnv>; services: Services } {
  const userRepository = new UserRepository(db);
  const permissions = new PermissionRepository(db);
  const sessions = new SessionStore(db, config.sessionMaxAgeMs);
  const store = new ArchiveStore(config.dataDir, config.localArchive);
  const users = new UserService(userRepository, sessions, store);
  const activity = new ActivityLog(db);
  const rateLimiter = new LoginRateLimiter(config.loginRateLimit.maxAttempts, config.loginRateLimit.windowMs);
  const access = new SubjectAccessPolicy(permissions);
  const documents = new DocumentIndex();
  const catalog = new SubjectCatalog(store, documents, permissions, access);
  const transfer = new ArchiveTransfer(store);

  const app = new Hono<AppEnv>();
  app.use('*', identify({ sessions, users, rateLimiter }));
  app.route('/', authRoutes({ config, users, sessions, rateLimiter, activity, pageViews: new PageViewThrottle() }));
  app.route('/', archiveRoutes({ store, documents, catalog, access }));
  app.route('/', transferRoutes({ config, store, transfer, access, activity }));
  app.route('/', adminRoutes({ users, permissions, catalog, activity }));

  app.all('/api/*', (c) => c.json({ error: 'Rota não encontrada.' }, 404));
  app.all('/admin/api/*', (c) => c.json({ error: 'Rota não encontrada.' }, 404));

  if (config.webDistDir) mountSpa(app, config.webDistDir);

  return { app, services: { config, users, sessions, activity } };
}

/** Serves the built SPA; unknown paths fall back to index.html (client-side routing). */
function mountSpa(app: Hono<AppEnv>, distDir: string): void {
  const indexHtml = path.join(distDir, 'index.html');
  // Asset file names carry a content hash, so they never change.
  app.use(
    '/assets/*',
    serveStatic({
      root: distDir,
      onFound: (_path, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable'),
    }),
  );
  app.use('*', serveStatic({ root: distDir }));
  app.get('*', (c) => {
    if (!fs.existsSync(indexHtml)) return c.text('SPA não compilado (apps/web/dist).', 500);
    c.header('Cache-Control', 'no-cache');
    return c.html(fs.readFileSync(indexHtml, 'utf8'));
  });
}
