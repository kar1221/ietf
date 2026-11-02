import zod from 'zod';

export const metaSchema = zod.object({
  total: zod.int().optional(),
  limit: zod.int().optional(),
  offset: zod.int().optional()
});

export type Meta = zod.infer<typeof metaSchema>;

export const apiErrorSchema = zod.object({
  error: zod.object({
    code: zod.string(),
    message: zod.string(),
    details: zod.unknown().optional()
  })
});

export type ApiError = zod.infer<typeof apiErrorSchema>;

export const messageOverviewSchema = zod
  .object({
    id: zod.number(),
    hash: zod.string().nullable(),
    messageId: zod.string().nullable(),
    from: zod.object({
      name: zod.string(),
      address: zod.string()
    }),
    date: zod.string().nullable(),
    subject: zod.string()
  })
  .array();

export type MessageOverview = zod.infer<typeof messageOverviewSchema>;

export const messageContentSchema = zod.object({
  id: zod.number(),
  hash: zod.string().nullable(),
  messageId: zod.string().nullable(),
  from: zod.object({
    name: zod.string(),
    address: zod.string()
  }),
  date: zod.string().nullable(),
  subject: zod.string(),
  content: zod.string()
});

export type MessageContent = zod.infer<typeof messageContentSchema>;

export const affiliationsSchema = zod.object({
  email: zod.string(),
  person_id: zod.int(),
  affiliations: zod.string().array()
});

export type Affiliations = zod.infer<typeof affiliationsSchema>;

export const listOverviewSchema = zod
  .object({
    list: zod.string(),
    buckets: zod
      .object({
        bucket: zod.string(),
        count: zod.number()
      })
      .array()
  })
  .array();

export type ListOverview = zod.infer<typeof listOverviewSchema>;
