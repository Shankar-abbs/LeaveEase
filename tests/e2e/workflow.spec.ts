import { test, expect } from '@playwright/test';

test.describe('LeaveEase End-to-End Workflows', () => {
  test('Login screen renders with accessible inputs and branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login | LeaveEase/);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#login-submit-btn')).toBeVisible();
  });

  test('Unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirectTo=/);
  });

  test('Public health endpoint /api/health responds with status and version', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBeLessThan(500);
    const body = await res.json();
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('durationMs');
  });

  test('Client log endpoint /api/log accepts structured client error events', async ({ request }) => {
    const res = await request.post('/api/log', {
      data: {
        ts: new Date().toISOString(),
        level: 'warn',
        service: 'client',
        requestId: '00000000-0000-0000-0000-000000000001',
        action: 'e2e_test_probe',
        msg: 'Probe log for e2e validation',
      },
      headers: {
        'x-request-id': '00000000-0000-0000-0000-000000000001',
      },
    });
    expect(res.status()).toBe(200);
  });

  test('Offline capabilities and PWA manifest are accessible', async ({ request }) => {
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.name).toContain('LeaveEase');
    expect(manifest.display).toBe('standalone');
  });
});
