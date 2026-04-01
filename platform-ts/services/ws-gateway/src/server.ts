import { buildApp } from './app';

const start = async () => {
  const app = await buildApp();
  const port = process.env.PORT ? Number(process.env.PORT) : 3006;
  await app.listen({ port, host: '0.0.0.0' });
};

start().catch((e) => {
  process.stderr.write(String(e?.message || e) + '\n');
  process.exit(1);
});

