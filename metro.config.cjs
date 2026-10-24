const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// Share one React instance even when app/ has standalone dependencies installed.
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')];
// Server-only credentials must never be resolved, transformed or served by Metro.
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[/\\]\.env(?:\.[^/\\]*)?$/,
  /[/\\]supabase[/\\](?:functions|migrations)[/\\]/,
];
module.exports = config;
