import type IORedis from 'ioredis';
import type { BrokerOptions, LoggerConfig, ServiceSchema } from 'moleculer';

export const MoleculerConfigCommon: Partial<BrokerOptions> = {
  skipProcessEventRegistration: true,
};

export function MoleculerConfigLog(): LoggerConfig {
  return {
    type: 'Pino',
    options: {
      level: 'error',
    },
  };
}

export const MoleculerConfigCommonService: Partial<ServiceSchema> = {
  settings: {
    $noVersionPrefix: true,
  },
  version: 1,
};

export function brokerConfig(nodeID: string, connection: IORedis): BrokerOptions {
  return {
    logger: MoleculerConfigLog(),
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
    ...MoleculerConfigCommon,
  };
}
