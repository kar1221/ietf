import dotenv from 'dotenv';
import path from 'node:path';

import z from 'zod';

const ROOT = path.resolve(import.meta.dirname, '../../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const envSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgres')
});

const parse = envSchema.safeParse(process.env);

if (!parse.success) {
  parse.error.issues.forEach((i) => {
    console.error(i.message);
  });

  throw new Error(`Enviroment variable did not set up correctly`);
}

export default parse.data;
