const { execSync } = require('child_process');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF_STAGING;
const dbPass = process.env.SUPABASE_DB_PASSWORD_STAGING;

console.log('Project ref:', ref, 'Token present:', !!token, 'Pass present:', !!dbPass);

try {
  const out = execSync(`npx supabase db push --project-ref ${ref} --password "${dbPass}"`, {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log('Push output:', out);
} catch (e) {
  console.error('Push stdout:', e.stdout);
  console.error('Push stderr:', e.stderr);
  console.error('Push message:', e.message);
}
