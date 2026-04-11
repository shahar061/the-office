const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow importing .html files as assets so WebViewHost can load the mobile-renderer bundle
config.resolver.assetExts.push('html');

module.exports = config;
