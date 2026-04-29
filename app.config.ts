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
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.clickk.app",
    buildNumber: "1",
    associatedDomains: ["applinks:clickk.app"],
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
    },
  },
  android: {
    package: "com.clickk.app",
    versionCode: 1,
    googleServicesFile: "./google-services.json",
    permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "VIBRATE"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: "clickk.app",
            pathPrefix: "/",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
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
      projectId: process.env.EAS_PROJECT_ID ?? "",
    },
  },
});