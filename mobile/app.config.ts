import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'CortexPay',
  slug: 'cortexpay',
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/images/logos/buildshare_logo.png',
  scheme: 'cortexpay',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
      LSApplicationQueriesSchemes: ['whatsapp', 'tel', 'mailto'],
      NSPhotoLibraryUsageDescription:
        "L'application a besoin d'accéder à vos photos pour personnaliser votre profil.",
      NSCameraUsageDescription:
        "L'application a besoin d'utiliser l'appareil photo pour capturer votre photo de profil.",
    },
    entitlements: {
      'aps-environment': process.env.APP_VARIANT === 'production' ? 'production' : 'development',
      'com.apple.security.application-groups': ['group.com.buildshare.onesignal'],
    },
    bundleIdentifier: 'com.cortexcard.cortexpay',
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0F172A',
      foregroundImage: './assets/images/logos/buildshare_logo.png',
      monochromeImage: './assets/images/logos/buildshare_logo.png',
    },
    edgeToEdgeEnabled: true,
    package: 'com.cortexcard.cortexpay',
  },
  web: {
    output: 'static',
    favicon: './assets/images/logos/buildshare_logo.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission: "L'application a besoin d'accéder à la caméra pour scanner les QR codes de configuration.",
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/logos/buildshare_logo.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#0B0F19',
        dark: {
          backgroundColor: '#0B0F19',
        },
      },
    ],
    'expo-secure-store',
    [
      'expo-build-properties',
      {
        android: {
          gradleProps: {
            'org.gradle.jvmargs':
              '-Xmx4096m -XX:MaxMetaspaceSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
            'org.gradle.daemon': 'true',
            'org.gradle.parallel': 'true',
            'org.gradle.caching': 'true',
            'org.gradle.configureondemand': 'true',
            'kotlin.incremental': 'true',
            'kapt.incremental.apt': 'true',
            'android.nonTransitiveRClass': 'true',
            reactNativeArchitectures: 'arm64-v8a',
          },
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: '',
    },
    API_URL: process.env.EXPO_PUBLIC_API_URL,
  },
  owner: 'bsrodrigue',
});
