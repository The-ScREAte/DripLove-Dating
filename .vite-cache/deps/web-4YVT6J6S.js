import "./chunk-HXA6O6EE.js";

// node_modules/@capacitor/app-launcher/dist/esm/web.js
import { WebPlugin } from "@capacitor/core";
var AppLauncherWeb = class extends WebPlugin {
  async canOpenUrl(_options) {
    return { value: true };
  }
  async openUrl(options) {
    window.open(options.url, "_blank");
    return { completed: true };
  }
};
export {
  AppLauncherWeb
};
//# sourceMappingURL=web-4YVT6J6S.js.map
