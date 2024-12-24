import { Test, type TestingModule } from '@nestjs/testing';
import { BuilderController } from './builder.controller';

describe('BuilderController', () => {
  let controller: BuilderController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BuilderController],
    }).compile();

    controller = module.get<BuilderController>(BuilderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
