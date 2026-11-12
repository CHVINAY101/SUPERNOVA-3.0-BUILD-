/**
 * Supernova 3.0 — Supabase Environment & Client Runtime Verification Script
 * 
 * Verifies that VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are correctly
 * configured in the runtime environment, validates format and key types, and tests
 * live database connectivity.
 * 
 * Usage:
 *   node scripts/verify-supabase-env.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to load .env variables if not already set in process.env
function loadDotEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return {};
  
  const content = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      envVars[key] = val;
    }
  }
  return envVars;
}

const fileEnv = loadDotEnv();
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const mock = process.env.VITE_USE_MOCK || fileEnv.VITE_USE_MOCK;

console.log('\n=============================================================');
console.log('⚡ SUPERNOVA 3.0 — SUPABASE RUNTIME ENVIRONMENT VERIFICATION');
console.log('=============================================================\n');

let hasErrors = false;
const diagnostics = [];

// 1. Inspect VITE_SUPABASE_URL
if (!url) {
  hasErrors = true;
  diagnostics.push('❌ VITE_SUPABASE_URL: MISSING from environment and .env');
} else {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      hasErrors = true;
      diagnostics.push(`❌ VITE_SUPABASE_URL: Invalid protocol (${parsed.protocol})`);
    } else if (url.includes('your-project') || url.includes('placeholder')) {
      hasErrors = true;
      diagnostics.push(`❌ VITE_SUPABASE_URL: Contains placeholder value (${url})`);
    } else {
      diagnostics.push(`✅ VITE_SUPABASE_URL: ${url} (Valid ${parsed.protocol})`);
    }
  } catch {
    hasErrors = true;
    diagnostics.push(`❌ VITE_SUPABASE_URL: Malformed URL string ("${url}")`);
  }
}

// 2. Inspect VITE_SUPABASE_PUBLISHABLE_KEY
if (!key) {
  hasErrors = true;
  diagnostics.push('❌ VITE_SUPABASE_PUBLISHABLE_KEY: MISSING from environment and .env');
} else {
  const isPublishable = key.startsWith('sb_publishable_');
  const isAnonJwt = key.startsWith('ey');
  const isPlaceholder = key.includes('placeholder') || key.length < 20;

  if (isPlaceholder) {
    hasErrors = true;
    diagnostics.push(`❌ VITE_SUPABASE_PUBLISHABLE_KEY: Placeholder or invalid length`);
  } else if (isPublishable) {
    const masked = key.slice(0, 18) + '...' + key.slice(-6);
    diagnostics.push(`✅ VITE_SUPABASE_PUBLISHABLE_KEY: ${masked} (Modern Publishable Key format)`);
  } else if (isAnonJwt) {
    const masked = key.slice(0, 10) + '...' + key.slice(-6);
    diagnostics.push(`✅ VITE_SUPABASE_PUBLISHABLE_KEY: ${masked} (Legacy JWT Anon Key format)`);
  } else {
    diagnostics.push(`⚠️ VITE_SUPABASE_PUBLISHABLE_KEY: Custom key format (Length: ${key.length})`);
  }
}

// 3. Inspect VITE_USE_MOCK
if (mock === 'true') {
  diagnostics.push('⚠️ VITE_USE_MOCK: Set to true (Mock mode active)');
} else {
  diagnostics.push(`✅ VITE_USE_MOCK: ${mock || 'false'} (Live Supabase operations enabled)`);
}

// Print Diagnostics
diagnostics.forEach((d) => console.log(d));
console.log('');

if (hasErrors) {
  console.error('❌ Supabase configuration validation FAILED.');
  console.error('Please verify your .env file and deployment environment variables.\n');
  process.exit(1);
}

// 4. Test live connectivity
console.log('📡 Testing live Supabase connection...');
const client = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

try {
  const startTime = Date.now();
  const { data, error, status } = await client.from('games').select('id, title').limit(1);
  const latency = Date.now() - startTime;

  if (error) {
    console.error(`❌ Supabase database ping failed (Status ${status}): ${error.message}`);
    process.exit(1);
  }

  console.log(`✅ Supabase database ping successful (${latency}ms, HTTP ${status})`);
  console.log(`   Sample verified record: Game "${data?.[0]?.title || 'Games list accessible'}" (ID: ${data?.[0]?.id || 'N/A'})`);

  // Test auth endpoint
  const authPing = await client.auth.getSession();
  if (authPing.error) {
    console.warn(`⚠️ Supabase auth endpoint warning: ${authPing.error.message}`);
  } else {
    console.log(`✅ Supabase Auth service reachable and responding.`);
  }

  console.log('\n=============================================================');
  console.log('🎉 SUPABASE CLIENT CONFIGURATION VERIFIED SUCCESSFULLY');
  console.log('=============================================================\n');
  process.exit(0);
} catch (err) {
  console.error(`❌ Unexpected error connecting to Supabase: ${err.message}`);
  process.exit(1);
}
