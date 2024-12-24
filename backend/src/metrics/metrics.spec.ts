import { MetricsModule } from './metrics.module';

describe('Metrics', () => {
  it('should be defined', () => {
    expect(new MetricsModule()).toBeDefined();
  });
});
