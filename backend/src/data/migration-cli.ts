import { dataSourceOptions } from './data.source';
import { DataSource } from 'typeorm';

export default new DataSource({
  ...dataSourceOptions,
  migrationsRun: false,
  cache: false,
});
