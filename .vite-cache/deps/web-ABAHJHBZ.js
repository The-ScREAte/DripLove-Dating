import {
  WebPlugin
} from "./chunk-SW4DC6T6.js";
import {
  __commonJS,
  __toESM
} from "./chunk-HXA6O6EE.js";

// node_modules/scriptjs/dist/script.js
var require_script = __commonJS({
  "node_modules/scriptjs/dist/script.js"(exports, module) {
    (function(name, definition) {
      if (typeof module != "undefined" && module.exports) module.exports = definition();
      else if (typeof define == "function" && define.amd) define(definition);
      else this[name] = definition();
    })("$script", function() {
      var doc = document, head = doc.getElementsByTagName("head")[0], s = "string", f = false, push = "push", readyState = "readyState", onreadystatechange = "onreadystatechange", list = {}, ids = {}, delay = {}, scripts = {}, scriptpath, urlArgs;
      function every(ar, fn) {
        for (var i = 0, j = ar.length; i < j; ++i) if (!fn(ar[i])) return f;
        return 1;
      }
      function each(ar, fn) {
        every(ar, function(el) {
          fn(el);
          return 1;
        });
      }
      function $script2(paths, idOrDone, optDone) {
        paths = paths[push] ? paths : [paths];
        var idOrDoneIsDone = idOrDone && idOrDone.call, done = idOrDoneIsDone ? idOrDone : optDone, id = idOrDoneIsDone ? paths.join("") : idOrDone, queue = paths.length;
        function loopFn(item) {
          return item.call ? item() : list[item];
        }
        function callback() {
          if (!--queue) {
            list[id] = 1;
            done && done();
            for (var dset in delay) {
              every(dset.split("|"), loopFn) && !each(delay[dset], loopFn) && (delay[dset] = []);
            }
          }
        }
        setTimeout(function() {
          each(paths, function loading(path, force) {
            if (path === null) return callback();
            if (!force && !/^https?:\/\//.test(path) && scriptpath) {
              path = path.indexOf(".js") === -1 ? scriptpath + path + ".js" : scriptpath + path;
            }
            if (scripts[path]) {
              if (id) ids[id] = 1;
              return scripts[path] == 2 ? callback() : setTimeout(function() {
                loading(path, true);
              }, 0);
            }
            scripts[path] = 1;
            if (id) ids[id] = 1;
            create(path, callback);
          });
        }, 0);
        return $script2;
      }
      function create(path, fn) {
        var el = doc.createElement("script"), loaded;
        el.onload = el.onerror = el[onreadystatechange] = function() {
          if (el[readyState] && !/^c|loade/.test(el[readyState]) || loaded) return;
          el.onload = el[onreadystatechange] = null;
          loaded = 1;
          scripts[path] = 2;
          fn();
        };
        el.async = 1;
        el.src = urlArgs ? path + (path.indexOf("?") === -1 ? "?" : "&") + urlArgs : path;
        head.insertBefore(el, head.lastChild);
      }
      $script2.get = create;
      $script2.order = function(scripts2, id, done) {
        (function callback(s2) {
          s2 = scripts2.shift();
          !scripts2.length ? $script2(s2, id, done) : $script2(s2, callback);
        })();
      };
      $script2.path = function(p) {
        scriptpath = p;
      };
      $script2.urlArgs = function(str) {
        urlArgs = str;
      };
      $script2.ready = function(deps, ready, req) {
        deps = deps[push] ? deps : [deps];
        var missing = [];
        !each(deps, function(dep) {
          list[dep] || missing[push](dep);
        }) && every(deps, function(dep) {
          return list[dep];
        }) ? ready() : !function(key) {
          delay[key] = delay[key] || [];
          delay[key][push](ready);
          req && req(missing);
        }(deps.join("|"));
        return $script2;
      };
      $script2.done = function(idOrDone) {
        $script2([null], idOrDone);
      };
      return $script2;
    });
  }
});

// node_modules/@capacitor-community/apple-sign-in/dist/esm/web.js
var $script = __toESM(require_script());
var SignInWithAppleWeb = class extends WebPlugin {
  constructor() {
    super(...arguments);
    this.appleScriptUrl = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    this.isAppleScriptLoaded = false;
  }
  async authorize(options) {
    return new Promise((resolve, reject) => {
      if (options) {
        this.loadSignInWithAppleJS().then((loaded) => {
          var _a, _b, _c;
          this.isAppleScriptLoaded = loaded;
          if (this.isAppleScriptLoaded) {
            AppleID.auth.init({
              clientId: options.clientId,
              redirectURI: options.redirectURI,
              scope: (_a = options.scopes) !== null && _a !== void 0 ? _a : void 0,
              state: (_b = options.state) !== null && _b !== void 0 ? _b : void 0,
              nonce: (_c = options.nonce) !== null && _c !== void 0 ? _c : void 0,
              usePopup: true
            });
            AppleID.auth.signIn().then((res) => {
              var _a2, _b2, _c2, _d, _e;
              const response = {
                response: {
                  user: null,
                  email: (_a2 = res.user) === null || _a2 === void 0 ? void 0 : _a2.email,
                  givenName: (_c2 = (_b2 = res.user) === null || _b2 === void 0 ? void 0 : _b2.name) === null || _c2 === void 0 ? void 0 : _c2.firstName,
                  familyName: (_e = (_d = res.user) === null || _d === void 0 ? void 0 : _d.name) === null || _e === void 0 ? void 0 : _e.lastName,
                  identityToken: res.authorization.id_token,
                  authorizationCode: res.authorization.code
                }
              };
              resolve(response);
            }).catch((err) => {
              reject(err);
            });
          } else {
            reject("Unable to load Sign in with Apple JS framework.");
          }
        });
      } else {
        reject("No options were provided.");
      }
    });
  }
  loadSignInWithAppleJS() {
    return new Promise((resolve) => {
      if (!this.isAppleScriptLoaded) {
        if (typeof window !== void 0) {
          $script.get(this.appleScriptUrl, () => resolve(true));
        } else {
          resolve(false);
        }
      } else {
        resolve(true);
      }
    });
  }
};
export {
  SignInWithAppleWeb
};
/*! Bundled license information:

scriptjs/dist/script.js:
  (*!
    * $script.js JS loader & dependency manager
    * https://github.com/ded/script.js
    * (c) Dustin Diaz 2014 | License MIT
    *)
*/
//# sourceMappingURL=web-ABAHJHBZ.js.map
