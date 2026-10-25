import { Hono } from 'hono';
import type { SubjectCatalog } from '../archive/subject-catalog';
import { requireAdmin } from '../auth/middleware';
import { type AppEnv, currentUser, jsonError, parsePositiveInt, requestOrigin } from '../http/context';
import type { ActivityLog } from '../logs/activity-log';
import type { PermissionRepository } from '../permissions/permission-repository';
import { UserRuleError, type UserService } from '../users/user-service';

interface AdminRouteDeps {
  users: UserService;
  permissions: PermissionRepository;
  catalog: SubjectCatalog;
  activity: ActivityLog;
}

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof UserRuleError || err instanceof Error ? err.message || fallback : fallback;

/** Administration API used by /admin (users, subject sharing and the audit log). */
export function adminRoutes(deps: AdminRouteDeps) {
  const app = new Hono<AppEnv>();
  app.use('/admin/api/*', requireAdmin);

  app.get('/admin/api/users', (c) => c.json({ success: true, users: deps.users.list() }));

  app.post('/admin/api/users', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const user = await deps.users.create({
        username: String(body.username ?? ''),
        displayName: String(body.displayName ?? ''),
        password: String(body.password ?? ''),
        role: body.role === 'admin' ? 'admin' : 'normal',
      });
      deps.activity.record(
        currentUser(c).id,
        'admin_create_user',
        { newUserId: user.id, username: user.username, role: user.role },
        requestOrigin(c),
      );
      return c.json({ success: true, user }, 201);
    } catch (err) {
      return jsonError(c, 400, errorMessage(err, 'Erro ao criar usuário.'));
    }
  });

  app.put('/admin/api/users', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const id = parsePositiveInt(String(body.id ?? ''));
      if (!id) return jsonError(c, 400, 'ID do usuário é obrigatório.');
      const origin = requestOrigin(c);
      if (body.newPassword) {
        await deps.users.changePassword(id, String(body.newPassword));
        deps.activity.record(currentUser(c).id, 'admin_change_password', { targetUserId: id }, origin);
      }
      if (body.displayName !== undefined || body.role !== undefined) {
        const role = body.role === 'admin' || body.role === 'normal' ? body.role : undefined;
        const displayName = body.displayName !== undefined ? String(body.displayName) : undefined;
        deps.users.update(id, { displayName, role });
        deps.activity.record(currentUser(c).id, 'admin_update_user', { targetUserId: id, displayName, role }, origin);
      }
      return c.json({ success: true });
    } catch (err) {
      return jsonError(c, 400, errorMessage(err, 'Erro ao atualizar usuário.'));
    }
  });

  app.delete('/admin/api/users', (c) => {
    const id = parsePositiveInt(c.req.query('id'));
    if (!id) return jsonError(c, 400, 'ID inválido para exclusão.');
    if (id === currentUser(c).id) {
      return jsonError(c, 400, 'Você não pode remover sua própria conta de administrador.');
    }
    try {
      deps.users.delete(id);
      deps.activity.record(currentUser(c).id, 'admin_delete_user', { deletedUserId: id }, requestOrigin(c));
      return c.json({ success: true });
    } catch (err) {
      return jsonError(c, 400, errorMessage(err, 'Erro ao remover usuário.'));
    }
  });

  app.get('/admin/api/permissions', (c) => {
    const users = deps.users.list().map((u) => ({
      ...u,
      materias: deps.catalog.listOwn(u.id).map((m) => ({ slug: m.slug, name: m.name, code: m.code })),
    }));
    return c.json({ success: true, permissions: deps.permissions.listAll(), users });
  });

  app.post('/admin/api/permissions', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const ownerUserId = parsePositiveInt(String(body.ownerUserId ?? ''));
      const grantedUserId = parsePositiveInt(String(body.grantedUserId ?? ''));
      const subjectCode = String(body.subjectCode ?? '')
        .trim()
        .toUpperCase();
      const materiaSlug = String(body.materiaSlug ?? '')
        .trim()
        .toLowerCase();
      if (!ownerUserId || !grantedUserId || !subjectCode || !materiaSlug) {
        return jsonError(c, 400, 'Todos os campos são obrigatórios.');
      }
      if (ownerUserId === grantedUserId) return jsonError(c, 400, 'Não é necessário conceder permissão a si mesmo.');
      const grantedBy = currentUser(c).id;
      deps.permissions.upsert({ ownerUserId, grantedUserId, subjectCode, materiaSlug, grantedBy });
      deps.activity.record(grantedBy, 'admin_grant_permission', {
        ownerUserId,
        grantedUserId,
        subjectCode,
        materiaSlug,
      });
      return c.json({ success: true }, 201);
    } catch (err) {
      return jsonError(c, 400, errorMessage(err, 'Erro ao conceder permissão.'));
    }
  });

  app.delete('/admin/api/permissions', (c) => {
    const id = parsePositiveInt(c.req.query('id'));
    if (!id) return jsonError(c, 400, 'ID de permissão inválido.');
    const permission = deps.permissions.findById(id);
    if (permission) {
      deps.permissions.delete(id);
      deps.activity.record(currentUser(c).id, 'admin_revoke_permission', {
        permissionId: id,
        ownerUserId: permission.ownerUserId,
        grantedUserId: permission.grantedUserId,
        subjectCode: permission.subjectCode,
      });
    }
    return c.json({ success: true });
  });

  app.get('/admin/api/logs', (c) => {
    const page = Math.max(1, parsePositiveInt(c.req.query('page')) ?? 1);
    const limit = parsePositiveInt(c.req.query('limit')) ?? 50;
    const result = deps.activity.query({
      userId: parsePositiveInt(c.req.query('user_id')) ?? undefined,
      action: c.req.query('action') || undefined,
      search: c.req.query('search') || undefined,
      fromDate: c.req.query('from') || undefined,
      toDate: c.req.query('to') || undefined,
      limit,
      offset: (page - 1) * limit,
    });
    return c.json({ success: true, ...result });
  });

  return app;
}
