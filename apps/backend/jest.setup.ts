import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
if (!process.env.DATABASE_ENABLED) {
  process.env.DATABASE_ENABLED = 'true';
}
