import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-name-game",
  description: "Categories speed race: random letter + category, first valid answer wins.",
  accentHex: "#ff6688",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
