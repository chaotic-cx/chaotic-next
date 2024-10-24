import { Test, TestingModule } from '@nestjs/testing';
import { RouterController } from './router.controller';

describe('RouterController', () => {
  let controller: RouterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RouterController],
    }).compile();

    controller = module.get<RouterController>(RouterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
