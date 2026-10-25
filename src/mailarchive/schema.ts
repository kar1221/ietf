import zod from 'zod';

export const msgCountSchema = zod.object({
  msg_counts: zod.record(zod.string(), zod.number())
});

export type MsgCount = zod.infer<typeof msgCountSchema>;
