import 'dotenv/config';
import path from 'path';

import z from 'zod';

const envSchema = z.object({
  DEBUG: z
    .stringbool("Enviroment Variable 'DEBUG' should have a boolean-ish value")
    .default(false),
  DATAPATH: z
    .string('')
    .transform((t) => path.resolve(import.meta.dirname, '..', t))
});

const parse = envSchema.safeParse(process.env);

if (!parse.success) {
  parse.error.issues.forEach((i) => {
    console.error(i.message);
  });

  throw new Error(`Enviroment variable did not set up correctly`);
}

export default parse.data;
