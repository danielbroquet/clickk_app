import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "clickk",
  slug: "clickk",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "clickk",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  owner: "danielbroquet",
  updates: {
    url: "https://u.expo.dev/c721f9ef-783d-4ab3-a51e-d28f4d3c6a12",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.clickk.app",
    buildNumber: "3",
    associatedDomains: ["applinks:clickk.app"],
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.clickk.app",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/images/icon.png",
      backgroundColor: "#0F0F0F",
    },
    googleServicesFile: "./google-services.json",
    permissions: [
      "CAMERA",
      "RECORD_AUDIO",
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "VIBRATE",
      "RECEIVE_BOOT_COMPLETED",
    ],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    ["expo-router", { origin: "https://clickk.app" }],
    "expo-font",
    "expo-localization",
    "expo-web-browser",
    [
      "expo-notifications",
      {
        icon: "./assets/images/notification-icon.png",
        color: "#00D2B8",
        defaultChannel: "default",
      },
    ],
    [
      "@stripe/stripe-react-native",
      {
        merchantIdentifier: "merchant.com.clickk.app",
        enableGooglePay: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "c721f9ef-783d-4ab3-a51e-d28f4d3c6a12",
    },
  },
});