const { composePlugins, withNx } = require('@nx/webpack');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');
const path = require('path');
const outDir = path.join(__dirname, '../dist/backend');

module.exports = composePlugins(withNx(), (config) => {
  return {
    ...config,
    output: {
      devtoolModuleFilenameTemplate(info) {
        const { absoluteResourcePath, namespace, resourcePath } = info;
        if (path.isAbsolute(absoluteResourcePath)) {
          return path.relative(outDir, absoluteResourcePath);
        }
        return `webpack://${namespace}/${resourcePath}`;
      },
      path: outDir,
    },
    entry: ['../node_modules/webpack/hot/poll?100', ...config.entry.main],
    externals: [
      nodeExternals({
        allowlist: ['../node_modules/webpack/hot/poll?100'],
      }),
    ],
    plugins: [
      ...config.plugins,
      new webpack.HotModuleReplacementPlugin(),
      new webpack.WatchIgnorePlugin({
        paths: [/\.js$/, /\.d\.ts$/],
      }),
    ],
    watch: true,
  };
});
