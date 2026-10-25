// Packages the server bundle loads from node_modules at runtime (native addons and CommonJS-heavy
// libraries). A release installs exactly these.
export const RUNTIME_EXTERNALS = ['better-sqlite3', 'bcryptjs', 'busboy', 'yauzl', 'yazl', 'gray-matter'];
