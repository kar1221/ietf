import 'dotenv/config';

import z from 'zod';

const envSchema = z.object({
  DEBUG: z.coerce.boolean().optional().default(false)
});

const parse = envSchema.safeParse(process.env);

if (!parse.success) {
  throw new Error(
    'Enviroment variable did not set up correctly: ' + parse.error.message
  );
}

export default parse.data;
