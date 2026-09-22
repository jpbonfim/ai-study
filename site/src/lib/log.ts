import { db, type ActivityLogRow } from './db.ts';

/**
 * Registra uma atividade no banco de dados
 */
export function logActivity(
  userId: number | null,
  action: string,
  details?: Record<string, any> | string | null,
  ipAddress: string | null = null,
  userAgent: string | null = null
): void {
  try {
    const detailsStr = typeof details === 'object' && details !== null
      ? JSON.stringify(details)
      : (details || null);

    const stmt = db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId, action, detailsStr, ipAddress, userAgent);
  } catch (err) {
    console.error('[LOG] Erro ao registrar atividade:', err);
  }
}

/**
 * Remove logs mais antigos que o período de retenção configurado
 */
export function cleanOldLogs(): number {
  try {
    const days = parseInt(process.env.LOG_RETENTION_DAYS || '90', 10);
    const stmt = db.prepare(`
      DELETE FROM activity_logs
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(days);
    return result.changes;
  } catch (err) {
    console.error('[LOG] Erro ao limpar logs antigos:', err);
    return 0;
  }
}

// Executa limpeza inicial e agenda limpeza a cada 24 horas
cleanOldLogs();
const logInterval = setInterval(() => {
  cleanOldLogs();
}, 24 * 60 * 60 * 1000);
logInterval.unref();

export interface LogFilterOptions {
  userId?: number;
  action?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Consulta logs com filtros e paginação
 */
export function queryLogs(options: LogFilterOptions = {}) {
  const {
    userId,
    action,
    search,
    fromDate,
    toDate,
    limit = 50,
    offset = 0,
  } = options;

  let whereClauses: string[] = ['1=1'];
  const params: any[] = [];

  if (userId !== undefined && userId !== null) {
    whereClauses.push('l.user_id = ?');
    params.push(userId);
  }

  if (action) {
    whereClauses.push('l.action = ?');
    params.push(action);
  }

  if (fromDate) {
    whereClauses.push('l.created_at >= ?');
    params.push(fromDate);
  }

  if (toDate) {
    whereClauses.push('l.created_at <= ?');
    params.push(toDate);
  }

  if (search) {
    whereClauses.push('(l.details LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereStr = whereClauses.join(' AND ');

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total
    FROM activity_logs l
    LEFT JOIN users u ON l.user_id = u.id
    WHERE ${whereStr}
  `);
  const { total } = countStmt.get(...params) as { total: number };

  const selectStmt = db.prepare(`
    SELECT 
      l.id,
      l.user_id,
      u.username,
      u.display_name,
      l.action,
      l.details,
      l.ip_address,
      l.user_agent,
      l.created_at
    FROM activity_logs l
    LEFT JOIN users u ON l.user_id = u.id
    WHERE ${whereStr}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = selectStmt.all(...params, limit, offset);

  return {
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
    logs: rows,
  };
}
