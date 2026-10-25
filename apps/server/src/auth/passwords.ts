import bcrypt from 'bcryptjs';

const COST = 10;

/** Asynchronous bcrypt so hashing never blocks the event loop for the whole computation. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
