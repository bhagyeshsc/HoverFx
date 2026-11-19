import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'HoverFX — Currency on Hover',
    short_name: 'HoverFX',
    description: 'Hover over prices to see an estimated conversion into your preferred currency.',
    permissions: ['storage', 'tabs'],
    host_permissions: ['https://api.frankfurter.dev/*'],
    action: { default_title: 'HoverFX settings' },
  },
});
