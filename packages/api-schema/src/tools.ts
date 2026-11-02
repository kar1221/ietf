import zod from 'zod';
import { metaSchema, type Meta } from './index.ts';

export const ok = <T>(data: T, meta?: Meta) =>
  meta ? { data, meta } : { data };

export const err = (code: string, message: string, details?: unknown) => ({
  error: {
    code,
    message,
    details
  }
});

export const envelope = <T extends zod.ZodType>(data: T) =>
  zod.object({ data, meta: metaSchema.optional() });
