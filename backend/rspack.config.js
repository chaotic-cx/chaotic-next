const { NxAppRspackPlugin } = require('@nx/rspack/app-plugin');
const { SwcJsMinimizerRspackPlugin } = require('@rspack/core');
const { join } = require('path');

const isProduction = process.env.NODE_ENV === 'production' || process.env.NX_TASK_TARGET_CONFIGURATION === 'production';

module.exports = () => ({
  context: __dirname,
  output: {
    path: join(__dirname, '../dist/backend'),
    clean: true,
    devtoolModuleFilenameTemplate: '[absolute-resource-path]',
  },
  devtool: isProduction ? 'inline-source-map' : undefined,
  plugins: [
    new NxAppRspackPlugin({
      target: 'node',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: isProduction,
      outputHashing: 'none',
      generatePackageJson: isProduction,
      sourceMap: !isProduction,
      typeCheckOptions: isProduction,
      cache: false,
    }),
    isProduction &&
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
});
