process.env.NODE_ENV = 'test';
process.env.PUBLISHING_QUEUE_API_KEY = process.env.PUBLISHING_QUEUE_API_KEY ?? '';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/publishing_queue_db';
