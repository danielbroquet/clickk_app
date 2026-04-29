import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "clickk",
  slug: "clickk",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "clickk",
  updates: {
    url: "https://u.expo.dev/c721f9ef-783d-4ab3-a51e-d28f4d3c6a12",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.clickk.app",
    buildNumber: "1",
    associatedDomains: ["applinks:clickk.app"],
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.clickk.app",
    versionCode: 1,
    permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "VIBRATE"],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    ["expo-router", { origin: "https://clickk.app" }],
    "expo-font",
    "expo-web-browser",
    "expo-updates",
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