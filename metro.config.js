const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Disable package exports to avoid import.meta issues on web
config.resolver.unstable_enablePackageExports = false;

// Custom resolver: manually resolve subpath imports that need package exports
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // dom-helpers uses exports field for subpath imports like dom-helpers/css
  if (moduleName.startsWith('dom-helpers/') && !moduleName.includes('node_modules')) {
    const subpath = moduleName.replace('dom-helpers/', '');
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules',
        'dom-helpers',
        'cjs',
        `${subpath}.js`
      ),
      type: 'sourceFile',
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
