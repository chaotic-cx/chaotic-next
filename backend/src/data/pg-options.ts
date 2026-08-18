export const pgConnectionOptions = {
  type: 'postgres' as const,
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  username: process.env.PG_USER || 'chaotic',
  password: process.env.PG_PASSWORD || 'chaotic',
  database: process.env.PG_DATABASE || 'chaotic',
  extra: {
    ssl:
      process.env.SSL_MODE === 'require'
        ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    max: Number(process.env.PG_POOL_MAX) || 25,
    min: Number(process.env.PG_POOL_MIN) || 2,
  },
};
