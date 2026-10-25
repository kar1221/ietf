import zod from 'zod';

export const personEmailSchema = zod.object({
  person: zod.string(),
  address: zod.string()
});

export type PersonEmail = zod.infer<typeof personEmailSchema>;

export const tastypieSchema = <T extends zod.ZodType>(objectSchema: T) =>
  zod.object({
    meta: zod.object({
      limit: zod.number(),
      next: zod.string().nullable(),
      offset: zod.number(),
      previous: zod.string().nullable(),
      total_count: zod.number()
    }),
    objects: zod.array(objectSchema)
  });

export type TastypieResponse<T> = zod.infer<
  ReturnType<typeof tastypieSchema<zod.ZodType<T>>>
>;

export const personSchema = zod.object({
  id: zod.number(),
  ascii: zod.string(),
  time: zod.string()
});

export type Person = zod.infer<typeof personSchema>;

export const meetingRegistrationSchema = zod.object({
  id: zod.number(),
  affiliation: zod.string(),
  meeting: zod.string(),
  person: zod.string(),
  email: zod.string(),
  first_name: zod.string(),
  last_name: zod.string()
});

export type MeetingRegistration = zod.infer<typeof meetingRegistrationSchema>;

export const meetingSchema = zod.object({
  id: zod.number(),
  date: zod.date()
});

export type Meeting = zod.infer<typeof meetingSchema>;

export const docHistoryAuthorSchema = zod.object({
  id: zod.number(),
  affiliation: zod.string(),
  document: zod.string(),
  person: zod.string()
});

export type DocHistoryAuthor = zod.infer<typeof docHistoryAuthorSchema>;

export const docHistorySchema = zod.object({
  id: zod.number(),
  name: zod.string(),
  title: zod.string(),
  time: zod.string()
});

export type DocHistory = zod.infer<typeof docHistorySchema>;
