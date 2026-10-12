const https = require('https');

async function setVercelEnvs() {
  const token = process.env.VERCEL_TOKEN;
  const projectName = process.env.VERCEL_PROJECT_NAME || 'leaveease';
  
  if (!token) {
    console.error('VERCEL_TOKEN not provided');
    process.exit(1);
  }

  const envVars = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.SUPABASE_URL_PROD || process.env.NEXT_PUBLIC_SUPABASE_URL },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.SUPABASE_ANON_KEY_PROD || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY_PROD || process.env.SUPABASE_SERVICE_ROLE_KEY },
    { key: 'RESEND_API_KEY', value: process.env.RESEND_API_KEY || '' },
    { key: 'EMAIL_FROM', value: process.env.EMAIL_FROM || 'notifications@leaveease.test' },
    { key: 'EMAIL_OVERRIDE_TO', value: process.env.EMAIL_OVERRIDE_TO || '' },
  ];

  console.log('Fetching existing environment variables for project:', projectName);

  // List existing envs
  const existingEnvs = await makeRequest(`/v9/projects/${projectName}/env`, 'GET', token);
  const existingMap = new Map((existingEnvs.envs || []).map(e => [e.key, e.id]));

  for (const env of envVars) {
    if (!env.value) continue;
    if (existingMap.has(env.key)) {
      console.log(`Updating existing env var ${env.key}...`);
      const envId = existingMap.get(env.key);
      await makeRequest(`/v9/projects/${projectName}/env/${envId}`, 'PATCH', token, {
        value: env.value,
        target: ['production', 'preview', 'development'],
      });
    } else {
      console.log(`Creating env var ${env.key}...`);
      await makeRequest(`/v10/projects/${projectName}/env`, 'POST', token, {
        key: env.key,
        value: env.value,
        type: env.key.includes('SECRET') || env.key.includes('KEY') ? 'secret' : 'plain',
        target: ['production', 'preview', 'development'],
      });
    }
  }

  console.log('All Vercel environment variables configured successfully.');
}

function makeRequest(path, method, token, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.vercel.com',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

setVercelEnvs().catch(err => {
  console.error('Error configuring Vercel envs:', err);
  process.exit(1);
});
