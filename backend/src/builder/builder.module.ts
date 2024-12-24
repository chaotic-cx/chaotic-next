import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import builderConfig from '../config/builder.config';
import { BuilderController } from './builder.controller';
import { Build, Builder, Package, Repo } from './builder.entity';
import { BuilderService } from './builder.service';
import { HttpModule } from '@nestjs/axios';
import { RepoManagerModule } from '../repo-manager/repo-manager.module';

@Module({
  controllers: [BuilderController],
  exports: [TypeOrmModule, BuilderService],
  imports: [
    ConfigModule.forFeature(builderConfig),
    HttpModule,
    forwardRef(() => RepoManagerModule),
    TypeOrmModule.forFeature([Builder, Build, Repo, Package]),
  ],
  providers: [BuilderService],
})
export class BuilderModule {}
