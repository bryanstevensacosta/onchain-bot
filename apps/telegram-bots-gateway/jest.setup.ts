process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ??
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/telegram_bots_db';
