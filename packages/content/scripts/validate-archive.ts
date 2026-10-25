/**
 * Validates the frontmatter of an archive (default: ./archive), the check `npm run build` in
 * site/ used to provide. Exits with status 1 when a document is invalid.
 * Usage: npm run validate:archive [-- <archive-dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { validateArchive } from '../src/node';

const archiveDir = path.resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2] ?? 'archive');
if (!fs.existsSync(archiveDir)) {
  console.error(`Diretório não encontrado: ${archiveDir}`);
  process.exit(1);
}

const { checkedFiles, issues } = validateArchive(archiveDir);
for (const issue of issues) console.error(`✗ ${issue.file}: ${issue.message}`);
const invalidFiles = new Set(issues.map((issue) => issue.file)).size;
if (invalidFiles > 0) {
  console.error(`\n${invalidFiles} de ${checkedFiles} documentos com problemas em ${archiveDir}`);
  process.exit(1);
}
console.log(`✓ ${checkedFiles} documentos válidos em ${archiveDir}`);
