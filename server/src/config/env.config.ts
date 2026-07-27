export interface EnvironmentConfig {
  database: {
    url: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  app: {
    port: number;
    corsOrigin: string;
    nodeEnv: string;
  };
  throttle: {
    ttl: number;
    limit: number;
  };
}

export function getConfig(): EnvironmentConfig {
  return {
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    jwt: {
      secret: requireEnv('JWT_SECRET'),
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    app: {
      port: parseInt(process.env.PORT || '4000', 10),
      corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      nodeEnv: process.env.NODE_ENV || 'development',
    },
    throttle: {
      ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    },
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
