import { type DeepPartial, type ObjectLiteral, type Repository } from 'typeorm';

const SAVE_BATCH_SIZE = 1000;

export async function saveInBatches<T extends ObjectLiteral>(
  repository: Repository<T>,
  rows: DeepPartial<T>[],
  batchSize = SAVE_BATCH_SIZE,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    await repository.save(rows.slice(i, i + batchSize));
  }
}
