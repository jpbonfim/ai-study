/**
 * Client Study Cache Engine
 * Gerencia cache persistente em localStorage para capítulos e metadados de estudo,
 * garantindo navegação instantânea mesmo após fechar a aba ou navegar entre matérias.
 * Implementa controle de TTL (tempo de vida) e estratégia de evicção LRU.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface ManifestEntry {
  key: string;
  timestamp: number;
}

class ClientStudyCache {
  private prefix = 'study_cache_v2:';
  private manifestKey = 'study_cache_v2:__manifest__';
  private ttlMs = 1440 * 60 * 1000; // Padrão: 24 horas (1440 min)
  private maxEntries = 50; // Padrão: 50 capítulos mais recentes

  constructor() {
    this.safeExecute(() => {
      this.clearExpired();
    });
  }

  /**
   * Inicializa ou atualiza as configurações de cache (normalmente injetadas via .env)
   */
  public setConfig(config: { ttlMinutes?: number; maxEntries?: number }): void {
    if (typeof config.ttlMinutes === 'number' && config.ttlMinutes > 0) {
      this.ttlMs = config.ttlMinutes * 60 * 1000;
    }
    if (typeof config.maxEntries === 'number' && config.maxEntries > 0) {
      this.maxEntries = config.maxEntries;
    }
  }

  /**
   * Gera a chave para um capítulo individual
   */
  private getChapterKey(materiaSlug: string, ownerId: number, chapterId: string): string {
    return `${this.prefix}ch:${materiaSlug}:${ownerId}:${chapterId}`;
  }

  /**
   * Gera a chave para a lista de metadados de uma tag
   */
  private getTagMetaKey(materiaSlug: string, ownerId: number, tag: string): string {
    return `${this.prefix}tag_meta:${materiaSlug}:${ownerId}:${tag}`;
  }

  /**
   * Obtém o HTML compilado de um capítulo do cache persistente
   */
  public getChapter(materiaSlug: string, ownerId: number, chapterId: string): string | null {
    return this.safeExecute(() => {
      const key = this.getChapterKey(materiaSlug, ownerId, chapterId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const entry: CacheEntry<{ html: string; title?: string }> = JSON.parse(raw);
      const now = Date.now();

      if (now - entry.timestamp > this.ttlMs) {
        this.removeItem(key);
        return null;
      }

      // Atualiza timestamp para preservar no LRU (acesso recente)
      this.touchItem(key);
      return entry.data?.html || null;
    }) || null;
  }

  /**
   * Salva o HTML de um capítulo no cache persistente
   */
  public setChapter(
    materiaSlug: string,
    ownerId: number,
    chapterId: string,
    html: string,
    title?: string
  ): void {
    this.safeExecute(() => {
      if (!html) return;
      const key = this.getChapterKey(materiaSlug, ownerId, chapterId);
      const entry: CacheEntry<{ html: string; title?: string }> = {
        data: { html, title },
        timestamp: Date.now(),
      };

      this.ensureSpace();

      try {
        localStorage.setItem(key, JSON.stringify(entry));
        this.touchItem(key);
      } catch (err: any) {
        // Se a cota do localStorage for excedida, evicta os 5 itens mais antigos e tenta novamente
        this.evictOldest(5);
        try {
          localStorage.setItem(key, JSON.stringify(entry));
          this.touchItem(key);
        } catch {
          // Falha silenciosa se o armazenamento estiver permanentemente bloqueado
        }
      }
    });
  }

  /**
   * Obtém a lista de metadados de capítulos de uma tag em cache
   */
  public getTagMeta(materiaSlug: string, ownerId: number, tag: string): any[] | null {
    return this.safeExecute(() => {
      const key = this.getTagMetaKey(materiaSlug, ownerId, tag);
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const entry: CacheEntry<any[]> = JSON.parse(raw);
      if (Date.now() - entry.timestamp > this.ttlMs) {
        this.removeItem(key);
        return null;
      }

      this.touchItem(key);
      return entry.data || null;
    }) || null;
  }

  /**
   * Salva a lista de metadados de uma tag em cache
   */
  public setTagMeta(materiaSlug: string, ownerId: number, tag: string, chapters: any[]): void {
    this.safeExecute(() => {
      const key = this.getTagMetaKey(materiaSlug, ownerId, tag);
      const entry: CacheEntry<any[]> = {
        data: chapters,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(entry));
      this.touchItem(key);
    });
  }

  /**
   * Registra ou atualiza o acesso a uma chave no manifesto LRU
   */
  private touchItem(key: string): void {
    const manifest = this.getManifest();
    const filtered = manifest.filter((m) => m.key !== key);
    filtered.push({ key, timestamp: Date.now() });
    this.saveManifest(filtered);
  }

  /**
   * Remove um item do cache e do manifesto
   */
  private removeItem(key: string): void {
    localStorage.removeItem(key);
    const manifest = this.getManifest();
    this.saveManifest(manifest.filter((m) => m.key !== key));
  }

  /**
   * Garante que o número de entradas não exceda o limite máximo LRU
   */
  private ensureSpace(): void {
    const manifest = this.getManifest();
    if (manifest.length >= this.maxEntries) {
      const toRemove = manifest.length - this.maxEntries + 1;
      this.evictOldest(toRemove);
    }
  }

  /**
   * Remove os N itens mais antigos
   */
  private evictOldest(count: number): void {
    const manifest = this.getManifest();
    manifest.sort((a, b) => a.timestamp - b.timestamp);
    const victims = manifest.slice(0, count);
    for (const v of victims) {
      localStorage.removeItem(v.key);
    }
    const remaining = manifest.slice(count);
    this.saveManifest(remaining);
  }

  /**
   * Limpa itens que já expiraram pelo TTL
   */
  public clearExpired(): void {
    const manifest = this.getManifest();
    const now = Date.now();
    const survivors: ManifestEntry[] = [];

    for (const item of manifest) {
      if (now - item.timestamp > this.ttlMs) {
        localStorage.removeItem(item.key);
      } else {
        survivors.push(item);
      }
    }
    this.saveManifest(survivors);
  }

  private getManifest(): ManifestEntry[] {
    try {
      const raw = localStorage.getItem(this.manifestKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveManifest(manifest: ManifestEntry[]): void {
    try {
      localStorage.setItem(this.manifestKey, JSON.stringify(manifest));
    } catch {
      // Ignora erro de gravação do manifesto
    }
  }

  private safeExecute<T>(fn: () => T): T | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return null;
    }
    try {
      return fn();
    } catch {
      return null;
    }
  }
}

export const clientStudyCache = new ClientStudyCache();

// Disponibiliza no objeto window para fácil acesso e inspeção
if (typeof window !== 'undefined') {
  (window as any).clientStudyCache = clientStudyCache;
}
