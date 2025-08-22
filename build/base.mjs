import { defineConfig } from '@rspack/cli';
// import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { isProd, polyfill, resolve } from './helper.mjs';

const base = defineConfig({
  target: 'web',
  output: {
    // publicPath: '/federation_provider/',
    // publicPath: 'auto',
  },
  experiments: {
    css: true,
  },
  resolve: {
    alias: {
      '@': resolve('./src'),
    },
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.glsl'],
  },
  module: {
    parser: {
      'css/module': {
        namedExports: false,
      },
    },
    rules: [
      {
        test: /\.js[x]?$/,
        include: [resolve('./src'), resolve('./demos')],
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              sourceMap: !isProd,
              jsc: {
                parser: {
                  syntax: 'ecmascript',
                  jsx: true,
                },
                transform: {
                  react: {
                    pragma: 'React.createElement',
                    pragmaFrag: 'React.Fragment',
                    runtime: 'automatic',
                    development: !isProd,
                    refresh: !isProd,
                  },
                },
              },
              env: polyfill,
              rspackExperiments: {
                import: [
                  {
                    libraryName: 'antd',
                    style: '{{member}}/style/index.css',
                  },
                ],
              },
            },
          },
        ],
      },
      {
        test: /\.ts[x]?$/,
        include: [resolve('./src'), resolve('./demos')],
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              sourceMap: !isProd,
              jsc: {
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                },
                transform: {
                  react: {
                    pragma: 'React.createElement',
                    pragmaFrag: 'React.Fragment',
                    runtime: 'automatic',
                    development: !isProd,
                    refresh: !isProd,
                  },
                },
              },
              env: polyfill,
              rspackExperiments: {
                import: [
                  {
                    libraryName: 'antd',
                    style: '{{member}}/style/index.css',
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    // new ModuleFederationPlugin({
    //   name: 'federation_provider',
    //   filename: 'remoteEntry.js',
    //   exposes: {
    //     './button': resolve('./src/button/index.tsx'),
    //     './mf': resolve('./src/mf.ts'),
    //   },
    //   shared: {
    //     react: { singleton: true, requiredVersion: '^18.0.0' },
    //     'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
    //   },
    //   dts: true,
    //   // getPublicPath: `return "//" + window.location.host + "/federation_provider"`,
    // }),
  ],
});

export default base;
