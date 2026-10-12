const fs = require('fs');

if (!fs.existsSync('.env.secrets')) {
  console.error('.env.secrets not found');
  process.exit(1);
}

const content = fs.readFileSync('.env.secrets', 'utf8');
const lines = content.split('\n');
const env = {};

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq !== -1) {
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}

const stagingUrl = env['SUPABASE_URL_STAGING'] || env['SUPABASE_URL_PROD'] || '';
const stagingAnon = env['SUPABASE_ANON_KEY_STAGING'] || env['SUPABASE_ANON_KEY_PROD'] || '';
const stagingService = env['SUPABASE_SERVICE_ROLE_KEY_STAGING'] || env['SUPABASE_SERVICE_ROLE_KEY_PROD'] || '';

let localContent = '# Auto-generated local environment configuration\n';
localContent += `NEXT_PUBLIC_SUPABASE_URL=${stagingUrl}\n`;
localContent += `NEXT_PUBLIC_SUPABASE_ANON_KEY=${stagingAnon}\n`;
localContent += `SUPABASE_URL=${stagingUrl}\n`;
localContent += `SUPABASE_SERVICE_ROLE_KEY=${stagingService}\n`;

for (const [k, v] of Object.entries(env)) {
  localContent += `${k}="${v}"\n`;
}

fs.writeFileSync('.env.local', localContent);
console.log('Successfully written .env.local!');
