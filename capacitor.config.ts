import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fleetinventory.workshop",
  appName: "Fleet Inventory",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
