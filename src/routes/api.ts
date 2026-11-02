import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  getMessage,
  getMessageOverviews,
  getOverview
} from 'src/database/queries.js';
import { DatatrackerClient } from 'src/datatracker/client.js';
import zod from 'zod';

const datatracker = new DatatrackerClient();

const apiRoutes: FastifyPluginCallback = (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/overview',
    handler: async () => {
      const overview = await getOverview();

      return {
        overview
      };
    }
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    schema: {
      params: zod.object({
        email: zod.string()
      })
    },
    url: '/affiliations/:email',
    handler: async (req, res) => {
      const { email } = req.params;

      const person = await datatracker.fetchPersonByEmail(email);

      if (!person) {
        res.status(404).send({
          message: 'Not Found'
        });
        return;
      }

      const match = /\/person\/(\d+)\/?$/.exec(person.person);

      const id = Number(match?.[1]);
      const affiliations = await datatracker.fetchAffiliations(id);

      return {
        affiliations
      };
    }
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    schema: {
      querystring: zod.object({
        list: zod.string(),
        bucket: zod
          .string()
          .regex(/^\d{4}-\d{2}(?:-\d{2})?$/)
          .optional()
      })
    },
    url: '/messages',
    handler: async (req) => {
      const { list, bucket } = req.query;

      let messages = await getMessageOverviews(list, bucket);

      return {
        messages
      };
    }
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    schema: {
      params: zod.object({
        id: zod.coerce.number()
      })
    },
    url: '/message/:id',
    handler: async (req) => {
      const { id } = req.params;

      let messages = await getMessage(id);

      return {
        messages
      };
    }
  });
};

export default apiRoutes;
