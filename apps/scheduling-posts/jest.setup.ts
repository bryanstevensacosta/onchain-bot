process.env.NODE_ENV = 'test';
process.env.SCHEDULING_POSTS_API_KEY = process.env.SCHEDULING_POSTS_API_KEY ?? '';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/scheduling_posts_db';
