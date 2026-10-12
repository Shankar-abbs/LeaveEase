const { execSync } = require('child_process');

const token = process.env.VERCEL_TOKEN;
const projName = process.env.VERCEL_PROJECT_NAME || 'leaveease';
const orgId = process.env.VERCEL_ORG_ID;

console.log('Starting Vercel deployment for project:', projName);

const env = { ...process.env };
delete env.VERCEL_ORG_ID;
delete env.VERCEL_PROJECT_ID;

try {
  // First link project if needed
  try {
    execSync(`npx vercel link --yes --token "${token}" --project "${projName}"`, { env, encoding: 'utf8' });
  } catch {}

  // Deploy production build
  const deployCmd = `npx vercel deploy --prod --yes --token "${token}"`;
  const out = execSync(deployCmd, {
    env,
    encoding: 'utf8',
  });
  console.log('Vercel deploy output:\n', out);
} catch (err) {
  console.error('Vercel deploy error:\n', err.stdout || err.message);
}
