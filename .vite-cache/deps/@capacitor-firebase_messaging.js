import "./chunk-VHXUCOYC.js";

// node_modules/@capacitor-firebase/messaging/dist/esm/index.js
import { registerPlugin } from "@capacitor/core";

// node_modules/@capacitor-firebase/messaging/dist/esm/definitions.js
var Importance;
(function(Importance2) {
  Importance2[Importance2["Min"] = 1] = "Min";
  Importance2[Importance2["Low"] = 2] = "Low";
  Importance2[Importance2["Default"] = 3] = "Default";
  Importance2[Importance2["High"] = 4] = "High";
  Importance2[Importance2["Max"] = 5] = "Max";
})(Importance || (Importance = {}));
var Visibility;
(function(Visibility2) {
  Visibility2[Visibility2["Secret"] = -1] = "Secret";
  Visibility2[Visibility2["Private"] = 0] = "Private";
  Visibility2[Visibility2["Public"] = 1] = "Public";
})(Visibility || (Visibility = {}));

// node_modules/@capacitor-firebase/messaging/dist/esm/index.js
var FirebaseMessaging = registerPlugin("FirebaseMessaging", {
  web: () => import("./web-WCWS2OBO.js").then((m) => new m.FirebaseMessagingWeb())
});
export {
  FirebaseMessaging,
  Importance,
  Visibility
};
//# sourceMappingURL=@capacitor-firebase_messaging.js.map
