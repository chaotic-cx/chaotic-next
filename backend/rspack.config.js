const { composePlugins, withNx } = require('@nx/rspack');
const { SwcJsMinimizerRspackPlugin, HotModuleReplacementPlugin } = require('@rspack/core');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');
const { merge } = require('webpack-merge');
const nodeExternals = require('webpack-node-externals');

module.exports = composePlugins(withNx(), (config, { options, context }) => {
  const isHmr = context.configurationName === 'hmr';
  const merged = merge(config, {
    ...(isHmr
      ? {
          entry: { main: ['@rspack/core/hot/poll?100'] },
          plugins: [
            new HotModuleReplacementPlugin(),
            new RunScriptWebpackPlugin({ name: options.outputFileName, autoRestart: false }),
          ],
        }
      : {
          optimization: {
            minimizer: [
              new SwcJsMinimizerRspackPlugin({
                minimizerOptions: {
                  compress: {
                    keep_classnames: true,
                    keep_fnames: true,
                  },
                  mangle: {
                    keep_classnames: true,
                    keep_fnames: true,
                  },
                },
              }),
            ],
          },
        }),
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  decorators: true,
                },
                transform: {
                  legacyDecorator: true,
                  decoratorMetadata: true,
                },
              },
            },
          },
        },
      ],
    },
    experiments: {
      incremental: true,
    },
  });

  merged.externals = [
    nodeExternals({
      allowlist: ['@rspack/core/hot/poll?100'],
    }),
  ];
  return merged;
});
