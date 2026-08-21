const { NxAppRspackPlugin } = require('@nx/rspack/app-plugin');
const { SwcJsMinimizerRspackPlugin } = require('@rspack/core');
const { join } = require('path');
const { basename, resolve } = require('node:path');

class RspackPlugin {
  apply(compiler) {
    for (const rule of compiler.options.module?.rules ?? []) {
      if (rule && rule.loader === 'builtin:swc-loader' && rule.options?.jsc) {
        rule.options.jsc.target = 'esnext';
      }
    }

    const isProduction = compiler.options.mode === 'production' || process.env.NODE_ENV === 'production';
    compiler.options.devtool = isProduction ? false : 'inline-source-map';

    const projectName = basename(compiler.options.context || process.cwd());
    const workspaceRoot = resolve(__dirname, '../../');

    compiler.options.experiments = {
      ...(compiler.options.experiments ?? {}),
      cache: {
        type: 'persistent',
      },
    };
    compiler.options.cache = {
      type: 'persistent',
      maxAge: 604800,
      name: `${projectName}-${compiler.options.mode || 'development'}`,
      snapshot: {
        immutablePaths: [],
        unmanagedPaths: [],
        managedPaths: [/[\\/]node_modules[\\/][^.]/],
      },
      storage: {
        type: 'filesystem',
        directory: join(workspaceRoot, 'node_modules/.cache/rspack'),
      },
    };

    compiler.options.infrastructureLogging = {
      ...(compiler.options.infrastructureLogging ?? {}),
      level: 'error',
    };
    compiler.options.stats = {
      ...(typeof compiler.options.stats === 'object' && compiler.options.stats !== null ? compiler.options.stats : {}),
      logging: 'none',
      loggingDebug: [],
      loggingTrace: false,
    };
    compiler.options.optimization.minimizer = isProduction
      ? [
          new SwcJsMinimizerRspackPlugin({
            extractComments: false,
            minimizerOptions: {
              mangle: {
                keep_classnames: true,
                keep_fnames: true,
              },
              compress: {
                keep_classnames: true,
                keep_fnames: true,
              },
            },
          }),
        ]
      : [];
  }
}

module.exports = (options = {}) => {
  const isProduction = options.mode === 'production' || process.env.NODE_ENV === 'production';
  const mode = isProduction ? 'production' : 'development';

  return {
    mode,
    context: __dirname,
    output: {
      path: join(__dirname, '../dist/backend'),
      clean: true,
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    },
    devtool: isProduction ? 'inline-source-map' : false,
    experiments: {
      cache: {
        type: 'persistent',
      },
    },
    cache: {
      type: 'persistent',
      name: `be`,
      maxAge: 604800,
      snapshot: {
        immutablePaths: [],
        unmanagedPaths: [],
        managedPaths: [/[\\/]node_modules[\\/][^.]/],
      },
      storage: {
        type: 'filesystem',
        directory: join(__dirname, 'node_modules/.rspack'),
        location: join(__dirname, 'node_modules/.rspack/be'),
      },
    },
    plugins: [
      new NxAppRspackPlugin({
        target: 'node',
        main: './src/main.ts',
        tsConfig: './tsconfig.app.json',
        mode,
        optimization: isProduction,
        outputHashing: 'none',
        generatePackageJson: isProduction,
        sourceMap: isProduction ? 'inline-source-map' : false,
        typeCheckOptions: isProduction,
        cache: {
          type: 'persistent',
          name: `be`,
          maxAge: 604800,
          snapshot: {
            immutablePaths: [],
            unmanagedPaths: [],
            managedPaths: [/[\\/]node_modules[\\/][^.]/],
          },
          storage: {
            type: 'filesystem',
            directory: join(__dirname, 'node_modules/.rspack'),
            location: join(__dirname, 'node_modules/.rspack/be'),
          },
        },
      }),
      new RspackPlugin(),
    ].filter(Boolean),
  };
};
