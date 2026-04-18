const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);

// Allow importing .html files as assets so WebViewHost can load the mobile-renderer bundle
config.resolver.assetExts.push('html');

// Let Metro resolve files outside the mobile/ project root
config.watchFolders = [sharedRoot];

// Map the @shared/* alias (declared in tsconfig.json) for Metro
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@shared': sharedRoot,
};

// Ensure Metro looks up modules starting from the project's node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

// Enable package "exports" field resolution so modern packages like
// @noble/curves/ed25519 resolve via their declared subpath exports.
// Requires Metro 0.79+; safe to enable.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
