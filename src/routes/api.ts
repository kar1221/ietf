import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  getMessage,
  getMessageOverviews,
  getOverview
} from 'src/database/queries.js';
import { DatatrackerClient } from 'src/datatracker/client.js';
import zod from 'zod';
import {
  affiliationsSchema,
  apiErrorSchema,
  envelope,
  listOverviewSchema,
  messageContent,
  messageOverviewSchema,
  Ok
} from './schema.js';

const datatracker = new DatatrackerClient();

const apiRoutes: FastifyPluginCallback = (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/overview',
    schema: {
      response: {
        200: envelope(listOverviewSchema)
      }
    },
    handler: async () => {
      const overview = await getOverview();

      return Ok(overview, { total: overview.length });
    }
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/affiliations/:email',
    schema: {
      response: {
        200: envelope(affiliationsSchema),
        404: apiErrorSchema
      },
      params: zod.object({
        email: zod.string()
      })
    },
    handler: async (req, res) => {
      const { email } = req.params;

      const person = await datatracker.fetchPersonByEmail(email);

      if (!person) {
        return res.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Email ${email} is not found in the database. Contact the administrator if you believe it isn't intentional.`
          }
        });
      }

      const match = /\/person\/(\d+)\/?$/.exec(person.person);

      const id = Number(match?.[1]);
      const affiliations = await datatracker.fetchAffiliations(id);

      return Ok({
        email,
        person_id: id,
        affiliations
      });
    }
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/messages',
    schema: {
      response: {
        200: envelope(messageOverviewSchema)
      },
      querystring: zod.object({
        list: zod.string(),
        bucket: zod
          .string()
          .regex(/^\d{4}-\d{2}(?:-\d{2})?$/)
          .optional(),
        limit: zod.coerce.number().optional(),
        offset: zod.coerce.number().optional()
      })
    },
    handler: async (req) => {
      const { list, bucket, limit, offset } = req.query;

      const mLimit = limit ?? 20;
      const mOffset = offset ?? 0;

      let messages = await getMessageOverviews(list, mLimit, mOffset, bucket);

      return Ok(messages, {
        limit: mLimit,
        offset: mOffset,
        total: messages.length
      });
    }
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/message/:id',
    schema: {
      response: {
        200: envelope(messageContent),
        404: apiErrorSchema
      },
      params: zod.object({
        id: zod.coerce.number()
      })
    },
    handler: async (req, res) => {
      const { id } = req.params;

      let message = await getMessage(id);

      if (message === null) {
        return res.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Person id ${id.toString()} is not found in the database. Contact the administrator if you believe it isn't intentional.`
          }
        });
      }

      return Ok({
        id: message.id,
        hash: message.hash,
        messageId: message.messageId,
        from: message.from,
        date: message.date,
        subject: message.subject,
        content: message.content
      });
    }
  });
};

export default apiRoutes;
