import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildResourceStats1787428076689 implements MigrationInterface {
  name = 'AddBuildResourceStats1787428076689';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsAvgMemoryBytes" bigint`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsCpuTimeNs" bigint`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsDiskReadBytes" bigint`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsDiskWriteBytes" bigint`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsDurationMs" integer`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsNetworkRxBytes" bigint`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsNetworkTxBytes" bigint`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsPeakMemoryBytes" bigint`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsPeakPids" integer`);
    await queryRunner.query(`ALTER TABLE "build" ADD COLUMN "resourceStatsSampleCount" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsSampleCount"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsPeakPids"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsPeakMemoryBytes"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsNetworkTxBytes"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsNetworkRxBytes"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsDurationMs"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsDiskWriteBytes"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsDiskReadBytes"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsCpuTimeNs"`);
    await queryRunner.query(`ALTER TABLE "build" DROP COLUMN "resourceStatsAvgMemoryBytes"`);
  }
}
