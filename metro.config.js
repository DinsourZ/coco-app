const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules ?? {}),
    '@coco/protocol': path.resolve(__dirname, 'packages/protocol/src'),
    '@coco/api-client': path.resolve(__dirname, 'packages/api-client/src'),
  },
};

module.exports = config;
