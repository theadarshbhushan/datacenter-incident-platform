const env = import.meta.env;

export type ApiMode = 'mock' | 'api';

export const config = {
  appName: 'VaultWatch',
  apiMode: (env.VITE_API_MODE === 'api' ? 'api' : 'mock') as ApiMode,
  apiUrl: (env.VITE_API_URL || '').replace(/\/$/, ''),
  wsUrl: env.VITE_WS_URL || '',
  googleAuthEnabled: env.VITE_GOOGLE_AUTH_ENABLED === 'true',
  billingEnabled: env.VITE_BILLING_ENABLED === 'true',
  // Placeholder contact details. Replace before launch.
  supportEmail: env.VITE_SUPPORT_EMAIL || 'support@example.com',
  salesEmail: env.VITE_SALES_EMAIL || 'sales@example.com',
};

export const isMock = config.apiMode === 'mock';
