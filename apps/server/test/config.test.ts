import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-study-config-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('readConfig', () => {
  it('resolves relative paths against the application root', () => {
    const config = readConfig({ DATA_DIR: './data' }, root);
    expect(config.dataDir).toBe(path.join(root, 'data'));
    expect(config.databasePath).toBe(path.join(root, 'data', 'study.db'));
  });

  describe('local archive overlay', () => {
    it('uses <root>/archive outside production when it exists', () => {
      expect(readConfig({}, root).localArchive).toBeNull();
      fs.mkdirSync(path.join(root, 'archive'));
      expect(readConfig({}, root).localArchive).toEqual({ dir: path.join(root, 'archive'), userId: 1 });
      expect(readConfig({ NODE_ENV: 'production' }, root).localArchive).toBeNull();
    });

    it('follows ENABLE_LOCAL_ARCHIVE when set', () => {
      fs.mkdirSync(path.join(root, 'archive'));
      expect(readConfig({ ENABLE_LOCAL_ARCHIVE: 'false' }, root).localArchive).toBeNull();
      expect(readConfig({ ENABLE_LOCAL_ARCHIVE: 'true', NODE_ENV: 'production' }, root).localArchive).not.toBeNull();
    });

    it('accepts another folder and user', () => {
      const config = readConfig(
        { LOCAL_ARCHIVE_DIR: 'notas', LOCAL_ARCHIVE_USER_ID: '2', ENABLE_LOCAL_ARCHIVE: '1' },
        root,
      );
      expect(config.localArchive).toEqual({ dir: path.join(root, 'notas'), userId: 2 });
    });
  });
});
