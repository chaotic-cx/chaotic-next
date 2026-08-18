import swc from 'unplugin-swc';

export const swcPlugin = () =>
  swc.vite({
    include: [/\.[cm]?[jt]sx?(?:\?.*)?$/],
    exclude: [],
    module: { type: 'es6' },
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
      target: 'es2022',
      keepClassNames: true,
    },
    sourceMaps: true,
  });
