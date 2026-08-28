import type IORedis from 'ioredis';
import { type BrokerOptions, type LoggerConfig, type ServiceSchema } from 'moleculer';

const moleculerConfigCommon: Partial<BrokerOptions> = {
  skipProcessEventRegistration: true,
};

function moleculerConfigLog(): LoggerConfig {
  return {
    type: 'Pino',
    options: {
      level: 'error',
    },
  };
}

export const moleculerConfigCommonService: Partial<ServiceSchema> = {
  settings: {
    $noVersionPrefix: true,
  },
  version: 1,
};

export function brokerConfig(nodeID: string, connection: IORedis): BrokerOptions {
  return {
    logger: moleculerConfigLog(),
    nodeID: nodeID,
    metadata: {
      version: 1,
    },
    transporter: {
      type: 'Redis',
      options: {
        host: connection.options.host,
        port: connection.options.port,
        password: connection.options.password,
      },
    },
    ...moleculerConfigCommon,
  };
}
