/* eslint-env node */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add wasm to asset extensions for expo-sqlite
config.resolver.assetExts.push('wasm');

// Add sql to source extensions for Drizzle migrations
config.resolver.sourceExts.push('sql');

// COOP and COEP make the page cross-origin isolated, which expo-sqlite on web needs for SharedArrayBuffer.
// enhanceMiddleware only covers Metro's routes, not the HTML that Expo serves first, so set the headers on every request.
const http = require('http');
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, res, ...rest) {
  if (event === 'request') {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  }
  return emit.call(this, event, req, res, ...rest);
};

module.exports = config;
