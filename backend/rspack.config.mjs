import { NxAppRspackPlugin } from '@nx/rspack/app-plugin';
import { BannerPlugin, DefinePlugin, SwcJsMinimizerRspackPlugin } from '@rspack/core';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirname = dirname(fileURLToPath(import.meta.url));

class RspackPlugin {
  apply(compiler) {
    for (const rule of compiler.options.module?.rules ?? []) {
      if (rule && rule.loader === 'builtin:swc-loader' && rule.options?.jsc) {
        rule.options.jsc.target = 'esnext';
        // swc's CommonJS output references `exports`, which does not exist in an ESM bundle.
        rule.options.module = { ...(rule.options.module ?? {}), type: 'es6' };
      }
    }

    const isProduction = compiler.options.mode === 'production' || process.env.NODE_ENV === 'production';
    compiler.options.devtool = isProduction ? false : 'inline-source-map';

    const projectName = basename(compiler.options.context || process.cwd());
    const workspaceRoot = resolve(configDirname, '../../');

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

    compiler.hooks.afterEmit.tap('EnsureEsmPackageJson', () => {
      const packageJsonPath = join(compiler.options.output.path, 'package.json');
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.type !== 'module') {
          packageJson.type = 'module';
          writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        }
      } catch {
        // dist package.json only exists in production builds (generatePackageJson)
      }
    });
  }
}

function resolveAppVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const git = (command) => execSync(command, { encoding: 'utf-8', timeout: 2000 }).trim();
    return `${git('git describe --tags --abbrev=0')}-${git('git rev-parse --short HEAD')}`;
  } catch {
    return 'dev';
  }
}

export default (options = {}) => {
  const isProduction = options.mode === 'production' || process.env.NODE_ENV === 'production';
  const mode = isProduction ? 'production' : 'development';
  const version = resolveAppVersion();

  return {
    mode,
    context: configDirname,
    output: {
      path: join(configDirname, '../dist/backend'),
      clean: true,
      module: true,
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    },
    devtool: isProduction ? 'inline-source-map' : false,
    experiments: {
      outputModule: true,
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
        directory: join(configDirname, 'node_modules/.rspack'),
        location: join(configDirname, 'node_modules/.rspack/be'),
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
            directory: join(configDirname, 'node_modules/.rspack'),
            location: join(configDirname, 'node_modules/.rspack/be'),
          },
        },
      }),
      // The Nx plugin externalizes node_modules with bare `require()` calls, which do not
      // exist inside an ESM bundle. Provide one via createRequire for the emitted factories.
      new BannerPlugin({
        banner:
          "import { createRequire as __bundleCreateRequire } from 'node:module';\n" +
          'const require = __bundleCreateRequire(import.meta.url);\n' +
          'const exports = {};',
        raw: true,
        test: /main\.js$/,
      }),
      new DefinePlugin({ __VERSION__: JSON.stringify(version) }),
      new RspackPlugin(),
    ].filter(Boolean),
  };
};
