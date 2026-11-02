import Fastify from 'fastify';
import apiRoutes from './routes/api.js';

import {
  serializerCompiler,
  validatorCompiler
} from 'fastify-type-provider-zod';

const app = Fastify({ logger: true });

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(apiRoutes, { prefix: '/api' });

const start = async () => {
  try {
    await app.listen({ port: 3030 });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

void start();
