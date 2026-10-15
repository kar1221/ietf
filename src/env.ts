import 'dotenv/config';

import z from 'zod';

const envSchema = z.object({
  DB_PATH: z.string('Must provide a path to db')
});
