const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js v2.x usa un import() dinámico opcional hacia
// @opentelemetry/api en su build .mjs. Hermes/Metro no puede parsear ese
// import() con comentarios webpackIgnore. Desactivamos package exports para
// que Metro use el build .cjs (que usa require() y sí compila).
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
