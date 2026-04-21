#!/usr/bin/env node
/**
 * postinstall-iris.js
 *
 * Ensures the @intersystems/intersystems-iris-native binary directory
 * has a 'lnxrhx64' symlink pointing to 'dockerubuntux64' on Debian
 * and other distributions that the SDK's platform resolver maps to
 * the non-existent 'lnxrhx64' folder.
 *
 * Run automatically via "npm install" (see package.json postinstall).
 */
const fs = require('fs');
const path = require('path');

const binDir = path.join(
  __dirname,
  'node_modules',
  '@intersystems',
  'intersystems-iris-native',
  'bin'
);

const target   = 'lnxrhx64';
const fallback = 'dockerubuntux64';

const targetPath   = path.join(binDir, target);
const fallbackPath = path.join(binDir, fallback);

if (!fs.existsSync(binDir)) {
  console.log('[postinstall-iris] IRIS SDK bin directory not found – skipping.');
  process.exit(0);
}

if (fs.existsSync(targetPath)) {
  console.log(`[postinstall-iris] ${target} already exists – nothing to do.`);
  process.exit(0);
}

if (!fs.existsSync(fallbackPath)) {
  console.log(`[postinstall-iris] ${fallback} not found – skipping.`);
  process.exit(0);
}

try {
  fs.symlinkSync(fallback, targetPath);
  console.log(`[postinstall-iris] Created symlink ${target} -> ${fallback}`);
} catch (err) {
  console.warn(`[postinstall-iris] Could not create symlink: ${err.message}`);
}
