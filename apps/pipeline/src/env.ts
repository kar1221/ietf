import dotenv from 'dotenv';
import path from 'path';

import z from 'zod';

const ROOT = path.resolve(import.meta.dirname, '../../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const envSchema = z.object({
  DATAPATH: z.string('').transform((t) => path.resolve(ROOT, t))
});

const parse = envSchema.safeParse(process.env);

if (!parse.success) {
  parse.error.issues.forEach((i) => {
    console.error(i.message);
  });

  throw new Error(`Enviroment variable did not set up correctly`);
}

export default parse.data;
