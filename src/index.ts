import Fastify from 'fastify';
import apiRoutes from './routes/api.js';

import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler
} from 'fastify-type-provider-zod';

const app = Fastify({ logger: true });

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(apiRoutes, { prefix: '/api' });

app.setErrorHandler((err, req, res) => {
  if (hasZodFastifySchemaValidationErrors(err)) {
    return res.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid Request',
        details: err.validation
      }
    });
  }

  if (isResponseSerializationError(err)) {
    req.log.error(err, 'response did not match its schema');
    return res.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'Internal server error'
      }
    });
  }

  req.log.error(err);
  return res
    .status(500)
    .send({ error: { code: 'INTERNAL', message: 'Internal server error' } });
});

app.setNotFoundHandler((req, res) => {
  res.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method}: ${req.url}`
    }
  });
});

const start = async () => {
  try {
    await app.listen({ port: 3030 });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

void start();
