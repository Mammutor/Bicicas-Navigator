import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'es.castellon.bicicasnavigator',
  appName: 'Bicicas Navigator',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
