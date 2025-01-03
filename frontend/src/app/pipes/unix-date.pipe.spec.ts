import { UnixDatePipe } from './unix-date.pipe';

describe('UnixDatePipe', () => {
  it('create an instance', () => {
    const pipe = new UnixDatePipe();
    expect(pipe).toBeTruthy();
  });
});
