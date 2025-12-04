import {
  __commonJS
} from "./chunk-HXA6O6EE.js";

// node_modules/cordova-plugin-purchase/www/store.js
var require_store = __commonJS({
  "node_modules/cordova-plugin-purchase/www/store.js"(exports) {
    var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
      function adopt(value) {
        return value instanceof P ? value : new P(function(resolve) {
          resolve(value);
        });
      }
      return new (P || (P = Promise))(function(resolve, reject) {
        function fulfilled(value) {
          try {
            step(generator.next(value));
          } catch (e) {
            reject(e);
          }
        }
        function rejected(value) {
          try {
            step(generator["throw"](value));
          } catch (e) {
            reject(e);
          }
        }
        function step(result) {
          result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
        }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
      });
    };
    var CdvPurchase;
    (function(CdvPurchase2) {
      const ERROR_CODES_BASE = 6777e3;
      let ErrorCode;
      (function(ErrorCode2) {
        ErrorCode2[ErrorCode2["SETUP"] = ERROR_CODES_BASE + 1] = "SETUP";
        ErrorCode2[ErrorCode2["LOAD"] = ERROR_CODES_BASE + 2] = "LOAD";
        ErrorCode2[ErrorCode2["PURCHASE"] = ERROR_CODES_BASE + 3] = "PURCHASE";
        ErrorCode2[ErrorCode2["LOAD_RECEIPTS"] = ERROR_CODES_BASE + 4] = "LOAD_RECEIPTS";
        ErrorCode2[ErrorCode2["CLIENT_INVALID"] = ERROR_CODES_BASE + 5] = "CLIENT_INVALID";
        ErrorCode2[ErrorCode2["PAYMENT_CANCELLED"] = ERROR_CODES_BASE + 6] = "PAYMENT_CANCELLED";
        ErrorCode2[ErrorCode2["PAYMENT_INVALID"] = ERROR_CODES_BASE + 7] = "PAYMENT_INVALID";
        ErrorCode2[ErrorCode2["PAYMENT_NOT_ALLOWED"] = ERROR_CODES_BASE + 8] = "PAYMENT_NOT_ALLOWED";
        ErrorCode2[ErrorCode2["UNKNOWN"] = ERROR_CODES_BASE + 10] = "UNKNOWN";
        ErrorCode2[ErrorCode2["REFRESH_RECEIPTS"] = ERROR_CODES_BASE + 11] = "REFRESH_RECEIPTS";
        ErrorCode2[ErrorCode2["INVALID_PRODUCT_ID"] = ERROR_CODES_BASE + 12] = "INVALID_PRODUCT_ID";
        ErrorCode2[ErrorCode2["FINISH"] = ERROR_CODES_BASE + 13] = "FINISH";
        ErrorCode2[ErrorCode2["COMMUNICATION"] = ERROR_CODES_BASE + 14] = "COMMUNICATION";
        ErrorCode2[ErrorCode2["SUBSCRIPTIONS_NOT_AVAILABLE"] = ERROR_CODES_BASE + 15] = "SUBSCRIPTIONS_NOT_AVAILABLE";
        ErrorCode2[ErrorCode2["MISSING_TOKEN"] = ERROR_CODES_BASE + 16] = "MISSING_TOKEN";
        ErrorCode2[ErrorCode2["VERIFICATION_FAILED"] = ERROR_CODES_BASE + 17] = "VERIFICATION_FAILED";
        ErrorCode2[ErrorCode2["BAD_RESPONSE"] = ERROR_CODES_BASE + 18] = "BAD_RESPONSE";
        ErrorCode2[ErrorCode2["REFRESH"] = ERROR_CODES_BASE + 19] = "REFRESH";
        ErrorCode2[ErrorCode2["PAYMENT_EXPIRED"] = ERROR_CODES_BASE + 20] = "PAYMENT_EXPIRED";
        ErrorCode2[ErrorCode2["DOWNLOAD"] = ERROR_CODES_BASE + 21] = "DOWNLOAD";
        ErrorCode2[ErrorCode2["SUBSCRIPTION_UPDATE_NOT_AVAILABLE"] = ERROR_CODES_BASE + 22] = "SUBSCRIPTION_UPDATE_NOT_AVAILABLE";
        ErrorCode2[ErrorCode2["PRODUCT_NOT_AVAILABLE"] = ERROR_CODES_BASE + 23] = "PRODUCT_NOT_AVAILABLE";
        ErrorCode2[ErrorCode2["CLOUD_SERVICE_PERMISSION_DENIED"] = ERROR_CODES_BASE + 24] = "CLOUD_SERVICE_PERMISSION_DENIED";
        ErrorCode2[ErrorCode2["CLOUD_SERVICE_NETWORK_CONNECTION_FAILED"] = ERROR_CODES_BASE + 25] = "CLOUD_SERVICE_NETWORK_CONNECTION_FAILED";
        ErrorCode2[ErrorCode2["CLOUD_SERVICE_REVOKED"] = ERROR_CODES_BASE + 26] = "CLOUD_SERVICE_REVOKED";
        ErrorCode2[ErrorCode2["PRIVACY_ACKNOWLEDGEMENT_REQUIRED"] = ERROR_CODES_BASE + 27] = "PRIVACY_ACKNOWLEDGEMENT_REQUIRED";
        ErrorCode2[ErrorCode2["UNAUTHORIZED_REQUEST_DATA"] = ERROR_CODES_BASE + 28] = "UNAUTHORIZED_REQUEST_DATA";
        ErrorCode2[ErrorCode2["INVALID_OFFER_IDENTIFIER"] = ERROR_CODES_BASE + 29] = "INVALID_OFFER_IDENTIFIER";
        ErrorCode2[ErrorCode2["INVALID_OFFER_PRICE"] = ERROR_CODES_BASE + 30] = "INVALID_OFFER_PRICE";
        ErrorCode2[ErrorCode2["INVALID_SIGNATURE"] = ERROR_CODES_BASE + 31] = "INVALID_SIGNATURE";
        ErrorCode2[ErrorCode2["MISSING_OFFER_PARAMS"] = ERROR_CODES_BASE + 32] = "MISSING_OFFER_PARAMS";
        ErrorCode2[ErrorCode2["VALIDATOR_SUBSCRIPTION_EXPIRED"] = 6778003] = "VALIDATOR_SUBSCRIPTION_EXPIRED";
      })(ErrorCode = CdvPurchase2.ErrorCode || (CdvPurchase2.ErrorCode = {}));
      function storeError(code, message, platform, productId) {
        return { isError: true, code, message, platform, productId };
      }
      CdvPurchase2.storeError = storeError;
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      class Iaptic {
        constructor(config, store) {
          this.config = config;
          if (!config.url) {
            config.url = "https://validator.iaptic.com";
          }
          this.store = store !== null && store !== void 0 ? store : CdvPurchase2.store;
          this.log = this.store.log.child("Iaptic");
        }
        /**
         * Provides a client token generated on iaptic's servers
         *
         * Can be passed to the Braintree Adapter at initialization.
         *
         * @example
         * store.initialize([
         *   {
         *     platform: Platform.BRAINTREE,
         *     options: {
         *       clientTokenProvider: iaptic.braintreeClientTokenProvider
         *     }
         *   }
         * ]);
         */
        get braintreeClientTokenProvider() {
          return (callback) => {
            this.log.info("Calling Braintree clientTokenProvider");
            CdvPurchase2.Utils.ajax(this.log, {
              url: `${this.config.url}/v3/braintree/client-token?appName=${this.config.appName}&apiKey=${this.config.apiKey}`,
              method: "POST",
              data: {
                applicationUsername: CdvPurchase2.store.getApplicationUsername(),
                customerId: CdvPurchase2.Braintree.customerId
              },
              success: (body) => {
                this.log.info("clientTokenProvider success: " + JSON.stringify(body));
                callback(body.clientToken);
              },
              error: (err) => {
                this.log.info("clientTokenProvider error: " + JSON.stringify(err));
                callback(CdvPurchase2.storeError(err, "ERROR " + err, CdvPurchase2.Platform.BRAINTREE, null));
              }
            });
          };
        }
        /**
         * Determine the eligibility of discounts based on the content of the application receipt.
         *
         * The secret sauce used here is to wait for validation of the application receipt.
         * The receipt validator will return the necessary data to determine eligibility.
         *
         * Receipt validation is expected to happen after loading product information, so the implementation here is to
         * wait for a validation response.
         */
        get appStoreDiscountEligibilityDeterminer() {
          let latestReceipt;
          this.log.debug("AppStore eligibility determiner is listening...");
          this.store.when().verified((receipt) => {
            if (receipt.platform === CdvPurchase2.Platform.APPLE_APPSTORE) {
              this.log.debug("Got a verified AppStore receipt.");
              latestReceipt = receipt;
            }
          }, "appStoreDiscountEligibilityDeterminer_listening");
          const determiner = (_appStoreReceipt, requests, callback) => {
            this.log.debug("AppStore eligibility determiner");
            if (latestReceipt) {
              this.log.debug("Using cached receipt");
              return callback(analyzeReceipt(latestReceipt, requests));
            }
            const onVerified = (receipt) => {
              if (receipt.platform === CdvPurchase2.Platform.APPLE_APPSTORE) {
                this.log.debug("Receipt is verified, let's analyze the content and respond.");
                this.store.off(onVerified);
                callback(analyzeReceipt(receipt, requests));
              }
            };
            this.log.debug("Waiting for receipt");
            this.store.when().verified(onVerified, "appStoreDiscountEligibilityDeterminer_waiting");
          };
          determiner.cacheReceipt = function(receipt) {
            latestReceipt = receipt;
          };
          return determiner;
          function analyzeReceipt(receipt, requests) {
            const ineligibleIntro = receipt.raw.ineligible_for_intro_price;
            return requests.map((request) => {
              var _a;
              if (request.discountType === "Introductory" && ineligibleIntro && ineligibleIntro.find((id) => request.productId === id)) {
                return false;
              } else if (request.discountType === "Subscription") {
                const matchingPurchase = (_a = receipt.raw.collection) === null || _a === void 0 ? void 0 : _a.find((purchase) => purchase.id === request.productId);
                return matchingPurchase ? true : false;
              } else {
                return true;
              }
            });
          }
        }
        /** Validator URL */
        get validator() {
          return `${this.config.url}/v1/validate?appName=${this.config.appName}&apiKey=${this.config.apiKey}`;
        }
      }
      CdvPurchase2.Iaptic = Iaptic;
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let LogLevel;
      (function(LogLevel2) {
        LogLevel2[LogLevel2["QUIET"] = 0] = "QUIET";
        LogLevel2[LogLevel2["ERROR"] = 1] = "ERROR";
        LogLevel2[LogLevel2["WARNING"] = 2] = "WARNING";
        LogLevel2[LogLevel2["INFO"] = 3] = "INFO";
        LogLevel2[LogLevel2["DEBUG"] = 4] = "DEBUG";
      })(LogLevel = CdvPurchase2.LogLevel || (CdvPurchase2.LogLevel = {}));
      ;
      class Logger {
        /** @internal */
        constructor(store, prefix = "") {
          this.prefix = "";
          this.store = store;
          this.prefix = prefix || "CdvPurchase";
        }
        /**
         * Create a child logger, whose prefix will be this one's + the given string.
         *
         * @example
         * const log = store.log.child('AppStore')
         */
        child(prefix) {
          return new Logger(this.store, this.prefix + "." + prefix);
        }
        /**
         * Logs an error message, only if `store.verbosity` >= store.ERROR
         */
        error(o) {
          log(this.store.verbosity, LogLevel.ERROR, this.prefix, o);
          try {
            throw new Error(toString(o));
          } catch (e) {
            log(this.store.verbosity, LogLevel.ERROR, this.prefix, e.stack);
          }
        }
        /**
         * Logs a warning message, only if `store.verbosity` >= store.WARNING
         */
        warn(o) {
          log(this.store.verbosity, LogLevel.WARNING, this.prefix, o);
        }
        /**
         * Logs an info message, only if `store.verbosity` >= store.INFO
         */
        info(o) {
          log(this.store.verbosity, LogLevel.INFO, this.prefix, o);
        }
        /**
         * Logs a debug message, only if `store.verbosity` >= store.DEBUG
         */
        debug(o) {
          log(this.store.verbosity, LogLevel.DEBUG, this.prefix, o);
        }
        /**
         * Add warning logs on a console describing an exception.
         *
         * This method is mostly used when executing user registered callbacks.
         *
         * @param context - a string describing why the method was called
         * @param error - a javascript Error object thrown by an exception
         */
        logCallbackException(context, err) {
          this.warn("A callback in '" + context + "' failed with an exception.");
          if (typeof err === "string")
            this.warn("           " + err);
          else if (err) {
            const errAny = err;
            if (errAny.fileName)
              this.warn("           " + errAny.fileName + ":" + errAny.lineNumber);
            if (err.message)
              this.warn("           " + err.message);
            if (err.stack)
              this.warn("           " + err.stack);
          }
        }
      }
      Logger.console = window.console;
      CdvPurchase2.Logger = Logger;
      const LOG_LEVEL_STRING = ["QUIET", "ERROR", "WARNING", "INFO", "DEBUG"];
      function toString(o) {
        if (typeof o !== "string")
          o = JSON.stringify(o);
        return o;
      }
      function log(verbosity, level, prefix, o) {
        var maxLevel = verbosity === true ? 1 : verbosity;
        if (level > maxLevel)
          return;
        if (typeof o !== "string")
          o = JSON.stringify(o);
        const fullPrefix = prefix ? `[${prefix}] ` : "";
        const logStr = level === LogLevel.ERROR ? (str) => Logger.console.error(str) : level === LogLevel.WARNING ? (str) => Logger.console.warn(str) : (str) => Logger.console.log(str);
        if (LOG_LEVEL_STRING[level])
          logStr(`${fullPrefix}${LOG_LEVEL_STRING[level]}: ${o}`);
        else
          logStr(`${fullPrefix}${o}`);
      }
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        Utils2.nonEnumerable = (target, name, desc) => {
          if (desc) {
            desc.enumerable = false;
            return desc;
          }
          Object.defineProperty(target, name, {
            set(value) {
              Object.defineProperty(this, name, {
                value,
                writable: true,
                configurable: true
              });
            },
            configurable: true
          });
        };
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      class Product {
        /** @internal */
        constructor(p, decorator) {
          this.className = "Product";
          this.title = "";
          this.description = "";
          this.platform = p.platform;
          this.type = p.type;
          this.id = p.id;
          this.group = p.group;
          this.offers = [];
          Object.defineProperty(this, "pricing", { enumerable: false, get: () => {
            var _a;
            return (_a = this.offers[0]) === null || _a === void 0 ? void 0 : _a.pricingPhases[0];
          } });
          Object.defineProperty(this, "canPurchase", { enumerable: false, get: () => decorator.canPurchase(this) });
          Object.defineProperty(this, "owned", { enumerable: false, get: () => decorator.owned(this) });
        }
        /**
         * Shortcut to offers[0].pricingPhases[0]
         *
         * Useful when you know products have a single offer and a single pricing phase.
         */
        get pricing() {
          var _a;
          return (_a = this.offers[0]) === null || _a === void 0 ? void 0 : _a.pricingPhases[0];
        }
        /**
         * Returns true if the product can be purchased.
         */
        get canPurchase() {
          return false;
        }
        /**
         * Returns true if the product is owned.
         *
         * Important: This value will be false when the app starts and will only become
         * true after purchase receipts have been loaded and validated. Without receipt validation,
         * it might remain false depending on the platform, make sure to store the ownership status
         * of non-consumable products in some way.
         */
        get owned() {
          return false;
        }
        /**
         * Find and return an offer for this product from its id
         *
         * If id isn't specified, returns the first offer.
         *
         * @param id - Identifier of the offer to return
         * @return An Offer or undefined if no match is found
         */
        getOffer(id = "") {
          if (!id)
            return this.offers[0];
          return this.offers.find((o) => o.id === id);
        }
        /**
         * Add an offer to this product.
         *
         * @internal
         */
        addOffer(offer) {
          if (this.getOffer(offer.id))
            return this;
          this.offers.push(offer);
          return this;
        }
      }
      CdvPurchase2.Product = Product;
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function objectValues(obj) {
          const ret = [];
          for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
              ret.push(obj[key]);
            }
          }
          return ret;
        }
        Utils2.objectValues = objectValues;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function platformName(platform) {
          switch (platform) {
            case CdvPurchase2.Platform.APPLE_APPSTORE:
              return "App Store";
            case CdvPurchase2.Platform.GOOGLE_PLAY:
              return "Google Play";
            case CdvPurchase2.Platform.WINDOWS_STORE:
              return "Windows Store";
            case CdvPurchase2.Platform.BRAINTREE:
              return "Braintree";
            case CdvPurchase2.Platform.TEST:
              return "Test";
            default:
              return platform;
          }
        }
        Utils2.platformName = platformName;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class ReceiptsToValidate {
          constructor() {
            this.array = [];
          }
          get length() {
            return this.array.length;
          }
          get() {
            return this.array.concat();
          }
          add(receipt) {
            if (!this.has(receipt))
              this.array.push(receipt);
          }
          clear() {
            while (this.array.length !== 0)
              this.array.pop();
          }
          has(receipt) {
            return !!this.array.find((el) => el === receipt);
          }
        }
        Internal2.ReceiptsToValidate = ReceiptsToValidate;
        class Validator {
          constructor(controller, log) {
            this.receiptsToValidate = new ReceiptsToValidate();
            this.verifiedReceipts = [];
            this.numRequests = 0;
            this.numResponses = 0;
            this.cache = {};
            this.controller = controller;
            this.log = log.child("Validator");
          }
          incrRequestsCounter() {
            this.numRequests = this.numRequests + 1 | 0;
            this.log.debug(`Validation requests=${this.numRequests} responses=${this.numResponses}`);
          }
          incrResponsesCounter() {
            this.numResponses = this.numResponses + 1 | 0;
            this.log.debug(`Validation requests=${this.numRequests} responses=${this.numResponses}`);
          }
          /** Add/update a verified receipt from the server response */
          addVerifiedReceipt(receipt, data) {
            for (const vr of this.verifiedReceipts) {
              if (vr.platform === receipt.platform && vr.id === data.id) {
                this.log.debug("Updating existing receipt.");
                vr.set(receipt, data);
                return vr;
              }
            }
            this.log.debug("Register a new verified receipt.");
            const newVR = new CdvPurchase2.VerifiedReceipt(receipt, data, this.controller);
            this.verifiedReceipts.push(newVR);
            return newVR;
          }
          /** Add a receipt to the validation queue. It'll get validated after a few milliseconds. */
          add(receiptOrTransaction) {
            this.log.debug("Schedule validation: " + JSON.stringify(receiptOrTransaction));
            const receipt = receiptOrTransaction instanceof CdvPurchase2.Transaction ? receiptOrTransaction.parentReceipt : receiptOrTransaction;
            if (!this.receiptsToValidate.has(receipt)) {
              this.incrRequestsCounter();
              this.receiptsToValidate.add(receipt);
            }
          }
          /** Run validation for all receipts in the queue */
          run() {
            const receipts = this.receiptsToValidate.get();
            this.receiptsToValidate.clear();
            const onResponse = (r) => __awaiter(this, void 0, void 0, function* () {
              var _a;
              const { receipt, payload } = r;
              this.incrResponsesCounter();
              try {
                const adapter = this.controller.adapters.find(receipt.platform);
                yield adapter === null || adapter === void 0 ? void 0 : adapter.handleReceiptValidationResponse(receipt, payload);
                if (payload.ok) {
                  const vr = this.addVerifiedReceipt(receipt, payload.data);
                  this.controller.verifiedCallbacks.trigger(vr, "payload_ok");
                } else if (payload.code === CdvPurchase2.ErrorCode.VALIDATOR_SUBSCRIPTION_EXPIRED) {
                  const transactionId = (_a = receipt.lastTransaction()) === null || _a === void 0 ? void 0 : _a.transactionId;
                  const vr = transactionId ? this.verifiedReceipts.find((r2) => {
                    var _a2;
                    return ((_a2 = r2.collection[0]) === null || _a2 === void 0 ? void 0 : _a2.transactionId) === transactionId;
                  }) : void 0;
                  if (vr) {
                    vr === null || vr === void 0 ? void 0 : vr.collection.forEach((col) => {
                      if (col.transactionId === transactionId)
                        col.isExpired = true;
                    });
                    this.controller.verifiedCallbacks.trigger(vr, "payload_expired");
                  } else {
                    this.controller.unverifiedCallbacks.trigger({ receipt, payload }, "no_verified_receipt");
                  }
                } else {
                  this.controller.unverifiedCallbacks.trigger({ receipt, payload }, "validator_error");
                }
              } catch (err) {
                this.log.error("Exception probably caused by an invalid response from the validator." + err.message);
                this.controller.unverifiedCallbacks.trigger({ receipt, payload: {
                  ok: false,
                  code: CdvPurchase2.ErrorCode.VERIFICATION_FAILED,
                  message: err.message
                } }, "validator_exception");
              }
            });
            receipts.forEach((receipt) => this.runOnReceipt(receipt, onResponse));
          }
          runOnReceipt(receipt, callback) {
            var _a, _b;
            return __awaiter(this, void 0, void 0, function* () {
              if (receipt.platform === CdvPurchase2.Platform.TEST) {
                this.log.debug("Using Test Adapter mock verify function.");
                return CdvPurchase2.Test.Adapter.verify(receipt, callback);
              }
              if (!this.controller.validator) {
                this.incrResponsesCounter();
                callback({
                  receipt,
                  payload: {
                    ok: true,
                    data: {
                      id: ((_b = (_a = receipt.transactions) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.transactionId) || "unknown",
                      latest_receipt: true,
                      transaction: { type: "test" }
                      // dummy data
                    }
                  }
                });
                return;
              }
              const body = yield this.buildRequestBody(receipt);
              if (!body) {
                this.incrResponsesCounter();
                return;
              }
              if (typeof this.controller.validator === "function")
                return this.runValidatorFunction(this.controller.validator, receipt, body, callback);
              const target = typeof this.controller.validator === "string" ? {
                url: this.controller.validator,
                timeout: 2e4
                // validation request will timeout after 20 seconds by default
              } : this.controller.validator;
              return this.runValidatorRequest(target, receipt, body, callback);
            });
          }
          runValidatorFunction(validator, receipt, body, callback) {
            try {
              validator(body, (payload) => callback({ receipt, payload }));
            } catch (error) {
              this.log.warn("user provided validator function failed with error: " + (error === null || error === void 0 ? void 0 : error.stack));
            }
          }
          buildRequestBody(receipt) {
            var _a, _b, _c;
            return __awaiter(this, void 0, void 0, function* () {
              const adapter = this.controller.adapters.find(receipt.platform);
              const body = yield adapter === null || adapter === void 0 ? void 0 : adapter.receiptValidationBody(receipt);
              if (!body)
                return;
              body.additionalData = Object.assign(Object.assign({}, (_a = body.additionalData) !== null && _a !== void 0 ? _a : {}), { applicationUsername: this.controller.getApplicationUsername() });
              if (!body.additionalData.applicationUsername)
                delete body.additionalData.applicationUsername;
              body.device = Object.assign(Object.assign({}, (_b = body.device) !== null && _b !== void 0 ? _b : {}), CdvPurchase2.Validator.Internal.getDeviceInfo(this.controller));
              if (((_c = body.offers) === null || _c === void 0 ? void 0 : _c.length) === 1) {
                const offer = body.offers[0];
                if (offer.pricingPhases.length === 1) {
                  const pricing = offer.pricingPhases[0];
                  body.currency = pricing.currency;
                  body.priceMicros = pricing.priceMicros;
                } else if (offer.pricingPhases.length === 2) {
                  const pricing = offer.pricingPhases[1];
                  body.currency = pricing.currency;
                  body.priceMicros = pricing.priceMicros;
                  const intro = offer.pricingPhases[0];
                  body.introPriceMicros = intro.priceMicros;
                }
              }
              return body;
            });
          }
          removeExpiredCache() {
            const now = +/* @__PURE__ */ new Date();
            const deleteList = [];
            for (const hash in this.cache) {
              if (this.cache[hash].expires < now) {
                deleteList.push(hash);
              }
            }
            for (const hash of deleteList) {
              delete this.cache[hash];
            }
          }
          runValidatorRequest(target, receipt, body, callback) {
            this.removeExpiredCache();
            const bodyTransactionHash = CdvPurchase2.Utils.md5(JSON.stringify(body.transaction));
            const cached = this.cache[bodyTransactionHash];
            if (cached) {
              this.log.debug("validator cache hit, using cached response");
              return callback({ receipt, payload: cached.payload });
            }
            CdvPurchase2.Utils.ajax(this.log.child("Ajax"), {
              url: target.url,
              method: "POST",
              customHeaders: target.headers,
              timeout: target.timeout,
              data: body,
              success: (response) => {
                var _a;
                this.log.debug("validator success, response: " + JSON.stringify(response));
                if (!isValidatorResponsePayload(response))
                  return callback({
                    receipt,
                    payload: {
                      ok: false,
                      code: CdvPurchase2.ErrorCode.BAD_RESPONSE,
                      message: "Validator responded with invalid data",
                      data: { latest_receipt: (_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.latest_receipt }
                    }
                  });
                this.cache[bodyTransactionHash] = {
                  payload: response,
                  expires: +/* @__PURE__ */ new Date() + 12e4
                  // expires in 2 minutes
                };
                callback({ receipt, payload: response });
              },
              error: (status, message, data) => {
                var fullMessage = "Error " + status + ": " + message;
                this.log.debug("validator failed, response: " + JSON.stringify(fullMessage));
                this.log.debug("body => " + JSON.stringify(data));
                callback({
                  receipt,
                  payload: {
                    ok: false,
                    message: fullMessage,
                    code: CdvPurchase2.ErrorCode.COMMUNICATION,
                    status,
                    data: {}
                  }
                });
              }
            });
          }
        }
        Internal2.Validator = Validator;
        function isValidatorResponsePayload(payload) {
          return !!payload && typeof payload === "object" && "ok" in payload && typeof payload.ok === "boolean";
        }
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class Adapters {
          constructor() {
            this.list = [];
          }
          add(log, adapters, context) {
            adapters.forEach((po) => {
              log.info("");
              if (this.find(po.platform))
                return;
              switch (po.platform) {
                case CdvPurchase2.Platform.APPLE_APPSTORE:
                  return this.list.push(new CdvPurchase2.AppleAppStore.Adapter(context, po.options || {}));
                case CdvPurchase2.Platform.GOOGLE_PLAY:
                  return this.list.push(new CdvPurchase2.GooglePlay.Adapter(context));
                case CdvPurchase2.Platform.BRAINTREE:
                  if (!po.options) {
                    log.error("Options missing for Braintree initialization. Use {platform: Platform.BRAINTREE, options: {...}} in your call to store.initialize");
                  }
                  return this.list.push(new CdvPurchase2.Braintree.Adapter(context, po.options));
                case CdvPurchase2.Platform.TEST:
                  return this.list.push(new CdvPurchase2.Test.Adapter(context));
                default:
                  return;
              }
            });
          }
          /**
           * Initialize some platform adapters.
           */
          initialize(platforms, context) {
            return __awaiter(this, void 0, void 0, function* () {
              if (typeof platforms === "string") {
                platforms = [platforms];
              }
              const newPlatforms = platforms.map((p) => typeof p === "string" ? { platform: p } : p).filter((p) => !this.find(p.platform));
              const log = context.log.child("Adapters");
              log.info("Adding platforms: " + JSON.stringify(newPlatforms));
              this.add(log, newPlatforms, context);
              const products = context.registeredProducts.byPlatform();
              const result = yield Promise.all(newPlatforms.map((platformToInit) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                const platformProducts = (_c = (_b = (_a = products.filter((p) => p.platform === platformToInit.platform)) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.products) !== null && _c !== void 0 ? _c : [];
                const adapter = this.find(platformToInit.platform);
                if (!adapter)
                  return;
                log.info(`${adapter.name} initializing...`);
                if (!adapter.isSupported) {
                  log.info(`${adapter.name} is not supported.`);
                  return;
                }
                const initResult = yield adapter.initialize();
                adapter.ready = true;
                log.info(`${adapter.name} initialized. ${initResult ? JSON.stringify(initResult) : ""}`);
                if (initResult === null || initResult === void 0 ? void 0 : initResult.code)
                  return initResult;
                log.info(`${adapter.name} products: ${JSON.stringify(platformProducts)}`);
                if (platformProducts.length === 0)
                  return;
                let loadProductsResult = [];
                let loadReceiptsResult = [];
                if (adapter.supportsParallelLoading) {
                  [loadProductsResult, loadReceiptsResult] = yield Promise.all([
                    adapter.loadProducts(platformProducts),
                    adapter.loadReceipts()
                  ]);
                } else {
                  loadProductsResult = yield adapter.loadProducts(platformProducts);
                  loadReceiptsResult = yield adapter.loadReceipts();
                }
                log.info(`${adapter.name} products loaded: ${JSON.stringify(loadProductsResult)}`);
                const loadedProducts = loadProductsResult.filter((p) => p instanceof CdvPurchase2.Product);
                context.listener.productsUpdated(platformToInit.platform, loadedProducts);
                log.info(`${adapter.name} receipts loaded: ${JSON.stringify(loadReceiptsResult)}`);
                return loadProductsResult.filter((lr) => "code" in lr && "message" in lr)[0];
              })));
              return result.filter((err) => err);
            });
          }
          /**
           * Retrieve a platform adapter.
           */
          find(platform) {
            return this.list.filter((a) => a.id === platform)[0];
          }
          /**
           * Retrieve the first platform adapter in the ready state, if any.
           *
           * You can optionally force the platform adapter you are looking for.
           *
           * Useful for methods that accept an optional "platform" argument, so they either act
           * on the only active adapter or on the one selected by the user, if it's ready.
           */
          findReady(platform) {
            return this.list.filter((adapter) => (!platform || adapter.id === platform) && adapter.ready)[0];
          }
        }
        Internal2.Adapters = Adapters;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class StoreAdapterListener {
          constructor(delegate, log) {
            this.supportedPlatforms = [];
            this.platformWithReceiptsReady = [];
            this.lastTransactionState = {};
            this.lastCallTimeForState = {};
            this.updatedReceiptsToProcess = [];
            this.delegate = delegate;
            this.log = log.child("AdapterListener");
          }
          static makeTransactionToken(transaction) {
            return transaction.platform + "|" + transaction.transactionId;
          }
          /**
           * Set the list of supported platforms.
           *
           * Called by the store when it is initialized.
           */
          setSupportedPlatforms(platforms) {
            this.log.debug(`setSupportedPlatforms: ${platforms.join(",")} (${this.platformWithReceiptsReady.length} have their receipts ready)`);
            this.supportedPlatforms = platforms;
            if (this.supportedPlatforms.length === this.platformWithReceiptsReady.length) {
              this.log.debug("triggering receiptsReady()");
              this.delegate.receiptsReadyCallbacks.trigger(void 0, "adapterListener_setSupportedPlatforms");
            }
          }
          /**
           * Trigger the "receiptsReady" event when all platforms have reported that their receipts are ready.
           *
           * This function is used by adapters to report that their receipts are ready.
           * Once all adapters have reported their receipts, the "receiptsReady" event is triggered.
           *
           * @param platform The platform that has its receipts ready.
           */
          receiptsReady(platform) {
            if (this.supportedPlatforms.length > 0 && this.platformWithReceiptsReady.length === this.supportedPlatforms.length) {
              this.log.debug("receiptsReady: " + platform + "(skipping)");
              return;
            }
            if (this.platformWithReceiptsReady.indexOf(platform) < 0) {
              this.platformWithReceiptsReady.push(platform);
              this.log.debug(`receiptsReady: ${platform} (${this.platformWithReceiptsReady.length}/${this.supportedPlatforms.length})`);
              if (this.platformWithReceiptsReady.length === this.supportedPlatforms.length) {
                this.log.debug("triggering receiptsReady()");
                this.delegate.receiptsReadyCallbacks.trigger(void 0, "adapterListener_receiptsReady");
              }
            }
          }
          /**
           * Trigger the "updated" event for each product.
           */
          productsUpdated(platform, products) {
            products.forEach((product) => this.delegate.updatedCallbacks.trigger(product, "adapterListener_productsUpdated"));
          }
          /**
           * Triggers the "approved", "pending" and "finished" events for transactions.
           *
           * - "approved" is triggered only if it hasn't been called for the same transaction in the last 5 seconds.
           * - "finished" and "pending" are triggered only if the transaction state has changed.
           *
           * @param platform The platform that has its receipts updated.
           * @param receipts The receipts that have been updated.
           */
          receiptsUpdated(platform, receipts) {
            this.log.debug("receiptsUpdated: " + JSON.stringify(receipts.map((r) => ({
              platform: r.platform,
              transactions: r.transactions
            }))));
            for (const receipt of receipts) {
              if (this.updatedReceiptsToProcess.indexOf(receipt) < 0) {
                this.updatedReceiptsToProcess.push(receipt);
              }
            }
            if (this.updatedReceiptsProcessor !== void 0) {
              clearTimeout(this.updatedReceiptsProcessor);
            }
            this.updatedReceiptsProcessor = setTimeout(() => {
              this._processUpdatedReceipts();
            }, 500);
          }
          _processUpdatedReceipts() {
            this.log.debug("processing " + this.updatedReceiptsToProcess.length + " updated receipts");
            const now = +/* @__PURE__ */ new Date();
            const receipts = this.updatedReceiptsToProcess;
            this.updatedReceiptsToProcess = [];
            receipts.forEach((receipt) => {
              this.delegate.updatedReceiptCallbacks.trigger(receipt, "adapterListener_receiptsUpdated");
              receipt.transactions.forEach((transaction) => {
                var _a;
                const transactionToken = StoreAdapterListener.makeTransactionToken(transaction);
                const tokenWithState = transactionToken + "@" + transaction.state;
                const lastState = this.lastTransactionState[transactionToken];
                if (transaction.state === CdvPurchase2.TransactionState.APPROVED) {
                  const lastCalled = (_a = this.lastCallTimeForState[tokenWithState]) !== null && _a !== void 0 ? _a : 0;
                  if (now - lastCalled > 6e4) {
                    this.lastCallTimeForState[tokenWithState] = now;
                    this.delegate.approvedCallbacks.trigger(transaction, "adapterListener_receiptsUpdated_approved");
                  } else {
                    this.log.debug(`Skipping ${tokenWithState}, because it has been last called ${lastCalled > 0 ? Math.round(now - lastCalled) + "ms ago (" + now + "-" + lastCalled + ")" : "never"}`);
                  }
                } else if (lastState !== transaction.state) {
                  if (transaction.state === CdvPurchase2.TransactionState.INITIATED) {
                    this.lastCallTimeForState[tokenWithState] = now;
                    this.delegate.initiatedCallbacks.trigger(transaction, "adapterListener_receiptsUpdated_initiated");
                  } else if (transaction.state === CdvPurchase2.TransactionState.FINISHED) {
                    this.lastCallTimeForState[tokenWithState] = now;
                    this.delegate.finishedCallbacks.trigger(transaction, "adapterListener_receiptsUpdated_finished");
                  } else if (transaction.state === CdvPurchase2.TransactionState.PENDING) {
                    this.lastCallTimeForState[tokenWithState] = now;
                    this.delegate.pendingCallbacks.trigger(transaction, "adapterListener_receiptsUpdated_pending");
                  }
                }
                this.lastTransactionState[transactionToken] = transaction.state;
              });
            });
          }
        }
        Internal2.StoreAdapterListener = StoreAdapterListener;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class Callbacks {
          /**
           * @param className - Type of callbacks (used to help with debugging)
           * @param finalStateMode - If true, newly registered callbacks will be called immediately when the event was already triggered.
           */
          constructor(logger, className, finalStateMode = false) {
            this.callbacks = [];
            this.numTriggers = 0;
            this.logger = logger;
            this.className = className;
            this.finalStateMode = finalStateMode;
          }
          /** Add a callback to the list */
          push(callback, callbackName) {
            if (this.finalStateMode && this.numTriggers > 0) {
              callback(this.lastTriggerArgument);
            } else {
              for (const existing of this.callbacks) {
                if (existing.callback === callback) {
                  throw new Error("REGISTERING THE SAME CALLBACK TWICE? This is indicative of a bug in your integration.");
                }
              }
              this.callbacks.push({ callback, callbackName });
            }
          }
          /** Call all registered callbacks with the given value */
          trigger(value, reason) {
            this.lastTriggerArgument = value;
            this.numTriggers++;
            const callbacks = this.callbacks;
            if (this.finalStateMode) {
              this.callbacks = [];
            }
            callbacks.forEach((callback) => {
              CdvPurchase2.Utils.safeCall(this.logger, this.className, callback.callback, value, callback.callbackName, reason);
            });
          }
          /** Remove a callback from the list */
          remove(callback) {
            this.callbacks = this.callbacks.filter((el) => el.callback !== callback);
          }
        }
        Internal2.Callbacks = Callbacks;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class ReadyCallbacks {
          constructor(logger) {
            this.isReady = false;
            this.readyCallbacks = [];
            this.logger = logger;
          }
          /** Register a callback to be called when the plugin is ready. */
          add(cb) {
            if (this.isReady)
              return setTimeout(cb, 0);
            this.readyCallbacks.push(cb);
          }
          /** Calls the ready callbacks */
          trigger(reason) {
            this.isReady = true;
            this.readyCallbacks.forEach((cb) => CdvPurchase2.Utils.safeCall(this.logger, "ready()", cb, void 0, void 0, reason));
            this.readyCallbacks = [];
          }
          remove(cb) {
            this.readyCallbacks = this.readyCallbacks.filter((el) => el !== cb);
          }
        }
        Internal2.ReadyCallbacks = ReadyCallbacks;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        function isValidRegisteredProduct(product) {
          if (typeof product !== "object")
            return false;
          return product.hasOwnProperty("platform") && product.hasOwnProperty("id") && product.hasOwnProperty("type");
        }
        class RegisteredProducts {
          constructor() {
            this.list = [];
          }
          find(platform, id) {
            return this.list.find((rp) => rp.platform === platform && rp.id === id);
          }
          add(product) {
            const errors = [];
            const products = Array.isArray(product) ? product : [product];
            const newProducts = products.filter((p) => !this.find(p.platform, p.id));
            for (const p of newProducts) {
              if (isValidRegisteredProduct(p))
                this.list.push(p);
              else
                errors.push(CdvPurchase2.storeError(CdvPurchase2.ErrorCode.LOAD, 'Invalid parameter to "register", expected "id", "type" and "platform". Got: ' + JSON.stringify(p), null, null));
            }
            return errors;
          }
          byPlatform() {
            const byPlatform = {};
            this.list.forEach((p) => {
              byPlatform[p.platform] = (byPlatform[p.platform] || []).concat(p);
            });
            return Object.keys(byPlatform).map((platform) => ({
              platform,
              products: byPlatform[platform]
            }));
          }
        }
        Internal2.RegisteredProducts = RegisteredProducts;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class TransactionStateMonitors {
          constructor(when) {
            this.monitors = [];
            this.isListening = false;
            this.when = when;
          }
          findMonitors(transaction) {
            return this.monitors.filter((monitor) => monitor.transaction.platform === transaction.platform && monitor.transaction.transactionId === transaction.transactionId);
          }
          startListening() {
            if (this.isListening) {
              return;
            }
            this.isListening = true;
            this.when.approved((transaction) => this.callOnChange(transaction), "transactionStateMonitors_callOnChange").finished((transaction) => this.callOnChange(transaction), "transactionStateMonitors_callOnChange");
          }
          callOnChange(transaction) {
            this.findMonitors(transaction).forEach((monitor) => {
              if (monitor.lastChange !== transaction.state) {
                monitor.lastChange = transaction.state;
                monitor.onChange(transaction.state);
              }
            });
          }
          /**
           * Start monitoring the provided transaction for state changes.
           */
          start(transaction, onChange) {
            this.startListening();
            const monitorId = CdvPurchase2.Utils.uuidv4();
            this.monitors.push({ monitorId, transaction, onChange, lastChange: transaction.state });
            setTimeout(onChange, 0, transaction.state);
            return {
              transaction,
              stop: () => this.stop(monitorId)
            };
          }
          stop(monitorId) {
            this.monitors = this.monitors.filter((m) => m.monitorId !== monitorId);
          }
        }
        Internal2.TransactionStateMonitors = TransactionStateMonitors;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class ReceiptsMonitor {
          constructor(controller) {
            this.hasCalledReceiptsVerified = false;
            this.controller = controller;
            this.log = controller.log.child("ReceiptsMonitor");
          }
          callReceiptsVerified() {
            if (this.hasCalledReceiptsVerified)
              return;
            this.hasCalledReceiptsVerified = true;
            this.log.info("receiptsVerified()");
            this.controller.when().receiptsReady(() => {
              setTimeout(() => {
                this.controller.receiptsVerified();
              }, 0);
            }, "receiptsMonitor_callReceiptsVerified");
          }
          launch() {
            const check = () => {
              this.log.debug(`check(${this.controller.numValidationResponses()}/${this.controller.numValidationRequests()})`);
              if (this.controller.numValidationRequests() === this.controller.numValidationResponses()) {
                if (this.intervalChecker !== void 0) {
                  clearInterval(this.intervalChecker);
                  this.intervalChecker = void 0;
                }
                this.controller.off(check);
                this.callReceiptsVerified();
              }
            };
            this.controller.when().verified(check, "receiptsMonitor_check").unverified(check, "receiptsMonitor_check").receiptsReady(() => {
              this.log.debug("receiptsReady...");
              if (!this.controller.hasLocalReceipts() || !this.controller.hasValidator()) {
                setTimeout(() => {
                  check();
                }, 0);
              }
              this.intervalChecker = setInterval(() => {
                this.log.debug("keep checking every 10s...");
                check();
              }, 1e4);
            }, "receiptsMonitor_setup");
          }
        }
        Internal2.ReceiptsMonitor = ReceiptsMonitor;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class ExpiryMonitor {
          /** Track active local transactions */
          // activeTransactions: {
          //   [transactionId: string]: true;
          // } = {};
          /** Track notified local transactions */
          // notifiedTransactions: {
          //   [transactionId: string]: true;
          // } = {};
          constructor(controller) {
            this.activePurchases = {};
            this.notifiedPurchases = {};
            this.controller = controller;
          }
          launch() {
            this.interval = setInterval(() => {
              var _a, _b;
              const now = +/* @__PURE__ */ new Date();
              for (const receipt of this.controller.verifiedReceipts) {
                const gracePeriod = (_a = ExpiryMonitor.GRACE_PERIOD_MS[receipt.platform]) !== null && _a !== void 0 ? _a : ExpiryMonitor.GRACE_PERIOD_MS.DEFAULT;
                for (const purchase of receipt.collection) {
                  if (purchase.expiryDate) {
                    const expiryDate = purchase.expiryDate + gracePeriod;
                    const transactionId = (_b = purchase.transactionId) !== null && _b !== void 0 ? _b : `${expiryDate}`;
                    if (expiryDate > now) {
                      this.activePurchases[transactionId] = true;
                    }
                    if (expiryDate < now && this.activePurchases[transactionId] && !this.notifiedPurchases[transactionId]) {
                      this.notifiedPurchases[transactionId] = true;
                      this.controller.onVerifiedPurchaseExpired(purchase, receipt);
                    }
                  }
                }
              }
            }, ExpiryMonitor.INTERVAL_MS);
          }
        }
        ExpiryMonitor.INTERVAL_MS = 1e4;
        ExpiryMonitor.GRACE_PERIOD_MS = {
          DEFAULT: 6e4,
          "ios-appstore": 6e4,
          "android-playstore": 3e4
        };
        Internal2.ExpiryMonitor = ExpiryMonitor;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      CdvPurchase2.PLUGIN_VERSION = "13.12.1";
      class Store {
        constructor() {
          this.adapters = new CdvPurchase2.Internal.Adapters();
          this.registeredProducts = new CdvPurchase2.Internal.RegisteredProducts();
          this.log = new CdvPurchase2.Logger(this);
          this.verbosity = CdvPurchase2.LogLevel.ERROR;
          this._readyCallbacks = new CdvPurchase2.Internal.ReadyCallbacks(this.log);
          this.updatedCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "productUpdated()");
          this.updatedReceiptsCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "receiptUpdated()");
          this.initiatedCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "initiated()");
          this.approvedCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "approved()");
          this.finishedCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "finished()");
          this.pendingCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "pending()");
          this.verifiedCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "verified()");
          this.unverifiedCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "unverified()");
          this.receiptsReadyCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "receiptsReady()", true);
          this.receiptsVerifiedCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "receiptsVerified()", true);
          this.errorCallbacks = new CdvPurchase2.Internal.Callbacks(this.log, "error()");
          this.initializedHasBeenCalled = false;
          this.lastUpdate = 0;
          this.minTimeBetweenUpdates = 6e5;
          this.version = CdvPurchase2.PLUGIN_VERSION;
          const store = this;
          this.listener = new CdvPurchase2.Internal.StoreAdapterListener({
            updatedCallbacks: this.updatedCallbacks,
            updatedReceiptCallbacks: this.updatedReceiptsCallbacks,
            initiatedCallbacks: this.initiatedCallbacks,
            approvedCallbacks: this.approvedCallbacks,
            finishedCallbacks: this.finishedCallbacks,
            pendingCallbacks: this.pendingCallbacks,
            receiptsReadyCallbacks: this.receiptsReadyCallbacks
          }, this.log);
          this.transactionStateMonitors = new CdvPurchase2.Internal.TransactionStateMonitors(this.when());
          this._validator = new CdvPurchase2.Internal.Validator({
            adapters: this.adapters,
            getApplicationUsername: this.getApplicationUsername.bind(this),
            get localReceipts() {
              return store.localReceipts;
            },
            get validator() {
              return store.validator;
            },
            get validator_privacy_policy() {
              return store.validator_privacy_policy;
            },
            verifiedCallbacks: this.verifiedCallbacks,
            unverifiedCallbacks: this.unverifiedCallbacks,
            finish: (receipt) => this.finish(receipt)
          }, this.log);
          new CdvPurchase2.Internal.ReceiptsMonitor({
            hasLocalReceipts: () => this.localReceipts.length > 0,
            hasValidator: () => !!this.validator,
            numValidationRequests: () => this._validator.numRequests,
            numValidationResponses: () => this._validator.numResponses,
            off: this.off.bind(this),
            when: this.when.bind(this),
            receiptsVerified: () => {
              store.receiptsVerifiedCallbacks.trigger(void 0, "receipts_monitor_controller");
            },
            log: this.log
          }).launch();
          this.expiryMonitor = new CdvPurchase2.Internal.ExpiryMonitor({
            // get localReceipts() { return store.localReceipts; },
            get verifiedReceipts() {
              return store.verifiedReceipts;
            },
            // onTransactionExpired(transaction) {
            // store.approvedCallbacks.trigger(transaction);
            // },
            onVerifiedPurchaseExpired(verifiedPurchase, receipt) {
              store.verify(receipt.sourceReceipt);
            }
          });
          this.expiryMonitor.launch();
        }
        /**
         * Retrieve a platform adapter.
         *
         * The platform adapter has to have been initialized before.
         *
         * @see {@link initialize}
         */
        getAdapter(platform) {
          return this.adapters.find(platform);
        }
        /**
         * Get the application username as a string by either calling or returning {@link Store.applicationUsername}
        */
        getApplicationUsername() {
          if (this.applicationUsername instanceof Function)
            return this.applicationUsername();
          return this.applicationUsername;
        }
        /**
         * Register a product.
         *
         * @example
         * store.register([{
         *       id: 'subscription1',
         *       type: ProductType.PAID_SUBSCRIPTION,
         *       platform: Platform.APPLE_APPSTORE,
         *   }, {
         *       id: 'subscription1',
         *       type: ProductType.PAID_SUBSCRIPTION,
         *       platform: Platform.GOOGLE_PLAY,
         *   }, {
         *       id: 'consumable1',
         *       type: ProductType.CONSUMABLE,
         *       platform: Platform.BRAINTREE,
         *   }]);
         */
        register(product) {
          const errors = this.registeredProducts.add(product);
          errors.forEach((error) => {
            CdvPurchase2.store.errorCallbacks.trigger(error, "register_error");
            this.log.error(error);
          });
        }
        /**
         * Call to initialize the in-app purchase plugin.
         *
         * @param platforms - List of payment platforms to initialize, default to Store.defaultPlatform().
         */
        initialize(platforms = [this.defaultPlatform()]) {
          return __awaiter(this, void 0, void 0, function* () {
            if (this.initializedHasBeenCalled) {
              this.log.warn("store.initialized() has been called already.");
              return [];
            }
            this.log.info("initialize(" + JSON.stringify(platforms) + ") v" + CdvPurchase2.PLUGIN_VERSION);
            this.initializedHasBeenCalled = true;
            this.lastUpdate = +/* @__PURE__ */ new Date();
            const store = this;
            const ret = this.adapters.initialize(platforms, {
              error: this.triggerError.bind(this),
              get verbosity() {
                return store.verbosity;
              },
              getApplicationUsername() {
                return store.getApplicationUsername();
              },
              get listener() {
                return store.listener;
              },
              get log() {
                return store.log;
              },
              get registeredProducts() {
                return store.registeredProducts;
              },
              apiDecorators: {
                canPurchase: this.canPurchase.bind(this),
                owned: this.owned.bind(this),
                finish: this.finish.bind(this),
                order: this.order.bind(this),
                verify: this.verify.bind(this)
              }
            });
            ret.then(() => {
              this._readyCallbacks.trigger("initialize_promise_resolved");
              this.listener.setSupportedPlatforms(this.adapters.list.filter((a) => a.isSupported).map((a) => a.id));
            });
            return ret;
          });
        }
        /**
         * @deprecated - use store.initialize(), store.update() or store.restorePurchases()
         */
        refresh() {
          throw new Error("use store.initialize() or store.update()");
        }
        /**
         * Call to refresh the price of products and status of purchases.
         */
        update() {
          var _a;
          return __awaiter(this, void 0, void 0, function* () {
            this.log.info("update()");
            if (!this._readyCallbacks.isReady) {
              this.log.warn("Do not call store.update() at startup! It is meant to reload the price of products (if needed) long after initialization.");
              return;
            }
            const now = +/* @__PURE__ */ new Date();
            if (this.lastUpdate > now - this.minTimeBetweenUpdates) {
              this.log.info("Skipping store.update() as the last call occurred less than store.minTimeBetweenUpdates millis ago.");
              return;
            }
            this.lastUpdate = now;
            for (const registration of this.registeredProducts.byPlatform()) {
              const products = yield (_a = this.adapters.findReady(registration.platform)) === null || _a === void 0 ? void 0 : _a.loadProducts(registration.products);
              products === null || products === void 0 ? void 0 : products.forEach((p) => {
                if (p instanceof CdvPurchase2.Product)
                  this.updatedCallbacks.trigger(p, "update_has_loaded_products");
              });
            }
          });
        }
        /**
         * Register a callback to be called when the plugin is ready.
         *
         * This happens when all the platforms are initialized and their products loaded.
         */
        ready(cb) {
          this._readyCallbacks.add(cb);
        }
        /** true if the plugin is initialized and ready */
        get isReady() {
          return this._readyCallbacks.isReady;
        }
        /**
         * Register event callbacks.
         *
         * Events overview:
         * - `productUpdated`: Called when product metadata is loaded from the store
         * - `receiptUpdated`: Called when local receipt information changes (ownership status change, for example)
         * - `verified`: Called after successful receipt validation (requires a receipt validator)
         *
         * @example
         * // Monitor ownership with receipt validation
         * store.when()
         *      .approved(transaction => transaction.verify())
         *      .verified(receipt => {
         *          if (store.owned("my-product")) {
         *              // Product is owned and verified
         *          }
         *      });
         *
         * @example
         * // Monitor ownership without receipt validation
         * store.when().receiptUpdated(receipt => {
         *   if (store.owned("my-product")) {
         *     // Product is owned according to local data
         *   }
         * });
         */
        when() {
          const ret = {
            productUpdated: (cb, callbackName) => (this.updatedCallbacks.push(cb, callbackName), ret),
            receiptUpdated: (cb, callbackName) => (this.updatedReceiptsCallbacks.push(cb, callbackName), ret),
            updated: (cb, callbackName) => (this.updatedCallbacks.push(cb, callbackName), this.updatedReceiptsCallbacks.push(cb, callbackName), ret),
            // owned: (cb: Callback<Product>) => (this.ownedCallbacks.push(cb), ret),
            approved: (cb, callbackName) => (this.approvedCallbacks.push(cb, callbackName), ret),
            initiated: (cb, callbackName) => (this.initiatedCallbacks.push(cb, callbackName), ret),
            pending: (cb, callbackName) => (this.pendingCallbacks.push(cb, callbackName), ret),
            finished: (cb, callbackName) => (this.finishedCallbacks.push(cb, callbackName), ret),
            verified: (cb, callbackName) => (this.verifiedCallbacks.push(cb, callbackName), ret),
            unverified: (cb, callbackName) => (this.unverifiedCallbacks.push(cb, callbackName), ret),
            receiptsReady: (cb, callbackName) => (this.receiptsReadyCallbacks.push(cb, callbackName), ret),
            receiptsVerified: (cb, callbackName) => (this.receiptsVerifiedCallbacks.push(cb, callbackName), ret)
          };
          return ret;
        }
        /**
         * Remove a callback from any listener it might have been added to.
         */
        off(callback) {
          this.updatedCallbacks.remove(callback);
          this.updatedReceiptsCallbacks.remove(callback);
          this.approvedCallbacks.remove(callback);
          this.finishedCallbacks.remove(callback);
          this.pendingCallbacks.remove(callback);
          this.verifiedCallbacks.remove(callback);
          this.unverifiedCallbacks.remove(callback);
          this.receiptsReadyCallbacks.remove(callback);
          this.receiptsVerifiedCallbacks.remove(callback);
          this.errorCallbacks.remove(callback);
          this._readyCallbacks.remove(callback);
        }
        /**
         * Setup a function to be notified of changes to a transaction state.
         *
         * @param transaction The transaction to monitor.
         * @param onChange Function to be called when the transaction status changes.
         * @return A monitor which can be stopped with `monitor.stop()`
         *
         * @example
         * const monitor = store.monitor(transaction, state => {
         *   console.log('new state: ' + state);
         *   if (state === TransactionState.FINISHED)
         *     monitor.stop();
         * });
         */
        monitor(transaction, onChange, callbackName) {
          return this.transactionStateMonitors.start(transaction, CdvPurchase2.Utils.safeCallback(this.log, "monitor()", onChange, callbackName, "transactionStateMonitors_stateChanged"));
        }
        /**
         * List of all active products.
         *
         * Products are active if their details have been successfully loaded from the store.
         */
        get products() {
          return [].concat(...this.adapters.list.map((a) => a.products));
        }
        /**
         * Find a product from its id and platform
         *
         * @param productId Product identifier on the platform.
         * @param platform The product the product exists in. Can be omitted if you're only using a single payment platform.
         */
        get(productId, platform) {
          var _a;
          return (_a = this.adapters.findReady(platform)) === null || _a === void 0 ? void 0 : _a.products.find((p) => p.id === productId);
        }
        /**
         * List of all receipts present on the device.
         */
        get localReceipts() {
          return [].concat(...this.adapters.list.map((a) => a.receipts));
        }
        /** List of all transaction from the local receipts. */
        get localTransactions() {
          const ret = [];
          for (const receipt of this.localReceipts) {
            ret.push(...receipt.transactions);
          }
          return ret;
        }
        /**
         * List of receipts verified with the receipt validation service.
         *
         * Those receipt contains more information and are generally more up-to-date than the local ones.
         */
        get verifiedReceipts() {
          return this._validator.verifiedReceipts;
        }
        /**
         * List of all purchases from the verified receipts.
         */
        get verifiedPurchases() {
          return CdvPurchase2.Internal.VerifiedReceipts.getVerifiedPurchases(this.verifiedReceipts);
        }
        /**
         * Find the last verified purchase for a given product, from those verified by the receipt validator.
         */
        findInVerifiedReceipts(product) {
          return CdvPurchase2.Internal.VerifiedReceipts.find(this.verifiedReceipts, product);
        }
        /**
         * Find the latest transaction for a given product, from those reported by the device.
         */
        findInLocalReceipts(product) {
          return CdvPurchase2.Internal.LocalReceipts.find(this.localReceipts, product);
        }
        /** Return true if a product or offer can be purchased */
        canPurchase(offer) {
          const product = offer instanceof CdvPurchase2.Offer ? this.get(offer.productId, offer.platform) : offer;
          const adapter = this.adapters.findReady(offer.platform);
          if (!(adapter === null || adapter === void 0 ? void 0 : adapter.checkSupport("order")))
            return false;
          return CdvPurchase2.Internal.LocalReceipts.canPurchase(this.localReceipts, product);
        }
        /**
         * Return true if a product is owned
         *
         * Important: The value will be false when the app starts and will only become
         * true after purchase receipts have been loaded and validated. Without receipt validation,
         * it might remain false depending on the platform, make sure to store the ownership status
         * of non-consumable products in some way.
         *
         * @param product - The product object or identifier of the product.
         */
        owned(product) {
          return CdvPurchase2.Internal.owned({
            product: typeof product === "string" ? { id: product } : product,
            verifiedReceipts: this.validator ? this.verifiedReceipts : void 0,
            localReceipts: this.localReceipts
          });
        }
        /**
         * Place an order for a given offer.
         */
        order(offer, additionalData) {
          return __awaiter(this, void 0, void 0, function* () {
            this.log.info(`order(${offer.productId})`);
            const adapter = this.adapters.findReady(offer.platform);
            if (!adapter)
              return CdvPurchase2.storeError(CdvPurchase2.ErrorCode.PAYMENT_NOT_ALLOWED, "Adapter not found or not ready (" + offer.platform + ")", offer.platform, null);
            const ret = yield adapter.order(offer, additionalData || {});
            if (ret && "isError" in ret)
              CdvPurchase2.store.triggerError(ret);
            return ret;
          });
        }
        /**
         * Request a payment.
         *
         * A payment is a custom amount to charge the user. Make sure the selected payment platform
         * supports Payment Requests.
         *
         * @param paymentRequest Parameters of the payment request
         * @param additionalData Additional parameters
         */
        requestPayment(paymentRequest, additionalData) {
          var _a, _b, _c, _d, _e;
          const adapter = this.adapters.findReady(paymentRequest.platform);
          if (!adapter)
            return CdvPurchase2.PaymentRequestPromise.failed(CdvPurchase2.ErrorCode.PAYMENT_NOT_ALLOWED, "Adapter not found or not ready (" + paymentRequest.platform + ")", paymentRequest.platform, null);
          if (!paymentRequest.amountMicros) {
            paymentRequest.amountMicros = 0;
            for (const item of paymentRequest.items) {
              paymentRequest.amountMicros += (_b = (_a = item === null || item === void 0 ? void 0 : item.pricing) === null || _a === void 0 ? void 0 : _a.priceMicros) !== null && _b !== void 0 ? _b : 0;
            }
          }
          if (!paymentRequest.currency) {
            for (const item of paymentRequest.items) {
              if ((_c = item === null || item === void 0 ? void 0 : item.pricing) === null || _c === void 0 ? void 0 : _c.currency) {
                paymentRequest.currency = item.pricing.currency;
              }
            }
          } else {
            for (const item of paymentRequest.items) {
              if ((_d = item === null || item === void 0 ? void 0 : item.pricing) === null || _d === void 0 ? void 0 : _d.currency) {
                if (paymentRequest.currency !== item.pricing.currency) {
                  return CdvPurchase2.PaymentRequestPromise.failed(CdvPurchase2.ErrorCode.PAYMENT_INVALID, "Currencies do not match", paymentRequest.platform, item.id);
                }
              } else if (item === null || item === void 0 ? void 0 : item.pricing) {
                item.pricing.currency = paymentRequest.currency;
              }
            }
          }
          if (paymentRequest.items.length === 1) {
            const item = paymentRequest.items[0];
            if (item && !item.pricing) {
              item.pricing = {
                priceMicros: (_e = paymentRequest.amountMicros) !== null && _e !== void 0 ? _e : 0,
                currency: paymentRequest.currency
              };
            }
          }
          const promise = new CdvPurchase2.PaymentRequestPromise();
          adapter.requestPayment(paymentRequest, additionalData).then((result) => {
            promise.trigger(result);
            if (result instanceof CdvPurchase2.Transaction) {
              const onStateChange = (state) => {
                promise.trigger(result);
                if (result.state === CdvPurchase2.TransactionState.FINISHED)
                  monitor.stop();
              };
              const monitor = this.monitor(result, onStateChange, "requestPayment_onStateChange");
            }
          });
          return promise;
        }
        /**
         * Returns true if a platform supports the requested functionality.
         *
         * @example
         * store.checkSupport(Platform.APPLE_APPSTORE, 'requestPayment');
         * // => false
         */
        checkSupport(platform, functionality) {
          const adapter = this.adapters.find(platform);
          if (!adapter)
            return false;
          return adapter.checkSupport(functionality);
        }
        /**
         * Verify a receipt or transacting with the receipt validation service.
         *
         * This will be called from the Receipt or Transaction objects using the API decorators.
         */
        verify(receiptOrTransaction) {
          return __awaiter(this, void 0, void 0, function* () {
            this.log.info(`verify(${receiptOrTransaction.className})`);
            this._validator.add(receiptOrTransaction);
            setTimeout(() => this._validator.run(), 200);
          });
        }
        /**
         * Finalize a transaction.
         *
         * This will be called from the Receipt, Transaction or VerifiedReceipt objects using the API decorators.
         */
        finish(receipt) {
          return __awaiter(this, void 0, void 0, function* () {
            this.log.info(`finish(${receipt.className})`);
            const transactions = receipt instanceof CdvPurchase2.VerifiedReceipt ? receipt.sourceReceipt.transactions : receipt instanceof CdvPurchase2.Receipt ? receipt.transactions : [receipt];
            transactions.forEach((transaction) => {
              var _a;
              const adapter = (_a = this.adapters.findReady(transaction.platform)) === null || _a === void 0 ? void 0 : _a.finish(transaction);
            });
          });
        }
        /**
         * Replay the users transactions.
         *
         * This method exists to cover an Apple AppStore requirement.
         */
        restorePurchases() {
          return __awaiter(this, void 0, void 0, function* () {
            let error;
            for (const adapter of this.adapters.list) {
              if (adapter.ready) {
                error = error !== null && error !== void 0 ? error : yield adapter.restorePurchases();
              }
            }
            return error;
          });
        }
        /**
         * Open the subscription management interface for the selected platform.
         *
         * If platform is not specified, the first available platform will be used.
         *
         * @example
         * const activeSubscription: Purchase = // ...
         * store.manageSubscriptions(activeSubscription.platform);
         */
        manageSubscriptions(platform) {
          return __awaiter(this, void 0, void 0, function* () {
            this.log.info("manageSubscriptions()");
            const adapter = this.adapters.findReady(platform);
            if (!adapter)
              return CdvPurchase2.storeError(CdvPurchase2.ErrorCode.SETUP, "Found no adapter ready to handle 'manageSubscription'", platform !== null && platform !== void 0 ? platform : null, null);
            return adapter.manageSubscriptions();
          });
        }
        /**
         * Opens the billing methods page on AppStore, Play, Microsoft, ...
         *
         * From this page, the user can update their payment methods.
         *
         * If platform is not specified, the first available platform will be used.
         *
         * @example
         * if (purchase.isBillingRetryPeriod)
         *     store.manageBilling(purchase.platform);
         */
        manageBilling(platform) {
          return __awaiter(this, void 0, void 0, function* () {
            this.log.info("manageBilling()");
            const adapter = this.adapters.findReady(platform);
            if (!adapter)
              return CdvPurchase2.storeError(CdvPurchase2.ErrorCode.SETUP, "Found no adapter ready to handle 'manageBilling'", platform !== null && platform !== void 0 ? platform : null, null);
            return adapter.manageBilling();
          });
        }
        /**
         * The default payment platform to use depending on the OS.
         *
         * - on iOS: `APPLE_APPSTORE`
         * - on Android: `GOOGLE_PLAY`
         */
        defaultPlatform() {
          switch (CdvPurchase2.Utils.platformId()) {
            case "android":
              return CdvPurchase2.Platform.GOOGLE_PLAY;
            case "ios":
              return CdvPurchase2.Platform.APPLE_APPSTORE;
            default:
              return CdvPurchase2.Platform.TEST;
          }
        }
        /**
         * Register an error handler.
         *
         * @param error An error callback that takes the error as an argument
         *
         * @example
         * store.error(function(error) {
         *   console.error('CdvPurchase ERROR: ' + error.message);
         * });
         */
        error(error) {
          this.errorCallbacks.push(error);
        }
        /**
         * Trigger an error event.
         *
         * @internal
         */
        triggerError(error) {
          this.errorCallbacks.trigger(error, "triggerError");
        }
      }
      CdvPurchase2.Store = Store;
    })(CdvPurchase || (CdvPurchase = {}));
    if (window.cordova) {
      setTimeout(initCDVPurchase, 0);
    } else {
      initCDVPurchase();
    }
    function initCDVPurchase() {
      var _a;
      console.log("Create CdvPurchase...");
      const oldStore = (_a = window.CdvPurchase) === null || _a === void 0 ? void 0 : _a.store;
      window.CdvPurchase = CdvPurchase;
      if (oldStore) {
        window.CdvPurchase.store = oldStore;
      } else {
        window.CdvPurchase.store = new CdvPurchase.Store();
      }
      Object.assign(window.CdvPurchase.store, CdvPurchase.LogLevel, CdvPurchase.ProductType, CdvPurchase.ErrorCode, CdvPurchase.Platform);
    }
    var CdvPurchase;
    (function(CdvPurchase2) {
      let ProductType;
      (function(ProductType2) {
        ProductType2["CONSUMABLE"] = "consumable";
        ProductType2["NON_CONSUMABLE"] = "non consumable";
        ProductType2["FREE_SUBSCRIPTION"] = "free subscription";
        ProductType2["PAID_SUBSCRIPTION"] = "paid subscription";
        ProductType2["NON_RENEWING_SUBSCRIPTION"] = "non renewing subscription";
        ProductType2["APPLICATION"] = "application";
      })(ProductType = CdvPurchase2.ProductType || (CdvPurchase2.ProductType = {}));
      let RecurrenceMode;
      (function(RecurrenceMode2) {
        RecurrenceMode2["NON_RECURRING"] = "NON_RECURRING";
        RecurrenceMode2["FINITE_RECURRING"] = "FINITE_RECURRING";
        RecurrenceMode2["INFINITE_RECURRING"] = "INFINITE_RECURRING";
      })(RecurrenceMode = CdvPurchase2.RecurrenceMode || (CdvPurchase2.RecurrenceMode = {}));
      let PaymentMode;
      (function(PaymentMode2) {
        PaymentMode2["PAY_AS_YOU_GO"] = "PayAsYouGo";
        PaymentMode2["UP_FRONT"] = "UpFront";
        PaymentMode2["FREE_TRIAL"] = "FreeTrial";
      })(PaymentMode = CdvPurchase2.PaymentMode || (CdvPurchase2.PaymentMode = {}));
      let Platform;
      (function(Platform2) {
        Platform2["APPLE_APPSTORE"] = "ios-appstore";
        Platform2["GOOGLE_PLAY"] = "android-playstore";
        Platform2["WINDOWS_STORE"] = "windows-store-transaction";
        Platform2["BRAINTREE"] = "braintree";
        Platform2["TEST"] = "test";
      })(Platform = CdvPurchase2.Platform || (CdvPurchase2.Platform = {}));
      let TransactionState;
      (function(TransactionState2) {
        TransactionState2["INITIATED"] = "initiated";
        TransactionState2["PENDING"] = "pending";
        TransactionState2["APPROVED"] = "approved";
        TransactionState2["CANCELLED"] = "cancelled";
        TransactionState2["FINISHED"] = "finished";
        TransactionState2["UNKNOWN_STATE"] = "";
      })(TransactionState = CdvPurchase2.TransactionState || (CdvPurchase2.TransactionState = {}));
      let RenewalIntent;
      (function(RenewalIntent2) {
        RenewalIntent2["LAPSE"] = "Lapse";
        RenewalIntent2["RENEW"] = "Renew";
      })(RenewalIntent = CdvPurchase2.RenewalIntent || (CdvPurchase2.RenewalIntent = {}));
      let PriceConsentStatus;
      (function(PriceConsentStatus2) {
        PriceConsentStatus2["NOTIFIED"] = "Notified";
        PriceConsentStatus2["AGREED"] = "Agreed";
      })(PriceConsentStatus = CdvPurchase2.PriceConsentStatus || (CdvPurchase2.PriceConsentStatus = {}));
      let CancelationReason;
      (function(CancelationReason2) {
        CancelationReason2["NOT_CANCELED"] = "";
        CancelationReason2["DEVELOPER"] = "Developer";
        CancelationReason2["SYSTEM"] = "System";
        CancelationReason2["SYSTEM_REPLACED"] = "System.Replaced";
        CancelationReason2["SYSTEM_PRODUCT_UNAVAILABLE"] = "System.ProductUnavailable";
        CancelationReason2["SYSTEM_BILLING_ERROR"] = "System.BillingError";
        CancelationReason2["SYSTEM_DELETED"] = "System.Deleted";
        CancelationReason2["CUSTOMER"] = "Customer";
        CancelationReason2["CUSTOMER_TECHNICAL_ISSUES"] = "Customer.TechnicalIssues";
        CancelationReason2["CUSTOMER_PRICE_INCREASE"] = "Customer.PriceIncrease";
        CancelationReason2["CUSTOMER_COST"] = "Customer.Cost";
        CancelationReason2["CUSTOMER_FOUND_BETTER_APP"] = "Customer.FoundBetterApp";
        CancelationReason2["CUSTOMER_NOT_USEFUL_ENOUGH"] = "Customer.NotUsefulEnough";
        CancelationReason2["CUSTOMER_OTHER_REASON"] = "Customer.OtherReason";
        CancelationReason2["UNKNOWN"] = "Unknown";
      })(CancelationReason = CdvPurchase2.CancelationReason || (CdvPurchase2.CancelationReason = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      class Offer {
        /** @internal */
        constructor(options, decorator) {
          this.className = "Offer";
          this.id = options.id;
          this.pricingPhases = options.pricingPhases;
          Object.defineProperty(this, "productId", { enumerable: true, get: () => options.product.id });
          Object.defineProperty(this, "productType", { enumerable: true, get: () => options.product.type });
          Object.defineProperty(this, "productGroup", { enumerable: true, get: () => options.product.group });
          Object.defineProperty(this, "platform", { enumerable: true, get: () => options.product.platform });
          Object.defineProperty(this, "order", { enumerable: false, get: () => (additionalData) => decorator.order(this, additionalData) });
          Object.defineProperty(this, "canPurchase", { enumerable: false, get: () => decorator.canPurchase(this) });
        }
        /** Identifier of the product related to this offer */
        get productId() {
          return "";
        }
        /** Type of the product related to this offer */
        get productType() {
          return CdvPurchase2.ProductType.APPLICATION;
        }
        /** Group the product related to this offer is member of */
        get productGroup() {
          return void 0;
        }
        /** Platform this offer is available from */
        get platform() {
          return CdvPurchase2.Platform.TEST;
        }
        /**
         * Initiate a purchase of this offer.
         *
         * @example
         * store.get("my-product").getOffer().order();
         */
        order(additionalData) {
          return __awaiter(this, void 0, void 0, function* () {
            return;
          });
        }
        /**
         * true if the offer can be purchased.
         */
        get canPurchase() {
          return false;
        }
      }
      CdvPurchase2.Offer = Offer;
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      class PaymentRequestPromise {
        constructor() {
          this.failedCallbacks = new CdvPurchase2.Internal.PromiseLike();
          this.initiatedCallbacks = new CdvPurchase2.Internal.PromiseLike();
          this.approvedCallbacks = new CdvPurchase2.Internal.PromiseLike();
          this.finishedCallbacks = new CdvPurchase2.Internal.PromiseLike();
          this.cancelledCallback = new CdvPurchase2.Internal.PromiseLike();
        }
        failed(callback) {
          this.failedCallbacks.push(callback);
          return this;
        }
        initiated(callback) {
          this.initiatedCallbacks.push(callback);
          return this;
        }
        approved(callback) {
          this.approvedCallbacks.push(callback);
          return this;
        }
        finished(callback) {
          this.finishedCallbacks.push(callback);
          return this;
        }
        cancelled(callback) {
          this.cancelledCallback.push(callback);
          return this;
        }
        /** @internal */
        trigger(argument) {
          if (!argument) {
            this.cancelledCallback.resolve();
          } else if ("isError" in argument) {
            this.failedCallbacks.resolve(argument);
          } else {
            switch (argument.state) {
              case CdvPurchase2.TransactionState.INITIATED:
                this.initiatedCallbacks.resolve(argument);
                break;
              case CdvPurchase2.TransactionState.APPROVED:
                this.approvedCallbacks.resolve(argument);
                break;
              case CdvPurchase2.TransactionState.FINISHED:
                this.finishedCallbacks.resolve(argument);
                break;
            }
          }
          return this;
        }
        /**
         * Return a failed promise.
         *
         * @internal
         */
        static failed(code, message, platform, productId) {
          return new PaymentRequestPromise().trigger(CdvPurchase2.storeError(code, message, platform, productId));
        }
        /**
         * Return a failed promise.
         *
         * @internal
         */
        static cancelled() {
          return new PaymentRequestPromise().trigger();
        }
        /**
         * Return an initiated transaction.
         *
         * @internal
         */
        static initiated(transaction) {
          return new PaymentRequestPromise().trigger(transaction);
        }
      }
      CdvPurchase2.PaymentRequestPromise = PaymentRequestPromise;
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      class Receipt {
        /** @internal */
        constructor(platform, decorator) {
          this.className = "Receipt";
          this.transactions = [];
          this.platform = platform;
          Object.defineProperty(this, "verify", { "enumerable": false, get() {
            return () => decorator.verify(this);
          } });
          Object.defineProperty(this, "finish", { "enumerable": false, get() {
            return () => decorator.finish(this);
          } });
        }
        /** Verify a receipt */
        verify() {
          return __awaiter(this, void 0, void 0, function* () {
          });
        }
        /** Finish all transactions in a receipt */
        finish() {
          return __awaiter(this, void 0, void 0, function* () {
          });
        }
        /** Return true if the receipt contains the given transaction */
        hasTransaction(value) {
          return !!this.transactions.find((t) => t === value);
        }
        /** Return the last transaction in this receipt */
        lastTransaction() {
          return this.transactions[this.transactions.length - 1];
        }
      }
      CdvPurchase2.Receipt = Receipt;
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      class Transaction {
        /** @internal */
        constructor(platform, parentReceipt, decorator) {
          this.className = "Transaction";
          this.transactionId = "";
          this.state = CdvPurchase2.TransactionState.UNKNOWN_STATE;
          this.products = [];
          this.platform = platform;
          Object.defineProperty(this, "finish", { "enumerable": false, get() {
            return () => decorator.finish(this);
          } });
          Object.defineProperty(this, "verify", { "enumerable": false, get() {
            return () => decorator.verify(this);
          } });
          Object.defineProperty(this, "parentReceipt", { "enumerable": false, get() {
            return parentReceipt;
          } });
        }
        /**
         * Finish a transaction.
         *
         * When the application has delivered the product, it should finalizes the order.
         * Only after that, money will be transferred to your account.
         * This method ensures that no customers is charged for a product that couldn't be delivered.
         *
         * @example
         * store.when()
         *   .approved(transaction => transaction.verify())
         *   .verified(receipt => receipt.finish())
         */
        finish() {
          return __awaiter(this, void 0, void 0, function* () {
          });
        }
        // actual implementation in the constructor
        /**
         * Verify a transaction.
         *
         * This will trigger a call to the receipt validation service for the attached receipt.
         * Once the receipt has been verified, you can finish the transaction.
         *
         * @example
         * store.when()
         *   .approved(transaction => transaction.verify())
         *   .verified(receipt => receipt.finish())
         */
        verify() {
          return __awaiter(this, void 0, void 0, function* () {
          });
        }
        // actual implementation in the constructor
        /**
         * Return the receipt this transaction is part of.
         */
        get parentReceipt() {
          return {};
        }
        // actual implementation in the constructor
      }
      CdvPurchase2.Transaction = Transaction;
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class LocalReceipts {
          /**
           * Find the latest transaction for a given product, from those reported by the device.
           */
          static find(localReceipts, product) {
            var _a, _b;
            if (!product)
              return void 0;
            let found;
            for (const receipt of localReceipts) {
              if (product.platform && receipt.platform !== product.platform)
                continue;
              for (const transaction of receipt.transactions) {
                for (const trProducts of transaction.products) {
                  if (trProducts.id === product.id) {
                    if (!found || ((_a = transaction.purchaseDate) !== null && _a !== void 0 ? _a : 0) < ((_b = found.purchaseDate) !== null && _b !== void 0 ? _b : 1))
                      found = transaction;
                  }
                }
              }
            }
            return found;
          }
          /** Return true if a product is owned */
          static isOwned(localReceipts, product) {
            if (!product)
              return false;
            const transaction = LocalReceipts.find(localReceipts, product);
            if (!transaction)
              return false;
            if (transaction.isConsumed)
              return false;
            if (transaction.isPending)
              return false;
            if (transaction.expirationDate)
              return transaction.expirationDate.getTime() > +/* @__PURE__ */ new Date();
            return true;
          }
          static canPurchase(localReceipts, product) {
            if (!product)
              return false;
            const transaction = LocalReceipts.find(localReceipts, product);
            if (!transaction)
              return true;
            if (transaction.isConsumed)
              return true;
            if (transaction.expirationDate)
              return transaction.expirationDate.getTime() <= +/* @__PURE__ */ new Date();
            return true;
          }
        }
        Internal2.LocalReceipts = LocalReceipts;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        function owned(options) {
          if (options.verifiedReceipts !== void 0) {
            return Internal2.VerifiedReceipts.isOwned(options.verifiedReceipts, options.product);
          } else if (options.localReceipts !== void 0) {
            return Internal2.LocalReceipts.isOwned(options.localReceipts, options.product);
          } else {
            return false;
          }
        }
        Internal2.owned = owned;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class PromiseLike {
          constructor() {
            this.resolved = false;
            this.callbacks = [];
          }
          /** Add a callback to the list */
          push(callback) {
            if (this.resolved)
              setTimeout(callback, 0, this.resolvedArgument);
            else
              this.callbacks.push(callback);
          }
          /** Call all registered callbacks with the given value */
          resolve(value) {
            if (this.resolved)
              return;
            this.resolved = true;
            this.resolvedArgument = value;
            this.callbacks.forEach((cb) => setTimeout(cb, 0, value));
            this.callbacks = [];
          }
        }
        Internal2.PromiseLike = PromiseLike;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class Retry {
          constructor(minTimeout = 5e3, maxTimeout = 12e4) {
            this.maxTimeout = 12e4;
            this.minTimeout = 5e3;
            this.retryTimeout = 5e3;
            this.retries = [];
            this.minTimeout = minTimeout;
            this.maxTimeout = maxTimeout;
            this.retryTimeout = minTimeout;
            document.addEventListener("online", () => {
              const a = this.retries;
              this.retries = [];
              this.retryTimeout = this.minTimeout;
              for (var i = 0; i < a.length; ++i) {
                clearTimeout(a[i].tid);
                a[i].fn.call(this);
              }
            }, false);
          }
          retry(fn) {
            var tid = setTimeout(() => {
              this.retries = this.retries.filter(function(o) {
                return tid !== o.tid;
              });
              fn();
            }, this.retryTimeout);
            this.retries.push({ tid, fn });
            this.retryTimeout *= 2;
            if (this.retryTimeout > this.maxTimeout)
              this.retryTimeout = this.maxTimeout;
          }
        }
        Internal2.Retry = Retry;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Internal;
      (function(Internal2) {
        class VerifiedReceipts {
          /**
           * Find the last verified purchase for a given product, from those verified by the receipt validator.
           */
          static find(verifiedReceipts, product) {
            var _a, _b;
            if (!product)
              return void 0;
            let found;
            for (const receipt of verifiedReceipts) {
              if (product.platform && receipt.platform !== product.platform)
                continue;
              for (const purchase of receipt.collection) {
                if (purchase.id === product.id) {
                  if (((_a = found === null || found === void 0 ? void 0 : found.purchaseDate) !== null && _a !== void 0 ? _a : 0) < ((_b = purchase.purchaseDate) !== null && _b !== void 0 ? _b : 1))
                    found = purchase;
                }
              }
            }
            return found;
          }
          /** Return true if a product is owned, based on the content of the list of verified receipts  */
          static isOwned(verifiedReceipts, product) {
            if (!product)
              return false;
            const purchase = VerifiedReceipts.find(verifiedReceipts, product);
            if (!purchase)
              return false;
            if (purchase === null || purchase === void 0 ? void 0 : purchase.isExpired)
              return false;
            if (purchase === null || purchase === void 0 ? void 0 : purchase.expiryDate) {
              return purchase.expiryDate > +/* @__PURE__ */ new Date();
            }
            return true;
          }
          static getVerifiedPurchases(verifiedReceipts) {
            var _a, _b, _c, _d;
            const indexed = {};
            for (const receipt of verifiedReceipts) {
              for (const purchase of receipt.collection) {
                const key = receipt.platform + ":" + purchase.id;
                const existing = indexed[key];
                if (!existing || existing && ((_b = (_a = existing.lastRenewalDate) !== null && _a !== void 0 ? _a : existing.purchaseDate) !== null && _b !== void 0 ? _b : 0) < ((_d = (_c = purchase.lastRenewalDate) !== null && _c !== void 0 ? _c : purchase.purchaseDate) !== null && _d !== void 0 ? _d : 0)) {
                  indexed[key] = Object.assign(Object.assign({}, purchase), { platform: receipt.platform });
                }
              }
            }
            return Object.keys(indexed).map((key) => indexed[key]);
          }
        }
        Internal2.VerifiedReceipts = VerifiedReceipts;
      })(Internal = CdvPurchase2.Internal || (CdvPurchase2.Internal = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let ApplePay;
      (function(ApplePay2) {
        let ContactField;
        (function(ContactField2) {
          ContactField2["Name"] = "name";
          ContactField2["EmailAddress"] = "emailAddress";
          ContactField2["PhoneNumber"] = "phoneNumber";
          ContactField2["PostalAddress"] = "postalAddress";
          ContactField2["PhoneticName"] = "phoneticName";
        })(ContactField = ApplePay2.ContactField || (ApplePay2.ContactField = {}));
        let PaymentNetwork;
        (function(PaymentNetwork2) {
          PaymentNetwork2["Amex"] = "Amex";
          PaymentNetwork2["Barcode"] = "Barcode";
          PaymentNetwork2["CartesBancaires"] = "CartesBancaires";
          PaymentNetwork2["ChinaUnionPay"] = "ChinaUnionPay";
          PaymentNetwork2["Dankort"] = "Dankort";
          PaymentNetwork2["Discover"] = "Discover";
          PaymentNetwork2["Eftpos"] = "Eftpos";
          PaymentNetwork2["Electron"] = "Electron";
          PaymentNetwork2["Elo"] = "Elo";
          PaymentNetwork2["Girocard"] = "Girocard";
          PaymentNetwork2["IDCredit"] = "IDCredit";
          PaymentNetwork2["Interac"] = "Interac";
          PaymentNetwork2["JCB"] = "JCB";
          PaymentNetwork2["Mada"] = "Mada";
          PaymentNetwork2["Maestro"] = "Maestro";
          PaymentNetwork2["MasterCard"] = "MasterCard";
          PaymentNetwork2["Mir"] = "Mir";
          PaymentNetwork2["Nanaco"] = "Nanaco";
          PaymentNetwork2["PrivateLabel"] = "PrivateLabel";
          PaymentNetwork2["QuicPay"] = "QuicPay";
          PaymentNetwork2["Suica"] = "Suica";
          PaymentNetwork2["Visa"] = "Visa";
          PaymentNetwork2["VPay"] = "VPay";
          PaymentNetwork2["Waon"] = "Waon";
        })(PaymentNetwork = ApplePay2.PaymentNetwork || (ApplePay2.PaymentNetwork = {}));
        let MerchantCapability;
        (function(MerchantCapability2) {
          MerchantCapability2["ThreeDS"] = "3DS";
          MerchantCapability2["EMV"] = "EMV";
          MerchantCapability2["Credit"] = "Credit";
          MerchantCapability2["Debit"] = "Debit";
        })(MerchantCapability = ApplePay2.MerchantCapability || (ApplePay2.MerchantCapability = {}));
      })(ApplePay = CdvPurchase2.ApplePay || (CdvPurchase2.ApplePay = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let AppleAppStore;
      (function(AppleAppStore2) {
        function virtualTransactionId(productId) {
          return `virtual.${productId}`;
        }
        class Adapter {
          constructor(context, options) {
            var _a, _b;
            this.id = CdvPurchase2.Platform.APPLE_APPSTORE;
            this.name = "AppStore";
            this.ready = false;
            this._canMakePayments = false;
            this.forceReceiptReload = false;
            this._products = [];
            this.validProducts = {};
            this._paymentMonitor = () => {
            };
            this.supportsParallelLoading = true;
            this._appStoreReceiptLoading = false;
            this._appStoreReceiptCallbacks = [];
            this.context = context;
            this.bridge = new AppleAppStore2.Bridge.Bridge();
            this.log = context.log.child("AppleAppStore");
            this.discountEligibilityDeterminer = options.discountEligibilityDeterminer;
            this.needAppReceipt = (_a = options.needAppReceipt) !== null && _a !== void 0 ? _a : true;
            this.autoFinish = (_b = options.autoFinish) !== null && _b !== void 0 ? _b : false;
            this.pseudoReceipt = new CdvPurchase2.Receipt(CdvPurchase2.Platform.APPLE_APPSTORE, this.context.apiDecorators);
            this.receiptsUpdated = CdvPurchase2.Utils.createDebouncer(() => {
              this._receiptsUpdated();
            }, 300);
          }
          get products() {
            return this._products;
          }
          /** Find a given product from ID */
          getProduct(id) {
            return this._products.find((p) => p.id === id);
          }
          get receipts() {
            if (!this.isSupported)
              return [];
            return (this._receipt ? [this._receipt] : []).concat(this.pseudoReceipt ? this.pseudoReceipt : []);
          }
          addValidProducts(registerProducts, validProducts) {
            validProducts.forEach((vp) => {
              const rp = registerProducts.find((p) => p.id === vp.id);
              if (!rp)
                return;
              this.validProducts[vp.id] = Object.assign(Object.assign({}, vp), rp);
            });
          }
          /** Returns true on iOS, the only platform supported by this adapter */
          get isSupported() {
            return CdvPurchase2.Utils.platformId() === "ios";
          }
          upsertTransactionInProgress(productId, state) {
            const transactionId = virtualTransactionId(productId);
            return new Promise((resolve) => {
              const existing = this.pseudoReceipt.transactions.find((t) => t.transactionId === transactionId);
              if (existing) {
                existing.state = state;
                existing.refresh(productId);
                resolve(existing);
              } else {
                const tr = new AppleAppStore2.SKTransaction(CdvPurchase2.Platform.APPLE_APPSTORE, this.pseudoReceipt, this.context.apiDecorators);
                tr.state = state;
                tr.transactionId = transactionId;
                tr.refresh(productId);
                this.pseudoReceipt.transactions.push(tr);
                resolve(tr);
              }
            });
          }
          /** Remove a transaction from the pseudo receipt */
          removeTransactionInProgress(productId) {
            const transactionId = virtualTransactionId(productId);
            this.pseudoReceipt.transactions = this.pseudoReceipt.transactions.filter((t) => t.transactionId !== transactionId);
          }
          /** Insert or update a transaction in the pseudo receipt, based on data collected from the native side */
          upsertTransaction(productId, transactionId, state) {
            return __awaiter(this, void 0, void 0, function* () {
              return new Promise((resolve) => {
                this.initializeAppReceipt(() => {
                  var _a;
                  if (!this._receipt) {
                    this.log.warn("Failed to load the application receipt, cannot proceed with handling the purchase");
                    return;
                  }
                  const existing = (_a = this._receipt) === null || _a === void 0 ? void 0 : _a.transactions.find((t) => t.transactionId === transactionId);
                  if (existing) {
                    existing.state = state;
                    existing.refresh(productId);
                    resolve(existing);
                  } else {
                    const tr = new AppleAppStore2.SKTransaction(CdvPurchase2.Platform.APPLE_APPSTORE, this._receipt, this.context.apiDecorators);
                    tr.state = state;
                    tr.transactionId = transactionId;
                    tr.refresh(productId);
                    this._receipt.transactions.push(tr);
                    resolve(tr);
                  }
                });
              });
            });
          }
          removeTransaction(transactionId) {
            if (this._receipt) {
              this._receipt.transactions = this._receipt.transactions.filter((t) => t.transactionId !== transactionId);
            }
          }
          /** Notify the store that the receipts have been updated */
          _receiptsUpdated() {
            if (this._receipt) {
              this.log.debug("receipt updated and ready.");
              this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [this._receipt, this.pseudoReceipt]);
              this.context.listener.receiptsReady(CdvPurchase2.Platform.APPLE_APPSTORE);
            } else {
              this.log.debug("receipt updated.");
              this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [this.pseudoReceipt]);
            }
          }
          setPaymentMonitor(fn) {
            this._paymentMonitor = fn;
          }
          callPaymentMonitor(status, code, message) {
            this._paymentMonitor(status);
          }
          initialize() {
            return new Promise((resolve) => {
              this.log.info("bridge.init");
              const bridgeLogger = this.log.child("Bridge");
              this.bridge.init({
                autoFinish: this.autoFinish,
                debug: this.context.verbosity === CdvPurchase2.LogLevel.DEBUG,
                log: (msg) => bridgeLogger.debug(msg),
                error: (code, message, options) => {
                  this.log.error("ERROR: " + code + " - " + message);
                  if (code === CdvPurchase2.ErrorCode.PAYMENT_CANCELLED) {
                    this.callPaymentMonitor("cancelled", CdvPurchase2.ErrorCode.PAYMENT_CANCELLED, message);
                    return;
                  } else {
                    this.context.error(appStoreError(code, message, (options === null || options === void 0 ? void 0 : options.productId) || null));
                  }
                },
                ready: () => {
                  this.log.info("ready");
                },
                purchased: (transactionIdentifier, productId, originalTransactionIdentifier, transactionDate, discountId) => __awaiter(this, void 0, void 0, function* () {
                  this.log.info("purchase: id:" + transactionIdentifier + " product:" + productId + " originalTransaction:" + originalTransactionIdentifier + " - date:" + transactionDate + " - discount:" + discountId);
                  const transaction = yield this.upsertTransaction(productId, transactionIdentifier, CdvPurchase2.TransactionState.APPROVED);
                  transaction.refresh(productId, originalTransactionIdentifier, transactionDate, discountId);
                  this.removeTransactionInProgress(productId);
                  this.receiptsUpdated.call();
                  this.callPaymentMonitor("purchased");
                }),
                purchaseEnqueued: (productId, quantity) => __awaiter(this, void 0, void 0, function* () {
                  this.log.info("purchaseEnqueued: " + productId + " - " + quantity);
                  yield this.upsertTransactionInProgress(productId, CdvPurchase2.TransactionState.INITIATED);
                  this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [this.pseudoReceipt]);
                }),
                purchaseFailed: (productId, code, message) => {
                  this.log.info("purchaseFailed: " + productId + " - " + code + " - " + message);
                  this.removeTransactionInProgress(productId);
                  this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [this.pseudoReceipt]);
                  this.callPaymentMonitor("failed", code, message);
                },
                purchasing: (productId) => __awaiter(this, void 0, void 0, function* () {
                  this.log.info("purchasing: " + productId);
                  yield this.upsertTransactionInProgress(productId, CdvPurchase2.TransactionState.INITIATED);
                  this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [this.pseudoReceipt]);
                }),
                deferred: (productId) => __awaiter(this, void 0, void 0, function* () {
                  this.log.info("deferred: " + productId);
                  yield this.upsertTransactionInProgress(productId, CdvPurchase2.TransactionState.PENDING);
                  this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [this.pseudoReceipt]);
                  this.callPaymentMonitor("deferred");
                }),
                finished: (transactionIdentifier, productId) => __awaiter(this, void 0, void 0, function* () {
                  yield this.receiptsUpdated.wait();
                  this.log.info("finish: " + transactionIdentifier + " - " + productId);
                  this.removeTransactionInProgress(productId);
                  yield this.upsertTransaction(productId, transactionIdentifier, CdvPurchase2.TransactionState.FINISHED);
                  this.receiptsUpdated.call();
                }),
                restored: (transactionIdentifier, productId) => __awaiter(this, void 0, void 0, function* () {
                  this.log.info("restore: " + transactionIdentifier + " - " + productId);
                  yield this.upsertTransaction(productId, transactionIdentifier, CdvPurchase2.TransactionState.APPROVED);
                  this.receiptsUpdated.call();
                }),
                receiptsRefreshed: (receipt) => {
                  this.log.info("receiptsRefreshed");
                  if (this._receipt)
                    this._receipt.refresh(receipt, this.needAppReceipt, this.context.apiDecorators);
                },
                restoreFailed: (errorCode) => {
                  this.log.info("restoreFailed: " + errorCode);
                  if (this.onRestoreCompleted) {
                    this.onRestoreCompleted(appStoreError(errorCode, "Restore purchases failed", null));
                    this.onRestoreCompleted = void 0;
                  }
                },
                restoreCompleted: () => {
                  this.log.info("restoreCompleted");
                  if (this.onRestoreCompleted) {
                    this.onRestoreCompleted(void 0);
                    this.onRestoreCompleted = void 0;
                  }
                }
              }, () => __awaiter(this, void 0, void 0, function* () {
                this.log.info("bridge.init done");
                yield this.canMakePayments();
                resolve(void 0);
              }), (code, message) => {
                this.log.info("bridge.init failed: " + code + " - " + message);
                resolve(appStoreError(code, message, null));
              });
            });
          }
          loadReceipts() {
            return new Promise((resolve) => {
              setTimeout(() => {
                this.initializeAppReceipt(() => {
                  this.receiptsUpdated.call();
                  if (this._receipt) {
                    resolve([this._receipt, this.pseudoReceipt]);
                  } else {
                    resolve([this.pseudoReceipt]);
                  }
                });
              }, 300);
            });
          }
          canMakePayments() {
            return __awaiter(this, void 0, void 0, function* () {
              return new Promise((resolve) => {
                this.bridge.canMakePayments(() => {
                  this._canMakePayments = true;
                  resolve(true);
                }, (message) => {
                  this.log.warn(`canMakePayments: ${message}`);
                  this._canMakePayments = false;
                  resolve(false);
                });
              });
            });
          }
          /**
           * Create the application receipt
           */
          initializeAppReceipt(callback) {
            return __awaiter(this, void 0, void 0, function* () {
              if (this._receipt) {
                this.log.debug("initializeAppReceipt() => already initialized.");
                return callback(void 0);
              }
              this._appStoreReceiptCallbacks.push(callback);
              if (this._appStoreReceiptLoading) {
                this.log.debug("initializeAppReceipt() => already loading.");
                return;
              }
              this._appStoreReceiptLoading = true;
              const nativeData = yield this.loadAppStoreReceipt();
              const callCallbacks = (arg) => {
                const callbacks = this._appStoreReceiptCallbacks;
                this._appStoreReceiptCallbacks = [];
                callbacks.forEach((cb) => {
                  cb(arg);
                });
              };
              if (!(nativeData === null || nativeData === void 0 ? void 0 : nativeData.appStoreReceipt)) {
                this.log.warn("no appStoreReceipt");
                this._appStoreReceiptLoading = false;
                callCallbacks(appStoreError(CdvPurchase2.ErrorCode.REFRESH, "No appStoreReceipt", null));
                return;
              }
              this._receipt = new AppleAppStore2.SKApplicationReceipt(nativeData, this.needAppReceipt, this.context.apiDecorators);
              callCallbacks(void 0);
            });
          }
          prepareReceipt(nativeData) {
            if (nativeData === null || nativeData === void 0 ? void 0 : nativeData.appStoreReceipt) {
              if (!this._receipt) {
                this._receipt = new AppleAppStore2.SKApplicationReceipt(nativeData, this.needAppReceipt, this.context.apiDecorators);
              } else {
                this._receipt.refresh(nativeData, this.needAppReceipt, this.context.apiDecorators);
              }
            }
          }
          /** Promisified loading of the AppStore receipt */
          loadAppStoreReceipt() {
            return __awaiter(this, void 0, void 0, function* () {
              let resolved = false;
              return new Promise((resolve) => {
                var _a;
                if (((_a = this.bridge.appStoreReceipt) === null || _a === void 0 ? void 0 : _a.appStoreReceipt) && !this.forceReceiptReload) {
                  this.log.debug("using cached appstore receipt");
                  return resolve(this.bridge.appStoreReceipt);
                }
                this.log.debug("loading appstore receipt...");
                this.forceReceiptReload = false;
                this.bridge.loadReceipts((receipt) => {
                  this.log.debug("appstore receipt loaded");
                  if (!resolved)
                    resolve(receipt);
                  resolved = true;
                }, (code, message) => {
                  this.log.warn("Failed to load appStoreReceipt: " + code + " - " + message);
                  if (!resolved)
                    resolve(void 0);
                  resolved = true;
                });
                setTimeout(function() {
                  if (!resolved)
                    resolve(void 0);
                  resolved = true;
                }, 5e3);
              }).then((result) => {
                this.context.listener.receiptsReady(CdvPurchase2.Platform.APPLE_APPSTORE);
                return result;
              }).catch((reason) => {
                this.context.listener.receiptsReady(CdvPurchase2.Platform.APPLE_APPSTORE);
                return reason;
              });
            });
          }
          loadEligibility(validProducts) {
            return __awaiter(this, void 0, void 0, function* () {
              this.log.debug("load eligibility: " + JSON.stringify(validProducts));
              if (!this.discountEligibilityDeterminer) {
                this.log.debug("No discount eligibility determiner, skipping...");
                return new AppleAppStore2.Internal.DiscountEligibilities([], []);
              }
              const eligibilityRequests = [];
              validProducts.forEach((valid) => {
                var _a, _b, _c;
                (_a = valid.discounts) === null || _a === void 0 ? void 0 : _a.forEach((discount) => {
                  eligibilityRequests.push({
                    productId: valid.id,
                    discountId: discount.id,
                    discountType: discount.type
                  });
                });
                if (((_c = (_b = valid.discounts) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0) === 0 && valid.introPrice) {
                  eligibilityRequests.push({
                    productId: valid.id,
                    discountId: "intro",
                    discountType: "Introductory"
                  });
                }
              });
              if (eligibilityRequests.length > 0) {
                const applicationReceipt = yield this.loadAppStoreReceipt();
                if (!applicationReceipt || !applicationReceipt.appStoreReceipt) {
                  this.log.debug("no receipt, assuming introductory price are available.");
                  return new AppleAppStore2.Internal.DiscountEligibilities(eligibilityRequests, eligibilityRequests.map((r) => r.discountType === "Introductory"));
                } else {
                  this.log.debug("calling discount eligibility determiner.");
                  const response = yield this.callDiscountEligibilityDeterminer(applicationReceipt, eligibilityRequests);
                  this.log.debug("response: " + JSON.stringify(response));
                  return new AppleAppStore2.Internal.DiscountEligibilities(eligibilityRequests, response);
                }
              } else {
                return new AppleAppStore2.Internal.DiscountEligibilities([], []);
              }
            });
          }
          callDiscountEligibilityDeterminer(applicationReceipt, eligibilityRequests) {
            return new Promise((resolve) => {
              if (!this.discountEligibilityDeterminer)
                return resolve([]);
              this.discountEligibilityDeterminer(applicationReceipt, eligibilityRequests, resolve);
            });
          }
          loadProducts(products) {
            return new Promise((resolve) => {
              this.log.info("bridge.load");
              this.bridge.load(products.map((p) => p.id), (validProducts, invalidProducts) => __awaiter(this, void 0, void 0, function* () {
                this.log.info("bridge.loaded: " + JSON.stringify({ validProducts, invalidProducts }));
                this.addValidProducts(products, validProducts);
                const eligibilities = yield this.loadEligibility(validProducts);
                this.log.info("eligibilities ready: " + JSON.stringify(eligibilities));
                const ret = products.map((p) => {
                  if (invalidProducts.indexOf(p.id) >= 0) {
                    this.log.debug(`${p.id} is invalid`);
                    return appStoreError(CdvPurchase2.ErrorCode.INVALID_PRODUCT_ID, "Product not found in AppStore. #400", p.id);
                  } else {
                    const valid = validProducts.find((v) => v.id === p.id);
                    this.log.debug(`${p.id} is valid: ${JSON.stringify(valid)}`);
                    if (!valid)
                      return appStoreError(CdvPurchase2.ErrorCode.INVALID_PRODUCT_ID, "Product not found in AppStore. #404", p.id);
                    let product = this.getProduct(p.id);
                    if (product) {
                      this.log.debug("refreshing existing product");
                      product === null || product === void 0 ? void 0 : product.refresh(valid, this.context.apiDecorators, eligibilities);
                    } else {
                      this.log.debug("registering new product");
                      product = new AppleAppStore2.SKProduct(valid, p, this.context.apiDecorators, eligibilities);
                      this._products.push(product);
                    }
                    return product;
                  }
                });
                this.log.debug(`Products loaded: ${JSON.stringify(ret)}`);
                resolve(ret);
              }), (code, message) => {
                return products.map((p) => appStoreError(code, message, null));
              });
            });
          }
          order(offer, additionalData) {
            return __awaiter(this, void 0, void 0, function* () {
              let resolved = false;
              return new Promise((resolve) => {
                var _a;
                const callResolve = (result) => {
                  if (resolved)
                    return;
                  this.setPaymentMonitor(() => {
                  });
                  resolved = true;
                  resolve(result);
                };
                this.log.info("order");
                const discountId = offer.id !== AppleAppStore2.DEFAULT_OFFER_ID ? offer.id : void 0;
                const discount = (_a = additionalData === null || additionalData === void 0 ? void 0 : additionalData.appStore) === null || _a === void 0 ? void 0 : _a.discount;
                if (discountId && !discount) {
                  return callResolve(appStoreError(CdvPurchase2.ErrorCode.MISSING_OFFER_PARAMS, "Missing additionalData.appStore.discount when ordering a discount offer", offer.productId));
                }
                if (discountId && (discount === null || discount === void 0 ? void 0 : discount.id) !== discountId) {
                  return callResolve(appStoreError(CdvPurchase2.ErrorCode.INVALID_OFFER_IDENTIFIER, "Offer identifier does not match additionalData.appStore.discount.id", offer.productId));
                }
                this.setPaymentMonitor((status, code, message) => {
                  this.log.info("order.paymentMonitor => " + status + " " + (code !== null && code !== void 0 ? code : "") + " " + (message !== null && message !== void 0 ? message : ""));
                  if (resolved)
                    return;
                  switch (status) {
                    case "cancelled":
                      callResolve(appStoreError(code !== null && code !== void 0 ? code : CdvPurchase2.ErrorCode.PAYMENT_CANCELLED, message !== null && message !== void 0 ? message : "The user cancelled the order.", offer.productId));
                      break;
                    case "failed":
                      setTimeout(() => {
                        callResolve(appStoreError(code !== null && code !== void 0 ? code : CdvPurchase2.ErrorCode.PURCHASE, message !== null && message !== void 0 ? message : "Purchase failed", offer.productId));
                      }, 500);
                      break;
                    case "purchased":
                    case "deferred":
                      callResolve(void 0);
                      break;
                  }
                });
                const success = () => {
                  this.log.info("order.success");
                };
                const error = () => {
                  this.log.info("order.error");
                  callResolve(appStoreError(CdvPurchase2.ErrorCode.PURCHASE, "Failed to place order", offer.productId));
                };
                this.forceReceiptReload = true;
                this.bridge.purchase(offer.productId, 1, this.context.getApplicationUsername(), discount, success, error);
              });
            });
          }
          finish(transaction) {
            return new Promise((resolve) => {
              this.log.info("finish(" + transaction.transactionId + ")");
              if (transaction.transactionId === AppleAppStore2.APPLICATION_VIRTUAL_TRANSACTION_ID || transaction.transactionId === virtualTransactionId(transaction.products[0].id)) {
                transaction.state = CdvPurchase2.TransactionState.FINISHED;
                this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [transaction.parentReceipt]);
                return resolve(void 0);
              }
              const success = () => {
                transaction.state = CdvPurchase2.TransactionState.FINISHED;
                this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [transaction.parentReceipt]);
                resolve(void 0);
              };
              const error = (msg) => {
                var _a, _b;
                if (msg === null || msg === void 0 ? void 0 : msg.includes("[#CdvPurchase:100]")) {
                  success();
                } else {
                  resolve(appStoreError(CdvPurchase2.ErrorCode.FINISH, "Failed to finish transaction", (_b = (_a = transaction.products[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null));
                }
              };
              this.bridge.finish(transaction.transactionId, success, error);
            });
          }
          refreshReceipt() {
            return new Promise((resolve) => {
              const success = (receipt) => {
                resolve(receipt);
              };
              const error = (code, message) => {
                resolve(appStoreError(code, message, null));
              };
              this.bridge.refreshReceipts(success, error);
            });
          }
          receiptValidationBody(receipt) {
            return __awaiter(this, void 0, void 0, function* () {
              if (receipt.platform !== CdvPurchase2.Platform.APPLE_APPSTORE)
                return;
              if (receipt !== this._receipt)
                return;
              const skReceipt = receipt;
              let applicationReceipt = skReceipt.nativeData;
              if (this.forceReceiptReload) {
                const nativeData = yield this.loadAppStoreReceipt();
                this.forceReceiptReload = false;
                if (nativeData) {
                  applicationReceipt = nativeData;
                  this.prepareReceipt(nativeData);
                }
              }
              if (!skReceipt.nativeData.appStoreReceipt) {
                this.log.info("Cannot prepare the receipt validation body, because appStoreReceipt is missing. Refreshing...");
                const result = yield this.refreshReceipt();
                if (!result || "isError" in result) {
                  this.log.warn("Failed to refresh receipt, cannot run receipt validation.");
                  if (result)
                    this.log.error(result);
                  return;
                }
                this.log.info("Receipt refreshed.");
                applicationReceipt = result;
              }
              const transaction = skReceipt.transactions.slice(-1)[0];
              return {
                id: applicationReceipt.bundleIdentifier,
                type: CdvPurchase2.ProductType.APPLICATION,
                // send all products and offers so validator get pricing information
                products: CdvPurchase2.Utils.objectValues(this.validProducts).map((vp) => new AppleAppStore2.SKProduct(vp, vp, this.context.apiDecorators, { isEligible: () => true })),
                transaction: {
                  type: "ios-appstore",
                  id: transaction === null || transaction === void 0 ? void 0 : transaction.transactionId,
                  appStoreReceipt: applicationReceipt.appStoreReceipt
                }
              };
            });
          }
          handleReceiptValidationResponse(_receipt, response) {
            var _a, _b;
            return __awaiter(this, void 0, void 0, function* () {
              let localReceiptUpdated = false;
              if (response.ok) {
                const vTransaction = (_a = response.data) === null || _a === void 0 ? void 0 : _a.transaction;
                if ((vTransaction === null || vTransaction === void 0 ? void 0 : vTransaction.type) === "ios-appstore" && "original_application_version" in vTransaction) {
                  (_b = this._receipt) === null || _b === void 0 ? void 0 : _b.transactions.forEach((t) => {
                    if (t.transactionId === AppleAppStore2.APPLICATION_VIRTUAL_TRANSACTION_ID) {
                      if (vTransaction.original_purchase_date_ms) {
                        t.purchaseDate = new Date(parseInt(vTransaction.original_purchase_date_ms));
                        localReceiptUpdated = true;
                      }
                    }
                  });
                }
              }
              if (localReceiptUpdated)
                this.context.listener.receiptsUpdated(CdvPurchase2.Platform.APPLE_APPSTORE, [_receipt]);
            });
          }
          requestPayment(payment, additionalData) {
            return __awaiter(this, void 0, void 0, function* () {
              return appStoreError(CdvPurchase2.ErrorCode.UNKNOWN, "requestPayment not supported", null);
            });
          }
          manageSubscriptions() {
            return __awaiter(this, void 0, void 0, function* () {
              this.bridge.manageSubscriptions();
              return;
            });
          }
          manageBilling() {
            return __awaiter(this, void 0, void 0, function* () {
              this.bridge.manageBilling();
              return;
            });
          }
          checkSupport(functionality) {
            if (functionality === "order")
              return this._canMakePayments;
            const supported = [
              "order",
              "manageBilling",
              "manageSubscriptions"
            ];
            return supported.indexOf(functionality) >= 0;
          }
          restorePurchases() {
            return new Promise((resolve) => {
              this.onRestoreCompleted = (error) => {
                this.onRestoreCompleted = void 0;
                this.bridge.refreshReceipts((obj) => {
                  resolve(error);
                }, (code, message) => {
                  resolve(error || appStoreError(code, message, null));
                });
              };
              this.forceReceiptReload = true;
              this.bridge.restore();
            });
          }
          presentCodeRedemptionSheet() {
            return new Promise((resolve) => {
              this.bridge.presentCodeRedemptionSheet(resolve);
            });
          }
        }
        AppleAppStore2.Adapter = Adapter;
        function appStoreError(code, message, productId) {
          return CdvPurchase2.storeError(code, message, CdvPurchase2.Platform.APPLE_APPSTORE, productId);
        }
      })(AppleAppStore = CdvPurchase2.AppleAppStore || (CdvPurchase2.AppleAppStore = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let AppleAppStore;
      (function(AppleAppStore2) {
        let Bridge;
        (function(Bridge_1) {
          const noop = (args) => {
          };
          let log = noop;
          function exec(methodName, options, success, error) {
            window.cordova.exec(success, error, "InAppPurchase", methodName, options);
          }
          ;
          function protectCall(callback, context, ...args) {
            if (!callback) {
              return;
            }
            try {
              callback.apply(this, args);
            } catch (err) {
              log("exception in " + context + ': "' + err + '"');
            }
          }
          ;
          class Bridge2 {
            constructor() {
              this.transactionsForProduct = {};
              this.initialized = false;
              this.registeredProducts = [];
              this.needRestoreNotification = false;
              this.pendingUpdates = [];
              this.onPurchased = false;
              this.onFailed = false;
              this.onRestored = false;
              window.storekit = this;
              this.options = {
                error: noop,
                ready: noop,
                purchased: noop,
                purchaseEnqueued: noop,
                purchasing: noop,
                purchaseFailed: noop,
                deferred: noop,
                finished: noop,
                restored: noop,
                receiptsRefreshed: noop,
                restoreFailed: noop,
                restoreCompleted: noop
              };
            }
            /**
             * Initialize the AppStore bridge.
             *
             * This calls the native "setup" method from the "InAppPurchase" Objective-C class.
             *
             * @param options Options for the bridge
             * @param success Called when the bridge is ready
             * @param error Called when the bridge failed to initialize
             */
            init(options, success, error) {
              this.options = {
                error: options.error || noop,
                ready: options.ready || noop,
                purchased: options.purchased || noop,
                purchaseEnqueued: options.purchaseEnqueued || noop,
                purchasing: options.purchasing || noop,
                purchaseFailed: options.purchaseFailed || noop,
                deferred: options.deferred || noop,
                finished: options.finished || noop,
                restored: options.restored || noop,
                receiptsRefreshed: options.receiptsRefreshed || noop,
                restoreFailed: options.restoreFailed || noop,
                restoreCompleted: options.restoreCompleted || noop
              };
              if (options.debug) {
                exec("debug", [], noop, noop);
                log = options.log || function(msg) {
                  console.log("[CdvPurchase.AppAppStore.Bridge] " + msg);
                };
              }
              if (options.autoFinish) {
                exec("autoFinish", [], noop, noop);
              }
              const setupOk = () => {
                log("setup ok");
                protectCall(this.options.ready, "options.ready");
                protectCall(success, "init.success");
                this.initialized = true;
                setTimeout(() => this.processPendingTransactions(), 50);
              };
              const setupFailed = (err) => {
                log("setup failed");
                protectCall(error, "init.error", CdvPurchase2.ErrorCode.SETUP, "Setup failed: " + err);
              };
              exec("setup", [], setupOk, setupFailed);
            }
            processPendingTransactions() {
              log("processing pending transactions");
              exec("processPendingTransactions", [], () => {
                this.finalizeTransactionUpdates();
              }, void 0);
            }
            /**
             * Makes an in-app purchase.
             *
             * @param {String} productId The product identifier. e.g. "com.example.MyApp.myproduct"
             * @param {int} quantity Quantity of product to purchase
             */
            purchase(productId, quantity, applicationUsername, discount, success, error) {
              quantity = quantity | 0 || 1;
              const options = this.options;
              if (this.registeredProducts.indexOf(productId) < 0) {
                const msg = "Purchasing " + productId + " failed.  Ensure the product was loaded first with Bridge.load(...)!";
                log(msg);
                if (typeof options.error === "function") {
                  protectCall(options.error, "options.error", CdvPurchase2.ErrorCode.PURCHASE, "Trying to purchase a unknown product.", { productId, quantity });
                }
                return;
              }
              const purchaseOk = () => {
                log("Purchase enqueued " + productId);
                if (typeof options.purchaseEnqueued === "function") {
                  protectCall(options.purchaseEnqueued, "options.purchaseEnqueued", productId, quantity);
                }
                protectCall(success, "purchase.success");
              };
              const purchaseFailed = () => {
                const errMsg = "Purchase failed: " + productId;
                log(errMsg);
                if (typeof options.error === "function") {
                  protectCall(options.error, "options.error", CdvPurchase2.ErrorCode.PURCHASE, errMsg, { productId, quantity });
                }
                protectCall(error, "purchase.error");
              };
              exec("purchase", [productId, quantity, applicationUsername, discount || {}], purchaseOk, purchaseFailed);
            }
            /**
             * Checks if device/user is allowed to make in-app purchases
             */
            canMakePayments(success, error) {
              return exec("canMakePayments", [], success, error);
            }
            /**
             * Asks the payment queue to restore previously completed purchases.
             *
             * The restored transactions are passed to the onRestored callback, so make sure you define a handler for that first.
             */
            restore(callback) {
              this.needRestoreNotification = true;
              exec("restoreCompletedTransactions", [], callback, callback);
            }
            manageSubscriptions(callback) {
              exec("manageSubscriptions", [], callback, callback);
            }
            manageBilling(callback) {
              exec("manageBilling", [], callback, callback);
            }
            presentCodeRedemptionSheet(callback) {
              exec("presentCodeRedemptionSheet", [], callback, callback);
            }
            /**
             * Retrieves localized product data, including price (as localized
             * string), name, description of multiple products.
             *
             * @param {Array} productIds
             *   An array of product identifier strings.
             *
             * @param {Function} callback
             *   Called once with the result of the products request. Signature:
             *
             *     function(validProducts, invalidProductIds)
             *
             *   where validProducts receives an array of objects of the form:
             *
             *     {
             *       id: "<productId>",
             *       title: "<localised title>",
             *       description: "<localised escription>",
             *       price: "<localised price>"
             *     }
             *
             *  and invalidProductIds receives an array of product identifier
             *  strings which were rejected by the app store.
             */
            load(productIds, success, error) {
              const options = this.options;
              if (typeof productIds === "string") {
                productIds = [productIds];
              }
              if (!productIds) {
                protectCall(success, "load.success", [], []);
              } else if (!productIds.length) {
                protectCall(success, "load.success", [], []);
              } else {
                if (typeof productIds[0] !== "string") {
                  const msg = "invalid productIds given to store.load: " + JSON.stringify(productIds);
                  log(msg);
                  protectCall(options.error, "options.error", CdvPurchase2.ErrorCode.LOAD, msg);
                  protectCall(error, "load.error", CdvPurchase2.ErrorCode.LOAD, msg);
                  return;
                }
                log("load " + JSON.stringify(productIds));
                const loadOk = (array) => {
                  const valid = array[0];
                  const invalid = array[1];
                  log("load ok: { valid:" + JSON.stringify(valid) + " invalid:" + JSON.stringify(invalid) + " }");
                  protectCall(success, "load.success", valid, invalid);
                };
                const loadFailed = (errMessage) => {
                  log("load failed");
                  log(errMessage);
                  const message = "Load failed: " + errMessage;
                  protectCall(options.error, "options.error", CdvPurchase2.ErrorCode.LOAD, message);
                  protectCall(error, "load.error", CdvPurchase2.ErrorCode.LOAD, message);
                };
                this.registeredProducts = this.registeredProducts.concat(productIds);
                exec("load", [productIds], loadOk, loadFailed);
              }
            }
            /*
             * Finish an unfinished transaction.
             *
             * @param {String} transactionId
             *    Identifier of the transaction to finish.
             *
             * You have to call this method manually except when using the autoFinish option.
             */
            finish(transactionId, success, error) {
              exec("finishTransaction", [transactionId], success, error);
            }
            finalizeTransactionUpdates() {
              for (let i = 0; i < this.pendingUpdates.length; ++i) {
                const args = this.pendingUpdates[i];
                this.transactionUpdated(args.state, args.errorCode, args.errorText, args.transactionIdentifier, args.productId, args.transactionReceipt, args.originalTransactionIdentifier, args.transactionDate, args.discountId);
              }
              this.pendingUpdates = [];
            }
            lastTransactionUpdated() {
            }
            // This is called from native.
            //
            // Note that it may eventually be called before initialization... unfortunately.
            // In this case, we'll just keep pending updates in a list for later processing.
            transactionUpdated(state, errorCode, errorText, transactionIdentifier, productId, transactionReceipt, originalTransactionIdentifier, transactionDate, discountId) {
              if (!this.initialized) {
                this.pendingUpdates.push({ state, errorCode, errorText, transactionIdentifier, productId, transactionReceipt, originalTransactionIdentifier, transactionDate, discountId });
                return;
              }
              log("transaction updated:" + transactionIdentifier + " state:" + state + " product:" + productId);
              if (productId && transactionIdentifier) {
                if (this.transactionsForProduct[productId]) {
                  this.transactionsForProduct[productId].push(transactionIdentifier);
                } else {
                  this.transactionsForProduct[productId] = [transactionIdentifier];
                }
              }
              switch (state) {
                case "PaymentTransactionStatePurchasing":
                  protectCall(this.options.purchasing, "options.purchasing", productId);
                  return;
                case "PaymentTransactionStatePurchased":
                  protectCall(this.options.purchased, "options.purchase", transactionIdentifier, productId, originalTransactionIdentifier, transactionDate, discountId);
                  return;
                case "PaymentTransactionStateDeferred":
                  protectCall(this.options.deferred, "options.deferred", productId);
                  return;
                case "PaymentTransactionStateFailed":
                  protectCall(this.options.purchaseFailed, "options.purchaseFailed", productId, errorCode || CdvPurchase2.ErrorCode.UNKNOWN, errorText || "ERROR");
                  protectCall(this.options.error, "options.error", errorCode || CdvPurchase2.ErrorCode.UNKNOWN, errorText || "ERROR", { productId });
                  return;
                case "PaymentTransactionStateRestored":
                  protectCall(this.options.restored, "options.restore", transactionIdentifier, productId);
                  return;
                case "PaymentTransactionStateFinished":
                  protectCall(this.options.finished, "options.finish", transactionIdentifier, productId);
                  return;
              }
            }
            restoreCompletedTransactionsFinished() {
              if (!this.needRestoreNotification)
                return;
              this.needRestoreNotification = false;
              protectCall(this.options.restoreCompleted, "options.restoreCompleted");
            }
            restoreCompletedTransactionsFailed(errorCode) {
              if (!this.needRestoreNotification)
                return;
              this.needRestoreNotification = false;
              protectCall(this.options.restoreFailed, "options.restoreFailed", errorCode);
            }
            parseReceiptArgs(args) {
              const base64 = args[0];
              const bundleIdentifier = args[1];
              const bundleShortVersion = args[2];
              const bundleNumericVersion = args[3];
              const bundleSignature = args[4];
              log("infoPlist: " + bundleIdentifier + "," + bundleShortVersion + "," + bundleNumericVersion + "," + bundleSignature);
              return {
                appStoreReceipt: base64,
                bundleIdentifier,
                bundleShortVersion,
                bundleNumericVersion,
                bundleSignature
              };
            }
            refreshReceipts(successCb, errorCb) {
              const loaded = (args) => {
                const data = this.parseReceiptArgs(args);
                this.appStoreReceipt = data;
                protectCall(this.options.receiptsRefreshed, "options.receiptsRefreshed", data);
                protectCall(successCb, "refreshReceipts.success", data);
              };
              const error = (errMessage) => {
                log("refresh receipt failed: " + errMessage);
                if (errMessage.includes("(@AMSErrorDomain:100)")) {
                  log('authentication failed, indicated by the string "(@AMSErrorDomain:100)"');
                }
                protectCall(this.options.error, "options.error", CdvPurchase2.ErrorCode.REFRESH_RECEIPTS, "Failed to refresh receipt: " + errMessage);
                protectCall(errorCb, "refreshReceipts.error", CdvPurchase2.ErrorCode.REFRESH_RECEIPTS, "Failed to refresh receipt: " + errMessage);
              };
              this.appStoreReceipt = null;
              log("refreshing appStoreReceipt");
              exec("appStoreRefreshReceipt", [], loaded, error);
            }
            loadReceipts(callback, errorCb) {
              const loaded = (args) => {
                const data = this.parseReceiptArgs(args);
                this.appStoreReceipt = data;
                protectCall(callback, "loadReceipts.callback", data);
              };
              const error = (errMessage) => {
              };
              log("loading appStoreReceipt");
              exec("appStoreReceipt", [], loaded, error);
            }
          }
          Bridge_1.Bridge = Bridge2;
        })(Bridge = AppleAppStore2.Bridge || (AppleAppStore2.Bridge = {}));
      })(AppleAppStore = CdvPurchase2.AppleAppStore || (CdvPurchase2.AppleAppStore = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let AppleAppStore;
      (function(AppleAppStore2) {
        let Internal;
        (function(Internal2) {
          class DiscountEligibilities {
            constructor(request, response) {
              this.request = request;
              this.response = response;
            }
            isEligible(productId, discountType, discountId) {
              var _a;
              for (let i = 0; i < this.request.length; ++i) {
                const req = this.request[i];
                if (req.productId === productId && req.discountId === discountId && req.discountType === discountType) {
                  return (_a = this.response[i]) !== null && _a !== void 0 ? _a : false;
                }
              }
              return true;
            }
          }
          Internal2.DiscountEligibilities = DiscountEligibilities;
        })(Internal = AppleAppStore2.Internal || (AppleAppStore2.Internal = {}));
      })(AppleAppStore = CdvPurchase2.AppleAppStore || (CdvPurchase2.AppleAppStore = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let AppleAppStore;
      (function(AppleAppStore2) {
        AppleAppStore2.DEFAULT_OFFER_ID = "$";
        class SKOffer extends CdvPurchase2.Offer {
          constructor(options, decorator) {
            super(options, decorator);
            this.offerType = options.offerType;
          }
        }
        AppleAppStore2.SKOffer = SKOffer;
        class SKProduct extends CdvPurchase2.Product {
          constructor(validProduct, p, decorator, eligibilities) {
            super(p, decorator);
            this.raw = validProduct;
            this.refresh(validProduct, decorator, eligibilities);
          }
          removeIneligibleDiscounts(eligibilities) {
            this.offers = this.offers.filter((offer) => {
              const skOffer = offer;
              if (skOffer.offerType === "Default")
                return true;
              return eligibilities.isEligible(this.id, skOffer.offerType, offer.id);
            });
          }
          refresh(valid, decorator, eligibilities) {
            var _a;
            this.raw = valid;
            this.title = valid.title;
            this.description = valid.description;
            this.countryCode = valid.countryCode;
            if (valid.group)
              this.group = valid.group;
            this.removeIneligibleDiscounts(eligibilities);
            const finalPhase = {
              price: valid.price,
              priceMicros: valid.priceMicros,
              currency: valid.currency,
              billingPeriod: formatBillingPeriod(valid.billingPeriod, valid.billingPeriodUnit),
              paymentMode: this.type === CdvPurchase2.ProductType.PAID_SUBSCRIPTION ? CdvPurchase2.PaymentMode.PAY_AS_YOU_GO : CdvPurchase2.PaymentMode.UP_FRONT,
              recurrenceMode: this.type === CdvPurchase2.ProductType.PAID_SUBSCRIPTION ? CdvPurchase2.RecurrenceMode.INFINITE_RECURRING : CdvPurchase2.RecurrenceMode.NON_RECURRING
            };
            (_a = valid.discounts) === null || _a === void 0 ? void 0 : _a.forEach((discount) => {
              if (eligibilities.isEligible(valid.id, discount.type, discount.id)) {
                const pricingPhases = [];
                const numCycles = discount.paymentMode === CdvPurchase2.PaymentMode.PAY_AS_YOU_GO ? discount.period : 1;
                const numPeriods = discount.paymentMode === CdvPurchase2.PaymentMode.PAY_AS_YOU_GO ? 1 : discount.period;
                const discountPhase = {
                  price: discount.price,
                  priceMicros: discount.priceMicros,
                  currency: valid.currency,
                  billingPeriod: formatBillingPeriod(numPeriods, discount.periodUnit),
                  billingCycles: numCycles,
                  paymentMode: discount.paymentMode,
                  recurrenceMode: CdvPurchase2.RecurrenceMode.FINITE_RECURRING
                };
                pricingPhases.push(discountPhase);
                pricingPhases.push(finalPhase);
                this.addOffer(new SKOffer({ id: discount.id, product: this, pricingPhases, offerType: discount.type }, decorator));
              }
            });
            if (!hasIntroductoryOffer(this)) {
              const defaultPhases = [];
              if (valid.introPrice && valid.introPriceMicros !== void 0 && eligibilities.isEligible(valid.id, "Introductory", "intro")) {
                const introPrice = {
                  price: valid.introPrice,
                  priceMicros: valid.introPriceMicros,
                  currency: valid.currency,
                  billingPeriod: formatBillingPeriod(valid.introPricePeriod, valid.introPricePeriodUnit),
                  paymentMode: valid.introPricePaymentMode,
                  recurrenceMode: CdvPurchase2.RecurrenceMode.FINITE_RECURRING,
                  billingCycles: 1
                };
                defaultPhases.push(introPrice);
              }
              defaultPhases.push(finalPhase);
              this.addOffer(new SKOffer({
                id: AppleAppStore2.DEFAULT_OFFER_ID,
                product: this,
                pricingPhases: defaultPhases,
                offerType: "Default"
              }, decorator));
            }
            function hasIntroductoryOffer(product) {
              return product.offers.filter((offer) => {
                const skOffer = offer;
                return skOffer.offerType === "Introductory" || skOffer.offerType === "Default" && skOffer.pricingPhases.length > 1;
              }).length > 0;
            }
            function formatBillingPeriod(numPeriods, period) {
              if (numPeriods && period)
                return `P${numPeriods}${period[0]}`;
              else
                return void 0;
            }
          }
        }
        AppleAppStore2.SKProduct = SKProduct;
      })(AppleAppStore = CdvPurchase2.AppleAppStore || (CdvPurchase2.AppleAppStore = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let AppleAppStore;
      (function(AppleAppStore2) {
        AppleAppStore2.APPLICATION_VIRTUAL_TRANSACTION_ID = "appstore.application";
        class SKApplicationReceipt extends CdvPurchase2.Receipt {
          constructor(applicationReceipt, needApplicationReceipt, decorator) {
            super(CdvPurchase2.Platform.APPLE_APPSTORE, decorator);
            this.nativeData = applicationReceipt;
            this.refresh(this.nativeData, needApplicationReceipt, decorator);
          }
          refresh(nativeData, needApplicationReceipt, decorator) {
            this.nativeData = nativeData;
            if (needApplicationReceipt) {
              const existing = this.transactions.find((t2) => t2.transactionId === AppleAppStore2.APPLICATION_VIRTUAL_TRANSACTION_ID);
              if (existing) {
                return;
              }
              const t = new CdvPurchase2.Transaction(CdvPurchase2.Platform.APPLE_APPSTORE, this, decorator);
              t.transactionId = AppleAppStore2.APPLICATION_VIRTUAL_TRANSACTION_ID;
              t.state = CdvPurchase2.TransactionState.APPROVED;
              t.products.push({
                id: nativeData.bundleIdentifier
              });
              this.transactions.push(t);
            }
          }
        }
        AppleAppStore2.SKApplicationReceipt = SKApplicationReceipt;
        class SKTransaction extends CdvPurchase2.Transaction {
          refresh(productId, originalTransactionIdentifier, transactionDate, discountId) {
            if (productId)
              this.products = [{ id: productId, offerId: discountId }];
            if (originalTransactionIdentifier)
              this.originalTransactionId = originalTransactionIdentifier;
            if (transactionDate)
              this.purchaseDate = /* @__PURE__ */ new Date(+transactionDate);
          }
        }
        AppleAppStore2.SKTransaction = SKTransaction;
      })(AppleAppStore = CdvPurchase2.AppleAppStore || (CdvPurchase2.AppleAppStore = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let AppleAppStore;
      (function(AppleAppStore2) {
        let VerifyReceipt;
        (function(VerifyReceipt2) {
          let AppleExpirationIntent;
          (function(AppleExpirationIntent2) {
            AppleExpirationIntent2["CANCELED"] = "1";
            AppleExpirationIntent2["BILLING_ERROR"] = "2";
            AppleExpirationIntent2["PRICE_INCREASE"] = "3";
            AppleExpirationIntent2["PRODUCT_NOT_AVAILABLE"] = "4";
            AppleExpirationIntent2["UNKNOWN"] = "5";
          })(AppleExpirationIntent = VerifyReceipt2.AppleExpirationIntent || (VerifyReceipt2.AppleExpirationIntent = {}));
        })(VerifyReceipt = AppleAppStore2.VerifyReceipt || (AppleAppStore2.VerifyReceipt = {}));
      })(AppleAppStore = CdvPurchase2.AppleAppStore || (CdvPurchase2.AppleAppStore = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Braintree;
      (function(Braintree2) {
        class BraintreeReceipt extends CdvPurchase2.Receipt {
          constructor(paymentRequest, dropInResult, decorator) {
            var _a, _b, _c;
            super(CdvPurchase2.Platform.BRAINTREE, decorator);
            const transaction = new CdvPurchase2.Transaction(CdvPurchase2.Platform.BRAINTREE, this, decorator);
            transaction.purchaseDate = /* @__PURE__ */ new Date();
            transaction.products = ((_a = paymentRequest.items) === null || _a === void 0 ? void 0 : _a.filter((p) => p).map((product) => ({ id: (product === null || product === void 0 ? void 0 : product.id) || "" }))) || [];
            transaction.state = CdvPurchase2.TransactionState.APPROVED;
            transaction.transactionId = (_c = (_b = dropInResult.paymentMethodNonce) === null || _b === void 0 ? void 0 : _b.nonce) !== null && _c !== void 0 ? _c : `UNKNOWN_${dropInResult.paymentMethodType}_${dropInResult.paymentDescription}`;
            this.transactions = [transaction];
            this.dropInResult = dropInResult;
            this.paymentRequest = paymentRequest;
            this.refresh(paymentRequest, dropInResult, decorator);
          }
          refresh(paymentRequest, dropInResult, decorator) {
            var _a, _b;
            this.dropInResult = dropInResult;
            this.paymentRequest = paymentRequest;
            const transaction = new CdvPurchase2.Transaction(CdvPurchase2.Platform.BRAINTREE, this, decorator);
            transaction.products = paymentRequest.items.filter((p) => p).map((product) => ({ id: (product === null || product === void 0 ? void 0 : product.id) || "" }));
            transaction.state = CdvPurchase2.TransactionState.APPROVED;
            transaction.transactionId = (_b = (_a = dropInResult.paymentMethodNonce) === null || _a === void 0 ? void 0 : _a.nonce) !== null && _b !== void 0 ? _b : `UNKNOWN_${dropInResult.paymentMethodType}_${dropInResult.paymentDescription}`;
            transaction.amountMicros = paymentRequest.amountMicros;
            transaction.currency = paymentRequest.currency;
            this.transactions = [transaction];
          }
        }
        Braintree2.BraintreeReceipt = BraintreeReceipt;
        class Adapter {
          constructor(context, options) {
            this.id = CdvPurchase2.Platform.BRAINTREE;
            this.name = "BrainTree";
            this.ready = false;
            this.products = [];
            this._receipts = [];
            this.supportsParallelLoading = false;
            this.context = context;
            this.log = context.log.child("Braintree");
            this.options = options;
          }
          get receipts() {
            return this._receipts;
          }
          get isSupported() {
            return Braintree2.IosBridge.Bridge.isSupported() || Braintree2.AndroidBridge.Bridge.isSupported();
          }
          /**
           * Initialize the Braintree Adapter.
           */
          initialize() {
            return new Promise((resolve) => {
              this.log.info("initialize()");
              if (Braintree2.IosBridge.Bridge.isSupported()) {
                this.log.info("instantiating ios bridge...");
                this.iosBridge = new Braintree2.IosBridge.Bridge(this.log, (callback) => {
                  if (this.options.tokenizationKey)
                    callback(this.options.tokenizationKey);
                  else if (this.options.clientTokenProvider)
                    this.options.clientTokenProvider(callback);
                  else
                    callback(braintreeError(CdvPurchase2.ErrorCode.CLIENT_INVALID, "Braintree iOS Bridge requires a clientTokenProvider or tokenizationKey"));
                }, this.options.applePay);
                this.iosBridge.initialize(this.context, resolve);
              } else if (Braintree2.AndroidBridge.Bridge.isSupported() && !this.androidBridge) {
                this.log.info("instantiating android bridge...");
                this.androidBridge = new Braintree2.AndroidBridge.Bridge(this.log);
                this.log.info("calling android bridge -> initialize...");
                const auth = this.options.tokenizationKey ? this.options.tokenizationKey : this.options.clientTokenProvider ? this.options.clientTokenProvider : "";
                this.androidBridge.initialize(auth, resolve);
              } else {
                this.log.info("platform not supported...");
                resolve(void 0);
              }
              this.context.listener.receiptsReady(CdvPurchase2.Platform.BRAINTREE);
            });
          }
          loadProducts(products) {
            return __awaiter(this, void 0, void 0, function* () {
              return products.map((p) => braintreeError(CdvPurchase2.ErrorCode.PRODUCT_NOT_AVAILABLE, "N/A"));
            });
          }
          loadReceipts() {
            return __awaiter(this, void 0, void 0, function* () {
              this.context.listener.receiptsReady(CdvPurchase2.Platform.BRAINTREE);
              return [];
            });
          }
          order(offer) {
            return __awaiter(this, void 0, void 0, function* () {
              return braintreeError(CdvPurchase2.ErrorCode.UNKNOWN, "N/A: Not implemented with Braintree");
            });
          }
          finish(transaction) {
            return __awaiter(this, void 0, void 0, function* () {
              transaction.state = CdvPurchase2.TransactionState.FINISHED;
              this.context.listener.receiptsUpdated(CdvPurchase2.Platform.TEST, [transaction.parentReceipt]);
              return;
            });
          }
          manageSubscriptions() {
            return __awaiter(this, void 0, void 0, function* () {
              this.log.info("N/A: manageSubscriptions() is not available with Braintree");
              return;
            });
          }
          manageBilling() {
            return __awaiter(this, void 0, void 0, function* () {
              this.log.info("N/A: manageBilling() is not available with Braintree");
              return;
            });
          }
          // async getNonce(paymentMethod: PaymentMethod): Promise<Nonce | IError> {
          //     return new Promise(resolve => {
          //         if (this.options.nonceProvider) {
          //             this.options.nonceProvider(paymentMethod, resolve);
          //         }
          //         else {
          //             resolve({
          //                 code: ErrorCode.UNAUTHORIZED_REQUEST_DATA,
          //                 message: 'Braintree requires a nonceProvider',
          //             });
          //         }
          //     });
          // }
          launchDropIn(paymentRequest, dropInRequest) {
            return __awaiter(this, void 0, void 0, function* () {
              if (this.androidBridge)
                return this.androidBridge.launchDropIn(dropInRequest);
              if (this.iosBridge)
                return this.iosBridge.launchDropIn(paymentRequest, dropInRequest);
              return braintreeError(CdvPurchase2.ErrorCode.PURCHASE, "Braintree is not available");
            });
          }
          requestPayment(paymentRequest, additionalData) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return __awaiter(this, void 0, void 0, function* () {
              this.log.info("requestPayment()" + JSON.stringify(paymentRequest));
              const dropInRequest = ((_a = additionalData === null || additionalData === void 0 ? void 0 : additionalData.braintree) === null || _a === void 0 ? void 0 : _a.dropInRequest) || {};
              if (!(yield Braintree2.IosBridge.ApplePayPlugin.isSupported(this.log))) {
                this.log.info("Apple Pay is not supported.");
                dropInRequest.applePayDisabled = true;
              }
              if (this.options.googlePay || dropInRequest.googlePayRequest) {
                const googlePay = Object.assign(Object.assign({}, (_b = this.options.googlePay) !== null && _b !== void 0 ? _b : {}), (_c = dropInRequest.googlePayRequest) !== null && _c !== void 0 ? _c : {});
                if (!googlePay.transactionInfo) {
                  googlePay.transactionInfo = {
                    currencyCode: (_d = paymentRequest.currency) !== null && _d !== void 0 ? _d : "",
                    totalPrice: ((_e = paymentRequest.amountMicros) !== null && _e !== void 0 ? _e : 0) / 1e6,
                    totalPriceStatus: Braintree2.GooglePay.TotalPriceStatus.FINAL
                  };
                }
                dropInRequest.googlePayRequest = googlePay;
              }
              if (this.options.threeDSecure || dropInRequest.threeDSecureRequest) {
                const threeDS = Object.assign(Object.assign({}, (_f = this.options.threeDSecure) !== null && _f !== void 0 ? _f : {}), (_g = dropInRequest.threeDSecureRequest) !== null && _g !== void 0 ? _g : {});
                if (!threeDS.amount) {
                  threeDS.amount = asDecimalString((_h = paymentRequest.amountMicros) !== null && _h !== void 0 ? _h : 0);
                }
                if (!threeDS.billingAddress && paymentRequest.billingAddress) {
                  threeDS.billingAddress = {
                    givenName: paymentRequest.billingAddress.givenName,
                    surname: paymentRequest.billingAddress.surname,
                    countryCodeAlpha2: paymentRequest.billingAddress.countryCode,
                    postalCode: paymentRequest.billingAddress.postalCode,
                    locality: paymentRequest.billingAddress.locality,
                    streetAddress: paymentRequest.billingAddress.streetAddress1,
                    extendedAddress: paymentRequest.billingAddress.streetAddress2,
                    line3: paymentRequest.billingAddress.streetAddress3,
                    phoneNumber: paymentRequest.billingAddress.phoneNumber,
                    region: paymentRequest.billingAddress.region
                  };
                }
                if (!threeDS.email) {
                  threeDS.email = paymentRequest.email;
                }
                dropInRequest.threeDSecureRequest = threeDS;
              }
              const response = yield this.launchDropIn(paymentRequest, dropInRequest);
              if (!dropInResponseIsOK(response))
                return dropInResponseError(this.log, response);
              const dropInResult = response;
              this.log.info("launchDropIn success: " + JSON.stringify({ paymentRequest, dropInResult }));
              if (!((_j = dropInResult.paymentMethodNonce) === null || _j === void 0 ? void 0 : _j.nonce)) {
                return braintreeError(CdvPurchase2.ErrorCode.BAD_RESPONSE, "launchDropIn returned no paymentMethodNonce");
              }
              let receipt = this._receipts.find((r) => {
                var _a2, _b2;
                return ((_a2 = r.dropInResult.paymentMethodNonce) === null || _a2 === void 0 ? void 0 : _a2.nonce) === ((_b2 = dropInResult.paymentMethodNonce) === null || _b2 === void 0 ? void 0 : _b2.nonce);
              });
              if (receipt) {
                receipt.refresh(paymentRequest, dropInResult, this.context.apiDecorators);
              } else {
                receipt = new BraintreeReceipt(paymentRequest, dropInResult, this.context.apiDecorators);
                this.receipts.push(receipt);
              }
              this.context.listener.receiptsUpdated(CdvPurchase2.Platform.BRAINTREE, [receipt]);
              return receipt.transactions[0];
            });
          }
          receiptValidationBody(receipt) {
            var _a, _b, _c, _d, _e;
            return __awaiter(this, void 0, void 0, function* () {
              if (!isBraintreeReceipt(receipt)) {
                this.log.error("Unexpected error, expecting a BraintreeReceipt: " + JSON.stringify(receipt));
                return;
              }
              this.log.info("create receiptValidationBody for: " + JSON.stringify(receipt));
              return {
                id: (_c = (_b = (_a = receipt.paymentRequest.items) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : "unknown",
                type: CdvPurchase2.ProductType.CONSUMABLE,
                priceMicros: receipt.paymentRequest.amountMicros,
                currency: receipt.paymentRequest.currency,
                products: [],
                transaction: {
                  type: CdvPurchase2.Platform.BRAINTREE,
                  deviceData: receipt.dropInResult.deviceData,
                  id: "nonce",
                  paymentMethodNonce: (_e = (_d = receipt.dropInResult.paymentMethodNonce) === null || _d === void 0 ? void 0 : _d.nonce) !== null && _e !== void 0 ? _e : "",
                  paymentDescription: receipt.dropInResult.paymentDescription,
                  paymentMethodType: receipt.dropInResult.paymentMethodType
                }
              };
            });
          }
          /**
           * Handle a response from a receipt validation process.
           *
           * @param receipt The receipt being validated.
           * @param response The response payload from the receipt validation process.
           * @returns A promise that resolves when the response has been handled.
           */
          handleReceiptValidationResponse(receipt, response) {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
              this.log.info("receipt validation response: " + JSON.stringify(response));
              if ((response === null || response === void 0 ? void 0 : response.data) && "transaction" in response.data) {
                if (response.data.transaction.type === "braintree") {
                  const lCustomerId = (_a = response.data.transaction.data.transaction) === null || _a === void 0 ? void 0 : _a.customer.id;
                  if (lCustomerId && !Braintree2.customerId) {
                    this.log.info("customerId updated: " + lCustomerId);
                    Braintree2.customerId = lCustomerId;
                  }
                }
              }
            });
          }
          checkSupport(functionality) {
            return functionality === "requestPayment";
          }
          restorePurchases() {
            return __awaiter(this, void 0, void 0, function* () {
              return void 0;
            });
          }
        }
        Braintree2.Adapter = Adapter;
        function asDecimalString(amountMicros) {
          const amountCents = "" + amountMicros / 1e4;
          return (amountCents.slice(0, -2) || "0") + "." + (amountCents.slice(-2, -1) || "0") + (amountCents.slice(-1) || "0");
        }
        function isBraintreeReceipt(receipt) {
          return receipt.platform === CdvPurchase2.Platform.BRAINTREE;
        }
        const dropInResponseIsOK = (response) => {
          return !!response && !("code" in response && "message" in response);
        };
        const dropInResponseError = (log, response) => {
          if (!response) {
            log.warn("launchDropIn failed: no response");
            return braintreeError(CdvPurchase2.ErrorCode.BAD_RESPONSE, "Braintree failed to launch drop in");
          } else {
            if (response.code === CdvPurchase2.ErrorCode.PAYMENT_CANCELLED) {
              log.info("User cancelled the payment request");
              return void 0;
            }
            log.warn("launchDropIn failed: " + JSON.stringify(response));
            return response;
          }
        };
        function braintreeError(code, message) {
          return CdvPurchase2.storeError(code, message, CdvPurchase2.Platform.BRAINTREE, null);
        }
        Braintree2.braintreeError = braintreeError;
      })(Braintree = CdvPurchase2.Braintree || (CdvPurchase2.Braintree = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Braintree;
      (function(Braintree2) {
        const PLUGIN_ID = "BraintreePlugin";
        let AndroidBridge;
        (function(AndroidBridge2) {
          class Bridge {
            constructor(log) {
              this.log = log.child("AndroidBridge");
            }
            /** Receive asynchronous messages from the native side */
            listener(msg) {
              this.log.debug("listener: " + JSON.stringify(msg));
              if (!msg || !msg.type) {
                return;
              }
              if (msg.type === "getClientToken") {
                this.getClientToken();
              } else if (msg.type === "ready") {
              }
            }
            // Braintree reported an error
            // private onError(message: string) {
            //     this.log.warn("Braintree reported an error: " + message);
            //     // TODO - bubble that up to the client
            // }
            /*
             * Initialize the braintree client.
             *
             * @param clientTokenProvider Provide clientTokens to the SDK when it needs them.
             */
            initialize(clientTokenProvider, callback) {
              try {
                if (typeof clientTokenProvider === "string") {
                  const token = clientTokenProvider;
                  this.clientTokenProvider = (callback2) => {
                    callback2(token);
                  };
                } else {
                  this.clientTokenProvider = clientTokenProvider;
                }
                this.log.info("exec.setListener()");
                const listener = this.listener.bind(this);
                window.cordova.exec(listener, null, PLUGIN_ID, "setListener", []);
                callback(void 0);
              } catch (err) {
                this.log.warn("initialization failed: " + (err === null || err === void 0 ? void 0 : err.message));
                callback(Braintree2.braintreeError(CdvPurchase2.ErrorCode.SETUP, "Failed to initialize Braintree Android Bridge: " + (err === null || err === void 0 ? void 0 : err.message)));
              }
            }
            /**
             * Fetches a client token and sends it to the SDK.
             *
             * This method is called by the native side when the SDK requests a Client Token.
             */
            getClientToken() {
              this.log.info("getClientToken()");
              if (this.clientTokenProvider) {
                this.log.debug("clientTokenProvider set, calling.");
                this.clientTokenProvider((value) => {
                  if (typeof value === "string") {
                    window.cordova.exec(null, null, PLUGIN_ID, "onClientTokenSuccess", [value]);
                  } else {
                    window.cordova.exec(null, null, PLUGIN_ID, "onClientTokenFailure", [value.code, value.message]);
                  }
                });
              } else {
                this.log.debug("clientTokenProvider not set, retrying later...");
                setTimeout(() => this.getClientToken(), 1e3);
              }
            }
            /** Returns true on Android, the only platform supported by this Braintree bridge */
            static isSupported() {
              return CdvPurchase2.Utils.platformId() === "android";
            }
            isApplePaySupported() {
              return __awaiter(this, void 0, void 0, function* () {
                return false;
              });
            }
            launchDropIn(dropInRequest) {
              return new Promise((resolve) => {
                window.cordova.exec((result) => {
                  this.log.info("dropInSuccess: " + JSON.stringify(result));
                  resolve(result);
                }, (err) => {
                  this.log.info("dropInFailure: " + err);
                  const errCode = err.split("|")[0];
                  const errMessage = err.split("|").slice(1).join("");
                  if (errCode === "UserCanceledException") {
                    resolve(Braintree2.braintreeError(CdvPurchase2.ErrorCode.PAYMENT_CANCELLED, errMessage));
                  } else if (errCode === "AuthorizationException") {
                    resolve(Braintree2.braintreeError(CdvPurchase2.ErrorCode.UNAUTHORIZED_REQUEST_DATA, errMessage));
                  } else {
                    resolve(Braintree2.braintreeError(CdvPurchase2.ErrorCode.UNKNOWN, err));
                  }
                }, PLUGIN_ID, "launchDropIn", [dropInRequest]);
              });
            }
          }
          AndroidBridge2.Bridge = Bridge;
        })(AndroidBridge = Braintree2.AndroidBridge || (Braintree2.AndroidBridge = {}));
      })(Braintree = CdvPurchase2.Braintree || (CdvPurchase2.Braintree = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Braintree;
      (function(Braintree2) {
        let IosBridge;
        (function(IosBridge2) {
          const PLUGIN_ID = "BraintreeApplePayPlugin";
          class ApplePayPlugin {
            /**
             * Retrieve the plugin definition.
             *
             * Useful to check if it is installed.
             */
            static get() {
              return window.CdvPurchaseBraintreeApplePay;
            }
            /**
             * Initiate a payment with Apple Pay.
             */
            static requestPayment(request) {
              return new Promise((resolve) => {
                var _a;
                if (!((_a = ApplePayPlugin.get()) === null || _a === void 0 ? void 0 : _a.installed)) {
                  return resolve(Braintree2.braintreeError(CdvPurchase2.ErrorCode.SETUP, "cordova-plugin-purchase-braintree-applepay does not appear to be installed."));
                } else {
                  const success = (result) => {
                    resolve(result);
                  };
                  const failure = (err) => {
                    const message = err !== null && err !== void 0 ? err : "payment request failed";
                    resolve(Braintree2.braintreeError(CdvPurchase2.ErrorCode.PURCHASE, "Braintree+ApplePay ERROR: " + message));
                  };
                  window.cordova.exec(success, failure, PLUGIN_ID, "presentDropInPaymentUI", [request]);
                }
              });
            }
            /**
             * Returns true if the device supports Apple Pay.
             *
             * This does not necessarily mean the user has a card setup already.
             */
            static isSupported(log) {
              return new Promise((resolve) => {
                var _a;
                if (CdvPurchase2.Utils.platformId() !== "ios") {
                  log.info("BraintreeApplePayPlugin is only available for ios.");
                  return resolve(false);
                }
                if (!((_a = ApplePayPlugin.get()) === null || _a === void 0 ? void 0 : _a.installed)) {
                  log.info("BraintreeApplePayPlugin does not appear to be installed.");
                  return resolve(false);
                }
                try {
                  window.cordova.exec((result) => {
                    resolve(result);
                  }, () => {
                    log.info("BraintreeApplePayPlugin is not available.");
                    resolve(false);
                  }, PLUGIN_ID, "isApplePaySupported", []);
                } catch (err) {
                  log.info("BraintreeApplePayPlugin is not installed.");
                  resolve(false);
                }
              });
            }
          }
          IosBridge2.ApplePayPlugin = ApplePayPlugin;
        })(IosBridge = Braintree2.IosBridge || (Braintree2.IosBridge = {}));
      })(Braintree = CdvPurchase2.Braintree || (CdvPurchase2.Braintree = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Braintree;
      (function(Braintree2) {
        const PLUGIN_ID = "BraintreePlugin";
        let IosBridge;
        (function(IosBridge2) {
          class Bridge {
            constructor(log, clientTokenProvider, applePayOptions) {
              this.log = log.child("IosBridge");
              this.clientTokenProvider = clientTokenProvider;
              this.applePayOptions = applePayOptions;
            }
            initialize(verbosity, callback) {
              window.cordova.exec(null, null, "BraintreePlugin", "setVerbosity", [verbosity.verbosity]);
              window.cordova.exec((message) => this.log.debug("(Native) " + message), null, "BraintreePlugin", "setLogger", []);
              setTimeout(() => callback(void 0), 0);
            }
            continueDropInForApplePay(paymentRequest, DropInRequest, dropInResult) {
              var _a, _b, _c, _d, _e, _f, _g, _h, _j;
              return __awaiter(this, void 0, void 0, function* () {
                const request = ((_b = (_a = this.applePayOptions) === null || _a === void 0 ? void 0 : _a.preparePaymentRequest) === null || _b === void 0 ? void 0 : _b.call(_a, paymentRequest)) || {
                  merchantCapabilities: [CdvPurchase2.ApplePay.MerchantCapability.ThreeDS]
                };
                if (!request.paymentSummaryItems) {
                  const items = paymentRequest.items.filter((p) => p).map((product, index) => {
                    var _a2, _b2, _c2;
                    return {
                      type: "final",
                      label: (product === null || product === void 0 ? void 0 : product.title) || (product === null || product === void 0 ? void 0 : product.id) || `Item #${index + 1}`,
                      amount: `${Math.round(((_c2 = (_b2 = (_a2 = product === null || product === void 0 ? void 0 : product.pricing) === null || _a2 === void 0 ? void 0 : _a2.priceMicros) !== null && _b2 !== void 0 ? _b2 : paymentRequest.amountMicros) !== null && _c2 !== void 0 ? _c2 : 0) / 1e4) / 100}`
                    };
                  });
                  const total = {
                    type: "final",
                    label: (_d = (_c = this.applePayOptions) === null || _c === void 0 ? void 0 : _c.companyName) !== null && _d !== void 0 ? _d : "Total",
                    amount: `${Math.round(((_e = paymentRequest.amountMicros) !== null && _e !== void 0 ? _e : 0) / 1e4) / 100}`
                  };
                  request.paymentSummaryItems = [...items, total];
                }
                const result = yield IosBridge2.ApplePayPlugin.requestPayment(request);
                this.log.info("Result from Apple Pay: " + JSON.stringify(result));
                if ("isError" in result)
                  return result;
                if (result.userCancelled) {
                  return Braintree2.braintreeError(CdvPurchase2.ErrorCode.PAYMENT_CANCELLED, "User cancelled the payment request");
                }
                return {
                  paymentMethodNonce: {
                    isDefault: false,
                    nonce: (_g = (_f = result.applePayCardNonce) === null || _f === void 0 ? void 0 : _f.nonce) !== null && _g !== void 0 ? _g : "",
                    type: (_j = (_h = result.applePayCardNonce) === null || _h === void 0 ? void 0 : _h.type) !== null && _j !== void 0 ? _j : ""
                  },
                  paymentMethodType: dropInResult.paymentMethodType,
                  deviceData: dropInResult.deviceData,
                  paymentDescription: dropInResult.paymentDescription
                };
              });
            }
            launchDropIn(paymentRequest, dropInRequest) {
              return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                const onSuccess = (result) => {
                  this.log.info("dropInSuccess: " + JSON.stringify(result));
                  if (result.paymentMethodType === Braintree2.DropIn.PaymentMethod.APPLE_PAY) {
                    this.log.info("it's an ApplePay request, we have to process it.");
                    this.continueDropInForApplePay(paymentRequest, dropInRequest, result).then(resolve);
                  } else {
                    resolve(result);
                  }
                };
                const onError = (errorString) => {
                  this.log.info("dropInFailure: " + errorString);
                  const [errCode, errMessage] = errorString.split("|");
                  if (errCode === "UserCanceledException") {
                    resolve(Braintree2.braintreeError(CdvPurchase2.ErrorCode.PAYMENT_CANCELLED, errMessage));
                  } else {
                    resolve(Braintree2.braintreeError(CdvPurchase2.ErrorCode.UNKNOWN, "ERROR " + errCode + ": " + errMessage));
                  }
                };
                this.clientTokenProvider((clientToken) => {
                  if (typeof clientToken === "string")
                    window.cordova.exec(onSuccess, onError, "BraintreePlugin", "launchDropIn", [clientToken, dropInRequest]);
                  else
                    resolve(clientToken);
                });
              }));
            }
            braintreePlugin() {
              return window.CdvPurchaseBraintree;
            }
            static isSupported() {
              return CdvPurchase2.Utils.platformId() === "ios";
            }
          }
          IosBridge2.Bridge = Bridge;
        })(IosBridge = Braintree2.IosBridge || (Braintree2.IosBridge = {}));
      })(Braintree = CdvPurchase2.Braintree || (CdvPurchase2.Braintree = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Braintree;
      (function(Braintree2) {
        let DropIn;
        (function(DropIn2) {
          let CardFormFieldStatus;
          (function(CardFormFieldStatus2) {
            CardFormFieldStatus2[CardFormFieldStatus2["DISABLED"] = 0] = "DISABLED";
            CardFormFieldStatus2[CardFormFieldStatus2["OPTIONAL"] = 1] = "OPTIONAL";
            CardFormFieldStatus2[CardFormFieldStatus2["REQUIRED"] = 2] = "REQUIRED";
          })(CardFormFieldStatus = DropIn2.CardFormFieldStatus || (DropIn2.CardFormFieldStatus = {}));
        })(DropIn = Braintree2.DropIn || (Braintree2.DropIn = {}));
      })(Braintree = CdvPurchase2.Braintree || (CdvPurchase2.Braintree = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Braintree;
      (function(Braintree2) {
        let DropIn;
        (function(DropIn2) {
          let PaymentMethod;
          (function(PaymentMethod2) {
            PaymentMethod2["GOOGLE_PAY"] = "GOOGLE_PAY";
            PaymentMethod2["LASER"] = "LASER";
            PaymentMethod2["UK_MAESTRO"] = "UK_MAESTRO";
            PaymentMethod2["SWITCH"] = "SWITCH";
            PaymentMethod2["SOLOR"] = "SOLO";
            PaymentMethod2["APPLE_PAY"] = "APPLE_PAY";
            PaymentMethod2["AMEX"] = "AMEX";
            PaymentMethod2["DINERS_CLUB"] = "DINERS_CLUB";
            PaymentMethod2["DISCOVER"] = "DISCOVER";
            PaymentMethod2["JCB"] = "JCB";
            PaymentMethod2["MAESTRO"] = "MAESTRO";
            PaymentMethod2["MASTERCARD"] = "MASTERCARD";
            PaymentMethod2["PAYPAL"] = "PAYPAL";
            PaymentMethod2["VISA"] = "VISA";
            PaymentMethod2["VENMO"] = "VENMO";
            PaymentMethod2["UNIONPAY"] = "UNIONPAY";
            PaymentMethod2["HIPER"] = "HIPER";
            PaymentMethod2["HIPERCARD"] = "HIPERCARD";
            PaymentMethod2["UNKNOWN"] = "UNKNOWN";
          })(PaymentMethod = DropIn2.PaymentMethod || (DropIn2.PaymentMethod = {}));
        })(DropIn = Braintree2.DropIn || (Braintree2.DropIn = {}));
      })(Braintree = CdvPurchase2.Braintree || (CdvPurchase2.Braintree = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Braintree;
      (function(Braintree2) {
        let GooglePay;
        (function(GooglePay2) {
          let BillingAddressFormat;
          (function(BillingAddressFormat2) {
            BillingAddressFormat2[BillingAddressFormat2["MIN"] = 0] = "MIN";
            BillingAddressFormat2[BillingAddressFormat2["FULL"] = 1] = "FULL";
          })(BillingAddressFormat = GooglePay2.BillingAddressFormat || (GooglePay2.BillingAddressFormat = {}));
          let TotalPriceStatus;
          (function(TotalPriceStatus2) {
            TotalPriceStatus2[TotalPriceStatus2["NOT_CURRENTLY_KNOWN"] = 1] = "NOT_CURRENTLY_KNOWN";
            TotalPriceStatus2[TotalPriceStatus2["ESTIMATED"] = 2] = "ESTIMATED";
            TotalPriceStatus2[TotalPriceStatus2["FINAL"] = 3] = "FINAL";
          })(TotalPriceStatus = GooglePay2.TotalPriceStatus || (GooglePay2.TotalPriceStatus = {}));
        })(GooglePay = Braintree2.GooglePay || (Braintree2.GooglePay = {}));
      })(Braintree = CdvPurchase2.Braintree || (CdvPurchase2.Braintree = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Braintree;
      (function(Braintree2) {
        let ThreeDSecure;
        (function(ThreeDSecure2) {
          let AccountType;
          (function(AccountType2) {
            AccountType2["UNSPECIFIED"] = "00";
            AccountType2["CREDIT"] = "01";
            AccountType2["DEBIT"] = "02";
          })(AccountType = ThreeDSecure2.AccountType || (ThreeDSecure2.AccountType = {}));
          let ShippingMethod;
          (function(ShippingMethod2) {
            ShippingMethod2[ShippingMethod2["UNSPECIFIED"] = 0] = "UNSPECIFIED";
            ShippingMethod2[ShippingMethod2["SAME_DAY"] = 1] = "SAME_DAY";
            ShippingMethod2[ShippingMethod2["EXPEDITED"] = 2] = "EXPEDITED";
            ShippingMethod2[ShippingMethod2["PRIORITY"] = 3] = "PRIORITY";
            ShippingMethod2[ShippingMethod2["GROUND"] = 4] = "GROUND";
            ShippingMethod2[ShippingMethod2["ELECTRONIC_DELIVERY"] = 5] = "ELECTRONIC_DELIVERY";
            ShippingMethod2[ShippingMethod2["SHIP_TO_STORE"] = 6] = "SHIP_TO_STORE";
          })(ShippingMethod = ThreeDSecure2.ShippingMethod || (ThreeDSecure2.ShippingMethod = {}));
          let Version;
          (function(Version2) {
            Version2[Version2["V1"] = 0] = "V1";
            Version2[Version2["V2"] = 1] = "V2";
          })(Version = ThreeDSecure2.Version || (ThreeDSecure2.Version = {}));
        })(ThreeDSecure = Braintree2.ThreeDSecure || (Braintree2.ThreeDSecure = {}));
      })(Braintree = CdvPurchase2.Braintree || (CdvPurchase2.Braintree = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let GooglePlay;
      (function(GooglePlay2) {
        class Transaction extends CdvPurchase2.Transaction {
          constructor(purchase, parentReceipt, decorator) {
            super(CdvPurchase2.Platform.GOOGLE_PLAY, parentReceipt, decorator);
            this.nativePurchase = purchase;
            this.refresh(purchase, true);
          }
          static toState(fromConstructor, state, isAcknowledged, isConsumed) {
            switch (state) {
              case GooglePlay2.Bridge.PurchaseState.PENDING:
                return CdvPurchase2.TransactionState.INITIATED;
              case GooglePlay2.Bridge.PurchaseState.PURCHASED:
                if (isConsumed)
                  return CdvPurchase2.TransactionState.FINISHED;
                else if (isAcknowledged)
                  return CdvPurchase2.TransactionState.APPROVED;
                else if (fromConstructor)
                  return CdvPurchase2.TransactionState.INITIATED;
                else
                  return CdvPurchase2.TransactionState.APPROVED;
              case GooglePlay2.Bridge.PurchaseState.UNSPECIFIED_STATE:
                return CdvPurchase2.TransactionState.UNKNOWN_STATE;
            }
          }
          /**
           * Refresh the value in the transaction based on the native purchase update
           */
          refresh(purchase, fromConstructor) {
            var _a, _b;
            this.nativePurchase = purchase;
            this.transactionId = `${purchase.orderId || purchase.purchaseToken}`;
            this.purchaseId = `${purchase.purchaseToken}`;
            this.products = purchase.productIds.map((productId) => ({ id: productId }));
            if (purchase.purchaseTime)
              this.purchaseDate = new Date(purchase.purchaseTime);
            this.isPending = purchase.getPurchaseState === GooglePlay2.Bridge.PurchaseState.PENDING;
            if (typeof purchase.acknowledged !== "undefined")
              this.isAcknowledged = purchase.acknowledged;
            if (typeof purchase.consumed !== "undefined")
              this.isConsumed = purchase.consumed;
            if (typeof purchase.autoRenewing !== "undefined")
              this.renewalIntent = purchase.autoRenewing ? CdvPurchase2.RenewalIntent.RENEW : CdvPurchase2.RenewalIntent.LAPSE;
            this.state = Transaction.toState(fromConstructor !== null && fromConstructor !== void 0 ? fromConstructor : false, purchase.getPurchaseState, (_a = this.isAcknowledged) !== null && _a !== void 0 ? _a : false, (_b = this.isConsumed) !== null && _b !== void 0 ? _b : false);
          }
        }
        GooglePlay2.Transaction = Transaction;
        class Receipt extends CdvPurchase2.Receipt {
          /** @internal */
          constructor(purchase, decorator) {
            super(CdvPurchase2.Platform.GOOGLE_PLAY, decorator);
            this.transactions = [new Transaction(purchase, this, decorator)];
            this.purchaseToken = purchase.purchaseToken;
            this.orderId = purchase.orderId;
          }
          /** Refresh the content of the purchase based on the native BridgePurchase */
          refreshPurchase(purchase) {
            var _a;
            (_a = this.transactions[0]) === null || _a === void 0 ? void 0 : _a.refresh(purchase);
            this.orderId = purchase.orderId;
          }
        }
        GooglePlay2.Receipt = Receipt;
        class Adapter {
          constructor(context, autoRefreshIntervalMillis = 1e3 * 3600 * 24) {
            this.id = CdvPurchase2.Platform.GOOGLE_PLAY;
            this.name = "GooglePlay";
            this.ready = false;
            this.supportsParallelLoading = false;
            this._receipts = [];
            this.bridge = new GooglePlay2.Bridge.Bridge();
            this.initialized = false;
            this.retry = new CdvPurchase2.Internal.Retry();
            this.autoRefreshIntervalMillis = 0;
            if (Adapter._instance)
              throw new Error("GooglePlay adapter already initialized");
            this._products = new GooglePlay2.Products(context.apiDecorators);
            this.autoRefreshIntervalMillis = autoRefreshIntervalMillis;
            this.context = context;
            this.log = context.log.child("GooglePlay");
            Adapter._instance = this;
          }
          /** List of products managed by the GooglePlay adapter */
          get products() {
            return this._products.products;
          }
          get receipts() {
            return this._receipts;
          }
          /** Returns true on Android, the only platform supported by this adapter */
          get isSupported() {
            return CdvPurchase2.Utils.platformId() === "android";
          }
          initialize() {
            return __awaiter(this, void 0, void 0, function* () {
              this.log.info("Initialize");
              if (this.initializationPromise)
                return this.initializationPromise;
              return this.initializationPromise = new Promise((resolve) => {
                const bridgeLogger = this.log.child("Bridge");
                const iabOptions = {
                  onSetPurchases: this.onSetPurchases.bind(this),
                  onPurchasesUpdated: this.onPurchasesUpdated.bind(this),
                  onPurchaseConsumed: this.onPurchaseConsumed.bind(this),
                  showLog: this.context.verbosity >= CdvPurchase2.LogLevel.DEBUG ? true : false,
                  log: (msg) => bridgeLogger.info(msg)
                };
                const iabReady = () => {
                  this.log.debug("Ready");
                  if (this.autoRefreshIntervalMillis > 0) {
                    window.setInterval(() => this.getPurchases(), this.autoRefreshIntervalMillis);
                  }
                  resolve(void 0);
                };
                const iabError = (err) => {
                  this.initialized = false;
                  this.context.error(playStoreError(CdvPurchase2.ErrorCode.SETUP, "Init failed - " + err, null));
                  this.retry.retry(() => this.initialize());
                };
                this.bridge.init(iabReady, iabError, iabOptions);
              });
            });
          }
          /** Prepare the list of SKUs sorted by type */
          getSkusOf(products) {
            const inAppSkus = [];
            const subsSkus = [];
            for (const product of products) {
              if (product.type === CdvPurchase2.ProductType.PAID_SUBSCRIPTION)
                subsSkus.push(product.id);
              else
                inAppSkus.push(product.id);
            }
            return { inAppSkus, subsSkus };
          }
          /** @inheritdoc */
          loadReceipts() {
            return new Promise((resolve) => {
              this.getPurchases().then((err) => {
                resolve(this._receipts);
              });
            });
          }
          /** @inheritDoc */
          loadProducts(products) {
            return new Promise((resolve) => {
              this.log.debug("Load: " + JSON.stringify(products));
              const iabLoaded = (validProducts) => {
                this.log.debug("Loaded: " + JSON.stringify(validProducts));
                if (!Array.isArray(validProducts)) {
                  const message = `Invalid product list received: ${JSON.stringify(validProducts)}, retrying later...`;
                  this.log.warn(message);
                  this.retry.retry(go);
                  this.context.error(playStoreError(CdvPurchase2.ErrorCode.LOAD, message, null));
                  return;
                }
                const ret = products.map((registeredProduct) => {
                  const validProduct = validProducts.find((vp) => vp.productId === registeredProduct.id);
                  if (validProduct && validProduct.productId) {
                    return this._products.addProduct(registeredProduct, validProduct);
                  } else {
                    return playStoreError(CdvPurchase2.ErrorCode.INVALID_PRODUCT_ID, `Product with id ${registeredProduct.id} not found.`, registeredProduct.id);
                  }
                });
                resolve(ret);
              };
              const go = () => {
                const { inAppSkus, subsSkus } = this.getSkusOf(products);
                this.log.debug("getAvailableProducts: " + JSON.stringify(inAppSkus) + " | " + JSON.stringify(subsSkus));
                this.bridge.getAvailableProducts(inAppSkus, subsSkus, iabLoaded, (err) => {
                  this.retry.retry(go);
                  this.context.error(playStoreError(CdvPurchase2.ErrorCode.LOAD, "Loading product info failed - " + err + " - retrying later...", null));
                });
              };
              go();
            });
          }
          /** @inheritDoc */
          finish(transaction) {
            return new Promise((resolve) => {
              const onSuccess = () => {
                if (transaction.state !== CdvPurchase2.TransactionState.FINISHED) {
                  transaction.state = CdvPurchase2.TransactionState.FINISHED;
                  this.context.listener.receiptsUpdated(CdvPurchase2.Platform.GOOGLE_PLAY, [transaction.parentReceipt]);
                }
                resolve(void 0);
              };
              const firstProduct = transaction.products[0];
              if (!firstProduct)
                return resolve(playStoreError(CdvPurchase2.ErrorCode.FINISH, "Cannot finish a transaction with no product", null));
              const product = this._products.getProduct(firstProduct.id);
              if (!product)
                return resolve(playStoreError(CdvPurchase2.ErrorCode.FINISH, "Cannot finish transaction, unknown product " + firstProduct.id, firstProduct.id));
              const receipt = this._receipts.find((r) => r.hasTransaction(transaction));
              if (!receipt)
                return resolve(playStoreError(CdvPurchase2.ErrorCode.FINISH, "Cannot finish transaction, linked receipt not found.", product.id));
              if (!receipt.purchaseToken)
                return resolve(playStoreError(CdvPurchase2.ErrorCode.FINISH, "Cannot finish transaction, linked receipt contains no purchaseToken.", product.id));
              const onFailure = (message, code) => resolve(playStoreError(code || CdvPurchase2.ErrorCode.UNKNOWN, message, product.id));
              if (product.type === CdvPurchase2.ProductType.NON_RENEWING_SUBSCRIPTION || product.type === CdvPurchase2.ProductType.CONSUMABLE) {
                if (!transaction.isConsumed)
                  return this.bridge.consumePurchase(onSuccess, onFailure, receipt.purchaseToken);
              } else {
                if (!transaction.isAcknowledged)
                  return this.bridge.acknowledgePurchase(onSuccess, onFailure, receipt.purchaseToken);
              }
              resolve(void 0);
            });
          }
          /** Called by the bridge when a purchase has been consumed */
          onPurchaseConsumed(purchase) {
            this.log.debug("onPurchaseConsumed: " + purchase.orderId);
            purchase.acknowledged = true;
            purchase.consumed = true;
            this.onPurchasesUpdated([purchase]);
          }
          /** Called when the platform reports update for some purchases */
          onPurchasesUpdated(purchases) {
            this.log.debug("onPurchaseUpdated: " + purchases.map((p) => p.orderId).join(", "));
            purchases.forEach((purchase) => {
              const existingReceipt = this.receipts.find((r) => r.purchaseToken === purchase.purchaseToken);
              if (existingReceipt) {
                existingReceipt.refreshPurchase(purchase);
                this.context.listener.receiptsUpdated(CdvPurchase2.Platform.GOOGLE_PLAY, [existingReceipt]);
              } else {
                const newReceipt = new Receipt(purchase, this.context.apiDecorators);
                this.receipts.push(newReceipt);
                this.context.listener.receiptsUpdated(CdvPurchase2.Platform.GOOGLE_PLAY, [newReceipt]);
                if (newReceipt.transactions[0].state === CdvPurchase2.TransactionState.INITIATED && !newReceipt.transactions[0].isPending) {
                  newReceipt.refreshPurchase(purchase);
                  this.context.listener.receiptsUpdated(CdvPurchase2.Platform.GOOGLE_PLAY, [newReceipt]);
                }
              }
            });
          }
          /** Called when the platform reports some purchases */
          onSetPurchases(purchases) {
            this.log.debug("onSetPurchases: " + JSON.stringify(purchases));
            this.onPurchasesUpdated(purchases);
            this.context.listener.receiptsReady(CdvPurchase2.Platform.GOOGLE_PLAY);
          }
          onPriceChangeConfirmationResult(result) {
          }
          /** Refresh purchases from GooglePlay */
          getPurchases() {
            return new Promise((resolve) => {
              this.log.debug("getPurchases");
              const success = () => {
                this.log.debug("getPurchases success");
                setTimeout(() => resolve(void 0), 0);
              };
              const failure = (message, code) => {
                this.log.warn("getPurchases failed: " + message + " (" + code + ")");
                setTimeout(() => resolve(playStoreError(code || CdvPurchase2.ErrorCode.UNKNOWN, message, null)), 0);
              };
              this.bridge.getPurchases(success, failure);
            });
          }
          /** @inheritDoc */
          order(offer, additionalData) {
            return __awaiter(this, void 0, void 0, function* () {
              return new Promise((resolve) => {
                this.log.info("Order - " + JSON.stringify(offer));
                const buySuccess = () => resolve(void 0);
                const buyFailed = (message, code) => {
                  this.log.warn("Order failed: " + JSON.stringify({ message, code }));
                  resolve(playStoreError(code !== null && code !== void 0 ? code : CdvPurchase2.ErrorCode.UNKNOWN, message, offer.productId));
                };
                if (offer.productType === CdvPurchase2.ProductType.PAID_SUBSCRIPTION) {
                  const idAndToken = "token" in offer ? offer.productId + "@" + offer.token : offer.productId;
                  const oldPurchaseToken = this.findOldPurchaseToken(offer.productId, offer.productGroup);
                  if (oldPurchaseToken) {
                    if (!additionalData.googlePlay)
                      additionalData.googlePlay = { oldPurchaseToken };
                    else if (!additionalData.googlePlay.oldPurchaseToken) {
                      additionalData.googlePlay.oldPurchaseToken = oldPurchaseToken;
                    }
                  }
                  this.bridge.subscribe(buySuccess, buyFailed, idAndToken, additionalData);
                } else {
                  this.bridge.buy(buySuccess, buyFailed, offer.productId, additionalData);
                }
              });
            });
          }
          /**
           * Find a purchaseToken for an owned product in the same group as the requested one.
           *
           * @param productId - The product identifier to request matching purchaseToken for.
           * @param productGroup - The group of the product to request matching purchaseToken for.
           *
           * @return A purchaseToken, undefined if none have been found.
           */
          findOldPurchaseToken(productId, productGroup) {
            if (!productGroup)
              return void 0;
            const oldReceipt = this._receipts.find((r) => {
              return !!r.transactions.find((t) => {
                return !!t.products.find((p) => {
                  const product = this._products.getProduct(p.id);
                  if (!product)
                    return false;
                  if (!CdvPurchase2.Internal.LocalReceipts.isOwned([r], product))
                    return false;
                  return p.id === productId || productGroup && product.group === productGroup;
                });
              });
            });
            return oldReceipt === null || oldReceipt === void 0 ? void 0 : oldReceipt.purchaseToken;
          }
          /**
           * Prepare for receipt validation
           */
          receiptValidationBody(receipt) {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
              const transaction = receipt.transactions[0];
              if (!transaction)
                return;
              const productId = (_a = transaction.products[0]) === null || _a === void 0 ? void 0 : _a.id;
              if (!productId)
                return;
              const product = this._products.getProduct(productId);
              if (!product)
                return;
              const purchase = transaction.nativePurchase;
              return {
                id: productId,
                type: product.type,
                offers: product.offers,
                products: this._products.products,
                transaction: {
                  type: CdvPurchase2.Platform.GOOGLE_PLAY,
                  id: receipt.transactions[0].transactionId,
                  purchaseToken: purchase.purchaseToken,
                  signature: purchase.signature,
                  receipt: purchase.receipt
                }
              };
            });
          }
          handleReceiptValidationResponse(receipt, response) {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
              if (response === null || response === void 0 ? void 0 : response.ok) {
                const transaction = (_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.transaction;
                if ((transaction === null || transaction === void 0 ? void 0 : transaction.type) !== CdvPurchase2.Platform.GOOGLE_PLAY)
                  return;
                switch (transaction.kind) {
                  case "androidpublisher#productPurchase":
                    break;
                  case "androidpublisher#subscriptionPurchase":
                    break;
                  case "androidpublisher#subscriptionPurchaseV2":
                    transaction;
                    break;
                  case "fovea#subscriptionGone":
                    break;
                }
              }
              return;
            });
          }
          requestPayment(payment, additionalData) {
            return __awaiter(this, void 0, void 0, function* () {
              return playStoreError(CdvPurchase2.ErrorCode.UNKNOWN, "requestPayment not supported", null);
            });
          }
          manageSubscriptions() {
            return __awaiter(this, void 0, void 0, function* () {
              this.bridge.manageSubscriptions();
              return;
            });
          }
          manageBilling() {
            return __awaiter(this, void 0, void 0, function* () {
              this.bridge.manageBilling();
              return;
            });
          }
          checkSupport(functionality) {
            const supported = [
              "order",
              "manageBilling",
              "manageSubscriptions"
            ];
            return supported.indexOf(functionality) >= 0;
          }
          restorePurchases() {
            return new Promise((resolve) => {
              this.bridge.getPurchases(() => resolve(void 0), (message, code) => {
                this.log.warn("getPurchases() failed: " + (code !== null && code !== void 0 ? code : "ERROR") + ": " + message);
                resolve(playStoreError(code !== null && code !== void 0 ? code : CdvPurchase2.ErrorCode.UNKNOWN, message, null));
              });
            });
          }
        }
        Adapter.trimProductTitles = true;
        GooglePlay2.Adapter = Adapter;
        function playStoreError(code, message, productId) {
          return CdvPurchase2.storeError(code, message, CdvPurchase2.Platform.GOOGLE_PLAY, productId);
        }
      })(GooglePlay = CdvPurchase2.GooglePlay || (CdvPurchase2.GooglePlay = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let GooglePlay;
      (function(GooglePlay2) {
        let Bridge;
        (function(Bridge2) {
          let RecurrenceMode;
          (function(RecurrenceMode2) {
            RecurrenceMode2["FINITE_RECURRING"] = "FINITE_RECURRING";
            RecurrenceMode2["INFINITE_RECURRING"] = "INFINITE_RECURRING";
            RecurrenceMode2["NON_RECURRING"] = "NON_RECURRING";
          })(RecurrenceMode = Bridge2.RecurrenceMode || (Bridge2.RecurrenceMode = {}));
        })(Bridge = GooglePlay2.Bridge || (GooglePlay2.Bridge = {}));
      })(GooglePlay = CdvPurchase2.GooglePlay || (CdvPurchase2.GooglePlay = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let GooglePlay;
      (function(GooglePlay2) {
        let ProrationMode;
        (function(ProrationMode2) {
          ProrationMode2["IMMEDIATE_WITH_TIME_PRORATION"] = "IMMEDIATE_WITH_TIME_PRORATION";
          ProrationMode2["IMMEDIATE_AND_CHARGE_PRORATED_PRICE"] = "IMMEDIATE_AND_CHARGE_PRORATED_PRICE";
          ProrationMode2["IMMEDIATE_WITHOUT_PRORATION"] = "IMMEDIATE_WITHOUT_PRORATION";
          ProrationMode2["DEFERRED"] = "DEFERRED";
          ProrationMode2["IMMEDIATE_AND_CHARGE_FULL_PRICE"] = "IMMEDIATE_AND_CHARGE_FULL_PRICE";
        })(ProrationMode = GooglePlay2.ProrationMode || (GooglePlay2.ProrationMode = {}));
        let ReplacementMode;
        (function(ReplacementMode2) {
          ReplacementMode2["WITH_TIME_PRORATION"] = "IMMEDIATE_WITH_TIME_PRORATION";
          ReplacementMode2["CHARGE_PRORATED_PRICE"] = "IMMEDIATE_AND_CHARGE_PRORATED_PRICE";
          ReplacementMode2["WITHOUT_PRORATION"] = "IMMEDIATE_WITHOUT_PRORATION";
          ReplacementMode2["DEFERRED"] = "DEFERRED";
          ReplacementMode2["CHARGE_FULL_PRICE"] = "IMMEDIATE_AND_CHARGE_FULL_PRICE";
        })(ReplacementMode = GooglePlay2.ReplacementMode || (GooglePlay2.ReplacementMode = {}));
        let Bridge;
        (function(Bridge_2) {
          let log = function log2(msg) {
            console.log("InAppBilling[js]: " + msg);
          };
          let PurchaseState;
          (function(PurchaseState2) {
            PurchaseState2[PurchaseState2["UNSPECIFIED_STATE"] = 0] = "UNSPECIFIED_STATE";
            PurchaseState2[PurchaseState2["PURCHASED"] = 1] = "PURCHASED";
            PurchaseState2[PurchaseState2["PENDING"] = 2] = "PENDING";
          })(PurchaseState = Bridge_2.PurchaseState || (Bridge_2.PurchaseState = {}));
          class Bridge2 {
            constructor() {
              this.options = {};
            }
            init(success, fail, options) {
              if (!options)
                options = {};
              if (options.log)
                log = options.log;
              this.options = {
                showLog: options.showLog !== false,
                onPurchaseConsumed: options.onPurchaseConsumed,
                onPurchasesUpdated: options.onPurchasesUpdated,
                onSetPurchases: options.onSetPurchases
              };
              if (this.options.showLog) {
                log("setup ok");
              }
              const listener = this.listener.bind(this);
              window.cordova.exec(listener, function(err) {
              }, "InAppBillingPlugin", "setListener", []);
              window.cordova.exec(success, errorCb(fail), "InAppBillingPlugin", "init", []);
            }
            load(success, fail, skus, inAppSkus, subsSkus) {
              var hasSKUs = false;
              if (typeof skus !== "undefined") {
                if (typeof skus === "string") {
                  skus = [skus];
                }
                if (skus.length > 0) {
                  if (typeof skus[0] !== "string") {
                    var msg = "invalid productIds: " + JSON.stringify(skus);
                    if (this.options.showLog) {
                      log(msg);
                    }
                    fail(msg, CdvPurchase2.ErrorCode.INVALID_PRODUCT_ID);
                    return;
                  }
                  if (this.options.showLog) {
                    log("load " + JSON.stringify(skus));
                  }
                  hasSKUs = true;
                }
              }
              window.cordova.exec(success, errorCb(fail), "InAppBillingPlugin", "load", [skus, inAppSkus, subsSkus]);
            }
            listener(msg) {
              if (this.options.showLog) {
                log("listener: " + JSON.stringify(msg));
              }
              if (!msg || !msg.type) {
                return;
              }
              if (msg.type === "setPurchases" && this.options.onSetPurchases) {
                this.options.onSetPurchases(msg.data.purchases);
              }
              if (msg.type === "purchasesUpdated" && this.options.onPurchasesUpdated) {
                this.options.onPurchasesUpdated(msg.data.purchases);
              }
              if (msg.type === "purchaseConsumed" && this.options.onPurchaseConsumed) {
                this.options.onPurchaseConsumed(msg.data.purchase);
              }
              if (msg.type === "onPriceChangeConfirmationResultOK" && this.options.onPriceChangeConfirmationResult) {
                this.options.onPriceChangeConfirmationResult("OK");
              }
              if (msg.type === "onPriceChangeConfirmationResultUserCanceled" && this.options.onPriceChangeConfirmationResult) {
                this.options.onPriceChangeConfirmationResult("UserCanceled");
              }
              if (msg.type === "onPriceChangeConfirmationResultUnknownSku" && this.options.onPriceChangeConfirmationResult) {
                this.options.onPriceChangeConfirmationResult("UnknownProduct");
              }
            }
            getPurchases(success, fail) {
              if (this.options.showLog) {
                log("getPurchases()");
              }
              return window.cordova.exec(success, errorCb(fail), "InAppBillingPlugin", "getPurchases", ["null"]);
            }
            buy(success, fail, productId, additionalData) {
              if (this.options.showLog) {
                log("buy()");
              }
              return window.cordova.exec(success, errorCb(fail), "InAppBillingPlugin", "buy", [
                productId,
                extendAdditionalData(additionalData)
              ]);
            }
            subscribe(success, fail, productId, additionalData) {
              var _a;
              if (this.options.showLog) {
                log("subscribe()");
              }
              if (((_a = additionalData.googlePlay) === null || _a === void 0 ? void 0 : _a.oldPurchaseToken) && this.options.showLog) {
                log("subscribe() -> upgrading from an old purchase");
              }
              return window.cordova.exec(success, errorCb(fail), "InAppBillingPlugin", "subscribe", [
                productId,
                extendAdditionalData(additionalData)
              ]);
            }
            consumePurchase(success, fail, purchaseToken) {
              if (this.options.showLog) {
                log("consumePurchase()");
              }
              return window.cordova.exec(success, errorCb(fail), "InAppBillingPlugin", "consumePurchase", [purchaseToken]);
            }
            acknowledgePurchase(success, fail, purchaseToken) {
              if (this.options.showLog) {
                log("acknowledgePurchase()");
              }
              return window.cordova.exec(success, errorCb(fail), "InAppBillingPlugin", "acknowledgePurchase", [purchaseToken]);
            }
            getAvailableProducts(inAppSkus, subsSkus, success, fail) {
              if (this.options.showLog) {
                log("getAvailableProducts()");
              }
              return window.cordova.exec(success, errorCb(fail), "InAppBillingPlugin", "getAvailableProducts", [inAppSkus, subsSkus]);
            }
            manageSubscriptions() {
              return window.cordova.exec(function() {
              }, function() {
              }, "InAppBillingPlugin", "manageSubscriptions", []);
            }
            manageBilling() {
              return window.cordova.exec(function() {
              }, function() {
              }, "InAppBillingPlugin", "manageBilling", []);
            }
            launchPriceChangeConfirmationFlow(productId) {
              return window.cordova.exec(function() {
              }, function() {
              }, "InAppBillingPlugin", "launchPriceChangeConfirmationFlow", [productId]);
            }
          }
          Bridge_2.Bridge = Bridge2;
          function errorCb(fail) {
            return function(error) {
              if (!fail)
                return;
              const tokens = typeof error === "string" ? error.split("|") : [];
              if (tokens.length > 1 && /^[-+]?(\d+)$/.test(tokens[0])) {
                var code = tokens[0];
                var message = tokens[1];
                fail(message, +code);
              } else {
                fail(error);
              }
            };
          }
          function ensureObject(obj) {
            return !!obj && obj.constructor === Object ? obj : {};
          }
          function extendAdditionalData(ad) {
            const additionalData = ensureObject(ad === null || ad === void 0 ? void 0 : ad.googlePlay);
            if (!additionalData.accountId && (ad === null || ad === void 0 ? void 0 : ad.applicationUsername)) {
              additionalData.accountId = CdvPurchase2.Utils.md5(ad.applicationUsername);
            }
            return additionalData;
          }
        })(Bridge = GooglePlay2.Bridge || (GooglePlay2.Bridge = {}));
      })(GooglePlay = CdvPurchase2.GooglePlay || (CdvPurchase2.GooglePlay = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let GooglePlay;
      (function(GooglePlay2) {
        class GProduct extends CdvPurchase2.Product {
        }
        GooglePlay2.GProduct = GProduct;
        class InAppOffer extends CdvPurchase2.Offer {
          constructor() {
            super(...arguments);
            this.type = "inapp";
          }
        }
        GooglePlay2.InAppOffer = InAppOffer;
        class SubscriptionOffer extends CdvPurchase2.Offer {
          constructor(options, decorator) {
            super(options, decorator);
            this.type = "subs";
            this.tags = options.tags;
            this.token = options.token;
          }
        }
        GooglePlay2.SubscriptionOffer = SubscriptionOffer;
        class Products {
          constructor(decorator) {
            this.products = [];
            this.offers = [];
            this.decorator = decorator;
          }
          getProduct(id) {
            return this.products.find((p) => p.id === id);
          }
          getOffer(id) {
            return this.offers.find((p) => p.id === id);
          }
          /**  */
          addProduct(registeredProduct, vp) {
            const existingProduct = this.getProduct(registeredProduct.id);
            const p = existingProduct !== null && existingProduct !== void 0 ? existingProduct : new GProduct(registeredProduct, this.decorator);
            p.title = vp.title || vp.name || p.title;
            if (GooglePlay2.Adapter.trimProductTitles)
              p.title = p.title.replace(/ \(.*\)$/, "");
            p.description = vp.description || p.description;
            if ("product_format" in vp && vp.product_format === "v12.0") {
              if (vp.product_type === "subs")
                this.onSubsV12Loaded(p, vp);
              else
                this.onInAppLoaded(p, vp);
            } else {
              this.onInAppLoaded(p, vp);
            }
            if (!existingProduct) {
              this.products.push(p);
            }
            return p;
          }
          onSubsV12Loaded(product, vp) {
            vp.offers.forEach((productOffer) => {
              const lastPhase = productOffer.pricing_phases.slice(-1)[0];
              if ((lastPhase === null || lastPhase === void 0 ? void 0 : lastPhase.recurrence_mode) === CdvPurchase2.RecurrenceMode.FINITE_RECURRING) {
                const baseOffer = findBasePlan(productOffer.base_plan_id);
                if (baseOffer && baseOffer !== productOffer) {
                  productOffer.pricing_phases.push(...baseOffer.pricing_phases);
                }
              }
              const offer = this.iabSubsOfferV12Loaded(product, vp, productOffer);
              product.addOffer(offer);
            });
            function findBasePlan(basePlanId) {
              if (!basePlanId)
                return null;
              for (const offer of vp.offers) {
                if (offer.base_plan_id === basePlanId && !offer.offer_id) {
                  return offer;
                }
              }
              return null;
            }
            return product;
          }
          makeOfferId(productId, productOffer) {
            let id = productId;
            if (productOffer.base_plan_id) {
              if (productOffer.offer_id) {
                return productId + "@" + productOffer.base_plan_id + "@" + productOffer.offer_id;
              }
              return productId + "@" + productOffer.base_plan_id;
            }
            return productId + "@" + productOffer.token;
          }
          iabSubsOfferV12Loaded(product, vp, productOffer) {
            const offerId = this.makeOfferId(vp.productId, productOffer);
            const existingOffer = this.getOffer(offerId);
            const pricingPhases = productOffer.pricing_phases.map((p) => this.toPricingPhase(p));
            if (existingOffer) {
              existingOffer.pricingPhases = pricingPhases;
              return existingOffer;
            } else {
              const offer = new SubscriptionOffer({ id: offerId, product, pricingPhases, token: productOffer.token, tags: productOffer.tags }, this.decorator);
              this.offers.push(offer);
              return offer;
            }
          }
          /*
                      private iabSubsV11Loaded(p: Product, vp: SubscriptionV11): Product {
                          // console.log('iabSubsV11Loaded: ' + JSON.stringify(vp));
                          var p = store.products.byId[vp.productId];
                          var attributes = {
                              state: store.VALID,
                              title: vp.name || trimTitle(vp.title),
                              description: vp.description,
                          };
                          var currency = vp.price_currency_code || "";
                          var price = vp.formatted_price || vp.price;
                          var priceMicros = vp.price_amount_micros;
                          var subscriptionPeriod = vp.subscriptionPeriod ? vp.subscriptionPeriod : "";
                          var introPriceSubscriptionPeriod = vp.introductoryPricePeriod ? vp.introductoryPricePeriod : "";
                          var introPriceNumberOfPeriods = vp.introductoryPriceCycles ? vp.introductoryPriceCycles : 0;
                          var introPricePeriodUnit = normalizeISOPeriodUnit(introPriceSubscriptionPeriod);
                          var introPricePeriodCount = normalizeISOPeriodCount(introPriceSubscriptionPeriod);
                          var introPricePeriod = (introPriceNumberOfPeriods || 1) * (introPricePeriodCount || 1);
                          var introPriceMicros = vp.introductoryPriceAmountMicros ? vp.introductoryPriceAmountMicros : "";
                          var introPrice = vp.introductoryPrice ? vp.introductoryPrice : "";
                          var introPricePaymentMode;
          
                          if (vp.freeTrialPeriod) {
                              introPricePaymentMode = 'FreeTrial';
                              try {
                                  introPricePeriodUnit = normalizeISOPeriodUnit(vp.freeTrialPeriod);
                                  introPricePeriodCount = normalizeISOPeriodCount(vp.freeTrialPeriod);
                                  introPricePeriod = introPricePeriodCount;
                              }
                              catch (e) {
                                  store.log.warn('Failed to parse free trial period: ' + vp.freeTrialPeriod);
                              }
                          }
                          else if (vp.introductoryPrice) {
                              if (vp.introductoryPrice < vp.price && subscriptionPeriod === introPriceSubscriptionPeriod) {
                                  introPricePaymentMode = 'PayAsYouGo';
                              }
                              else if (introPriceNumberOfPeriods === 1) {
                                  introPricePaymentMode = 'UpFront';
                              }
                          }
          
                          if (!introPricePaymentMode) {
                              introPricePeriod = null;
                              introPricePeriodUnit = null;
                          }
          
                          var parsedSubscriptionPeriod = {};
                          if (subscriptionPeriod) {
                              parsedSubscriptionPeriod.unit = normalizeISOPeriodUnit(subscriptionPeriod);
                              parsedSubscriptionPeriod.count = normalizeISOPeriodCount(subscriptionPeriod);
                          }
          
                          var trialPeriod = vp.trial_period || null;
                          var trialPeriodUnit = vp.trial_period_unit || null;
                          var billingPeriod = parsedSubscriptionPeriod.count || vp.billing_period || null;
                          var billingPeriodUnit = parsedSubscriptionPeriod.unit || vp.billing_period_unit || null;
          
                          var pricingPhases = [];
                          if (trialPeriod) {
                              pricingPhases.push({
                                  paymentMode: 'FreeTrial',
                                  recurrenceMode: store.FINITE_RECURRING,
                                  period: vp.freeTrialPeriod || toISO8601Duration(trialPeriodUnit, trialPeriod),
                                  cycles: 1,
                                  price: null,
                                  priceMicros: 0,
                                  currency: currency,
                              });
                          }
                          else if (introPricePeriod) {
                              pricingPhases.push({
                                  paymentMode: 'PayAsYouGo',
                                  recurrenceMode: store.FINITE_RECURRING,
                                  period: vp.introPriceSubscriptionPeriod || toISO8601Duration(introPricePeriodUnit, introPricePeriodCount),
                                  cycles: vp.introductoryPriceCycles || 1,
                                  price: null, // formatted price not available
                                  priceMicros: introPriceMicros,
                                  currency: currency,
                              });
                          }
          
                          pricingPhases.push({
                              paymentMode: 'PayAsYouGo',
                              recurrenceMode: store.INFINITE_RECURRING,
                              period: vp.subscriptionPeriod || toISO8601Duration(billingPeriodUnit, billingPeriod), // ISO8601 duration
                              cycles: 0,
                              price: price,
                              priceMicros: priceMicros,
                              currency: currency,
                          });
                          attributes.pricingPhases = pricingPhases;
          
                          if (store.compatibility > 0 && store.compatibility < 11.999) {
                              Object.assign(attributes, {
                                  price: price,
                                  priceMicros: priceMicros,
                                  currency: currency,
                                  trialPeriod: trialPeriod,
                                  trialPeriodUnit: trialPeriodUnit,
                                  billingPeriod: billingPeriod,
                                  billingPeriodUnit: billingPeriodUnit,
                                  introPrice: introPrice,
                                  introPriceMicros: introPriceMicros,
                                  introPricePeriod: introPricePeriod,
                                  introPricePeriodUnit: introPricePeriodUnit,
                                  introPricePaymentMode: introPricePaymentMode,
                              });
                          }
          
                          if (store.compatibility > 0 && store.compatibility < 9.999) {
                              Object.assign(attributes, {
                                  introPriceNumberOfPeriods: introPricePeriod,
                                  introPriceSubscriptionPeriod: introPricePeriodUnit,
                              });
                          }
          
                          p.set(attributes);
                          p.trigger("loaded");
                      }
                      */
          onInAppLoaded(p, vp) {
            var _a, _b, _c, _d;
            const existingOffer = this.getOffer(vp.productId);
            const pricingPhases = [{
              price: (_b = (_a = vp.formatted_price) !== null && _a !== void 0 ? _a : vp.price) !== null && _b !== void 0 ? _b : `${((_c = vp.price_amount_micros) !== null && _c !== void 0 ? _c : 0) / 1e6} ${vp.price_currency_code}`,
              priceMicros: (_d = vp.price_amount_micros) !== null && _d !== void 0 ? _d : 0,
              currency: vp.price_currency_code,
              recurrenceMode: CdvPurchase2.RecurrenceMode.NON_RECURRING
            }];
            if (existingOffer) {
              existingOffer.pricingPhases = pricingPhases;
              p.offers = [existingOffer];
            } else {
              const newOffer = new InAppOffer({ id: vp.productId, product: p, pricingPhases }, this.decorator);
              this.offers.push(newOffer);
              p.offers = [newOffer];
            }
            return p;
          }
          toPaymentMode(phase) {
            return phase.price_amount_micros === 0 ? CdvPurchase2.PaymentMode.FREE_TRIAL : phase.recurrence_mode === GooglePlay2.Bridge.RecurrenceMode.NON_RECURRING ? CdvPurchase2.PaymentMode.UP_FRONT : CdvPurchase2.PaymentMode.PAY_AS_YOU_GO;
          }
          toRecurrenceMode(mode) {
            switch (mode) {
              case GooglePlay2.Bridge.RecurrenceMode.FINITE_RECURRING:
                return CdvPurchase2.RecurrenceMode.FINITE_RECURRING;
              case GooglePlay2.Bridge.RecurrenceMode.INFINITE_RECURRING:
                return CdvPurchase2.RecurrenceMode.INFINITE_RECURRING;
              case GooglePlay2.Bridge.RecurrenceMode.NON_RECURRING:
                return CdvPurchase2.RecurrenceMode.NON_RECURRING;
            }
          }
          toPricingPhase(phase) {
            return {
              price: phase.formatted_price,
              priceMicros: phase.price_amount_micros,
              currency: phase.price_currency_code,
              billingPeriod: phase.billing_period,
              billingCycles: phase.billing_cycle_count,
              recurrenceMode: this.toRecurrenceMode(phase.recurrence_mode),
              paymentMode: this.toPaymentMode(phase)
            };
          }
        }
        GooglePlay2.Products = Products;
      })(GooglePlay = CdvPurchase2.GooglePlay || (CdvPurchase2.GooglePlay = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let GooglePlay;
      (function(GooglePlay2) {
        let PublisherAPI;
        (function(PublisherAPI2) {
          let GoogleErrorReason;
          (function(GoogleErrorReason2) {
            GoogleErrorReason2["SUBSCRIPTION_NO_LONGER_AVAILABLE"] = "subscriptionPurchaseNoLongerAvailable";
            GoogleErrorReason2["PURCHASE_TOKEN_NO_LONGER_VALID"] = "purchaseTokenNoLongerValid";
          })(GoogleErrorReason = PublisherAPI2.GoogleErrorReason || (PublisherAPI2.GoogleErrorReason = {}));
          let ErrorCode;
          (function(ErrorCode2) {
            ErrorCode2[ErrorCode2["GONE"] = 410] = "GONE";
          })(ErrorCode = PublisherAPI2.ErrorCode || (PublisherAPI2.ErrorCode = {}));
        })(PublisherAPI = GooglePlay2.PublisherAPI || (GooglePlay2.PublisherAPI = {}));
      })(GooglePlay = CdvPurchase2.GooglePlay || (CdvPurchase2.GooglePlay = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Test;
      (function(Test2) {
        const platform = CdvPurchase2.Platform.TEST;
        let verifiedPurchases = [];
        function updateVerifiedPurchases(tr) {
          tr.products.forEach((p) => {
            var _a, _b, _c, _d;
            const existing = verifiedPurchases.find((v) => p.id === v.id);
            const attributes = {
              id: p.id,
              purchaseDate: (_a = tr.purchaseDate) === null || _a === void 0 ? void 0 : _a.getTime(),
              expiryDate: (_b = tr.expirationDate) === null || _b === void 0 ? void 0 : _b.getTime(),
              lastRenewalDate: (_c = tr.lastRenewalDate) === null || _c === void 0 ? void 0 : _c.getTime(),
              renewalIntent: tr.renewalIntent,
              renewalIntentChangeDate: (_d = tr.renewalIntentChangeDate) === null || _d === void 0 ? void 0 : _d.getTime()
            };
            if (existing) {
              Object.assign(existing, attributes);
            } else {
              verifiedPurchases.push(attributes);
            }
          });
        }
        class Adapter {
          constructor(context) {
            this.id = CdvPurchase2.Platform.TEST;
            this.name = "Test";
            this.ready = false;
            this.products = [];
            this.receipts = [];
            this.supportsParallelLoading = true;
            this.context = context;
            this.log = context.log.child("Test");
          }
          get isSupported() {
            return true;
          }
          initialize() {
            return __awaiter(this, void 0, void 0, function* () {
              return;
            });
          }
          loadReceipts() {
            return __awaiter(this, void 0, void 0, function* () {
              return new Promise((resolve) => {
                setTimeout(() => {
                  this.context.listener.receiptsReady(CdvPurchase2.Platform.TEST);
                  resolve(this.receipts);
                }, 600);
              });
            });
          }
          loadProducts(products) {
            return __awaiter(this, void 0, void 0, function* () {
              return products.map((registerProduct) => {
                if (!Test2.testProductsArray.find((p) => p.id === registerProduct.id && p.type === registerProduct.type)) {
                  return testStoreError(CdvPurchase2.ErrorCode.PRODUCT_NOT_AVAILABLE, "This product is not available", registerProduct.id);
                }
                const existingProduct = this.products.find((p) => p.id === registerProduct.id);
                if (existingProduct)
                  return existingProduct;
                if (registerProduct.id === Test2.testProducts.PAID_SUBSCRIPTION_ACTIVE.id) {
                  setTimeout(() => {
                    this.reportActiveSubscription();
                  }, 500);
                }
                const product = Test2.initTestProduct(registerProduct.id, this.context.apiDecorators);
                if (!product)
                  return testStoreError(CdvPurchase2.ErrorCode.PRODUCT_NOT_AVAILABLE, "Could not load this product", registerProduct.id);
                this.products.push(product);
                this.context.listener.productsUpdated(CdvPurchase2.Platform.TEST, [product]);
                return product;
              });
            });
          }
          order(offer) {
            return __awaiter(this, void 0, void 0, function* () {
              if (offer.id.indexOf("-fail-") > 0) {
                return testStoreError(CdvPurchase2.ErrorCode.PURCHASE, "Purchase failed.", offer.productId);
              }
              const product = this.products.find((p) => p.id === offer.productId);
              if (!CdvPurchase2.Internal.LocalReceipts.canPurchase(this.receipts, product)) {
                return testStoreError(CdvPurchase2.ErrorCode.PURCHASE, "Product already owned", offer.productId);
              }
              const response = prompt(`Do you want to purchase ${offer.productId} for ${offer.pricingPhases[0].price}?
Enter "Y" to confirm.
Enter "E" to fail with an error.Anything else to cancel.`);
              if ((response === null || response === void 0 ? void 0 : response.toUpperCase()) === "E")
                return testStoreError(CdvPurchase2.ErrorCode.PURCHASE, "Purchase failed", offer.productId);
              if ((response === null || response === void 0 ? void 0 : response.toUpperCase()) !== "Y")
                return testStoreError(CdvPurchase2.ErrorCode.PAYMENT_CANCELLED, "Purchase flow has been cancelled by the user", offer.productId);
              const receipt = new CdvPurchase2.Receipt(platform, this.context.apiDecorators);
              const tr = new CdvPurchase2.Transaction(platform, receipt, this.context.apiDecorators);
              receipt.transactions = [tr];
              tr.products = [{
                id: offer.productId,
                offerId: offer.id
              }];
              tr.state = CdvPurchase2.TransactionState.APPROVED;
              tr.purchaseDate = /* @__PURE__ */ new Date();
              tr.transactionId = offer.productId + "-" + (/* @__PURE__ */ new Date()).getTime();
              tr.isAcknowledged = false;
              if (offer.productType === CdvPurchase2.ProductType.PAID_SUBSCRIPTION) {
                tr.expirationDate = /* @__PURE__ */ new Date(+/* @__PURE__ */ new Date() + 6048e5);
                tr.renewalIntent = CdvPurchase2.RenewalIntent.RENEW;
              }
              updateVerifiedPurchases(tr);
              this.receipts.push(receipt);
              this.context.listener.receiptsUpdated(CdvPurchase2.Platform.TEST, [receipt]);
            });
          }
          finish(transaction) {
            return new Promise((resolve) => {
              setTimeout(() => {
                transaction.state = CdvPurchase2.TransactionState.FINISHED;
                transaction.isAcknowledged = true;
                updateVerifiedPurchases(transaction);
                const product = this.products.find((p) => transaction.products[0].id === p.id);
                if ((product === null || product === void 0 ? void 0 : product.type) === CdvPurchase2.ProductType.CONSUMABLE)
                  transaction.isConsumed = true;
                const receipts = this.receipts.filter((r) => r.hasTransaction(transaction));
                this.context.listener.receiptsUpdated(platform, receipts);
                resolve(void 0);
              }, 500);
            });
          }
          receiptValidationBody(receipt) {
            return __awaiter(this, void 0, void 0, function* () {
              return;
            });
          }
          handleReceiptValidationResponse(receipt, response) {
            return __awaiter(this, void 0, void 0, function* () {
              return;
            });
          }
          /**
           * This function simulates a payment process by prompting the user to confirm the payment.
           *
           * It creates a `Receipt` and `Transaction` object and returns the `Transaction` object if the user enters "Y" in the prompt.
           *
           * @param paymentRequest - An object containing information about the payment, such as the amount and currency.
           * @param additionalData - Additional data to be included in the receipt.
           *
           * @returns A promise that resolves to either an error object (if the user enters "E" in the prompt),
           * a `Transaction` object (if the user confirms the payment), or `undefined` (if the user does not confirm the payment).
           *
           * @example
           *
           * const paymentRequest = {
           *   amountMicros: 1000000,
           *   currency: "USD",
           *   items: [{ id: "product-1" }, { id: "product-2" }]
           * };
           * const result = await requestPayment(paymentRequest);
           * if (result?.isError) {
           *   console.error(`Error: ${result.message}`);
           * } else if (result) {
           *   console.log(`Transaction approved: ${result.transactionId}`);
           * } else {
           *   console.log("Payment cancelled by user");
           * }
           */
          requestPayment(paymentRequest, additionalData) {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
              yield CdvPurchase2.Utils.asyncDelay(100);
              const response = prompt(`Mock payment of ${((_a = paymentRequest.amountMicros) !== null && _a !== void 0 ? _a : 0) / 1e6} ${paymentRequest.currency}. Enter "Y" to confirm. Enter "E" to trigger an error.`);
              if ((response === null || response === void 0 ? void 0 : response.toUpperCase()) === "E")
                return testStoreError(CdvPurchase2.ErrorCode.PAYMENT_NOT_ALLOWED, "Payment not allowed", null);
              if ((response === null || response === void 0 ? void 0 : response.toUpperCase()) !== "Y")
                return;
              const receipt = new CdvPurchase2.Receipt(platform, this.context.apiDecorators);
              const transaction = new CdvPurchase2.Transaction(CdvPurchase2.Platform.TEST, receipt, this.context.apiDecorators);
              transaction.purchaseDate = /* @__PURE__ */ new Date();
              transaction.products = paymentRequest.items.filter((p) => p).map((product) => ({ id: (product === null || product === void 0 ? void 0 : product.id) || "" })), transaction.state = CdvPurchase2.TransactionState.APPROVED;
              transaction.transactionId = "payment-" + (/* @__PURE__ */ new Date()).getTime();
              transaction.amountMicros = paymentRequest.amountMicros;
              transaction.currency = paymentRequest.currency;
              receipt.transactions = [transaction];
              this.receipts.push(receipt);
              setTimeout(() => {
                this.context.listener.receiptsUpdated(platform, [receipt]);
              }, 400);
              return transaction;
            });
          }
          manageSubscriptions() {
            return __awaiter(this, void 0, void 0, function* () {
              alert("Pseudo subscription management interface. Close it when you are done.");
              return;
            });
          }
          manageBilling() {
            return __awaiter(this, void 0, void 0, function* () {
              alert("Pseudo billing management interface. Close it when you are done.");
              return;
            });
          }
          reportActiveSubscription() {
            if (this.receipts.find((r) => r.transactions[0].transactionId === transactionId(1))) {
              return;
            }
            const RENEWS_EVERY_MS = 2 * 6e4;
            const receipt = new CdvPurchase2.Receipt(platform, this.context.apiDecorators);
            const makeTransaction = (n) => {
              var _a, _b;
              const tr = new CdvPurchase2.Transaction(platform, receipt, this.context.apiDecorators);
              tr.products = [{
                id: Test2.testProducts.PAID_SUBSCRIPTION_ACTIVE.id,
                offerId: Test2.testProducts.PAID_SUBSCRIPTION_ACTIVE.extra.offerId
              }];
              tr.state = CdvPurchase2.TransactionState.APPROVED;
              tr.transactionId = transactionId(n);
              tr.isAcknowledged = n == 1;
              tr.renewalIntent = CdvPurchase2.RenewalIntent.RENEW;
              const firstPurchase = +(((_b = (_a = receipt === null || receipt === void 0 ? void 0 : receipt.transactions) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.purchaseDate) || /* @__PURE__ */ new Date());
              tr.purchaseDate = new Date(firstPurchase);
              tr.lastRenewalDate = new Date(firstPurchase + RENEWS_EVERY_MS * (n - 1));
              tr.expirationDate = new Date(firstPurchase + RENEWS_EVERY_MS * n);
              updateVerifiedPurchases(tr);
              return tr;
            };
            receipt.transactions.push(makeTransaction(1));
            this.receipts.push(receipt);
            this.context.listener.receiptsUpdated(CdvPurchase2.Platform.TEST, [receipt]);
            function transactionId(n) {
              return "test-active-subscription-transaction-" + n;
            }
            let transactionNumber = 1;
            setInterval(() => {
              this.log.info("auto-renewing the mock subscription");
              transactionNumber += 1;
              receipt.transactions.push(makeTransaction(transactionNumber));
              this.context.listener.receiptsUpdated(CdvPurchase2.Platform.TEST, [receipt]);
            }, RENEWS_EVERY_MS);
          }
          static verify(receipt, callback) {
            setTimeout(() => {
              var _a, _b;
              callback({
                receipt,
                payload: {
                  ok: true,
                  data: {
                    id: (_b = (_a = receipt.transactions[0]) === null || _a === void 0 ? void 0 : _a.products[0]) === null || _b === void 0 ? void 0 : _b.id,
                    latest_receipt: true,
                    transaction: { type: "test" },
                    collection: verifiedPurchases
                  }
                }
              });
            }, 500);
          }
          checkSupport(functionality) {
            return true;
          }
          restorePurchases() {
            return __awaiter(this, void 0, void 0, function* () {
              return void 0;
            });
          }
        }
        Test2.Adapter = Adapter;
        function testStoreError(code, message, productId) {
          return CdvPurchase2.storeError(code, message, CdvPurchase2.Platform.TEST, productId);
        }
      })(Test = CdvPurchase2.Test || (CdvPurchase2.Test = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Test;
      (function(Test2) {
        const platform = CdvPurchase2.Platform.TEST;
        Test2.testProducts = {
          /**
           * A valid consumable product.
           *
           * - id: "test-consumable"
           * - type: ProductType.CONSUMABLE
           */
          CONSUMABLE: {
            platform,
            id: "test-consumable",
            type: CdvPurchase2.ProductType.CONSUMABLE
          },
          /**
           * A consumable product for which the purchase will always fail.
           *
           * - id: "test-consumable-fail"
           * - type: ProductType.CONSUMABLE
           */
          CONSUMABLE_FAILING: {
            platform,
            id: "test-consumable-fail",
            type: CdvPurchase2.ProductType.CONSUMABLE
          },
          /**
           * A valid non-consumable product.
           *
           * - id: "test-non-consumable"
           * - type: ProductType.NON_CONSUMABLE
           */
          NON_CONSUMABLE: {
            platform,
            id: "test-non-consumable",
            type: CdvPurchase2.ProductType.NON_CONSUMABLE
          },
          /**
           * A paid-subscription that auto-renews for the duration of the session.
           *
           * This subscription has a free trial period, that renews every week, 3 times.
           * It then costs $4.99 per month.
           *
           * - id: "test-subscription"
           * - type: ProductType.PAID_SUBSCRIPTION
           */
          PAID_SUBSCRIPTION: {
            platform,
            id: "test-subscription",
            type: CdvPurchase2.ProductType.PAID_SUBSCRIPTION
          },
          /**
           * A paid-subscription that is already active when the app starts.
           *
           * It behaves as if the user subscribed on a different device. It will renew forever.
           *
           * - id: "test-subscription-active"
           * - type: ProductType.PAID_SUBSCRIPTION
           */
          PAID_SUBSCRIPTION_ACTIVE: {
            platform,
            id: "test-subscription-active",
            type: CdvPurchase2.ProductType.PAID_SUBSCRIPTION,
            /** @internal */
            extra: {
              offerId: "test-paid-subscription-active-offer1"
            }
          }
        };
        Test2.testProductsArray = CdvPurchase2.Utils.objectValues(Test2.testProducts);
        function initTestProduct(productId, decorator) {
          const key = Object.keys(Test2.testProducts).find((key2) => Test2.testProducts[key2] && Test2.testProducts[key2].id === productId);
          if (!key)
            return;
          const product = new CdvPurchase2.Product(Test2.testProducts[key], decorator);
          switch (key) {
            case "CONSUMABLE":
              product.title = "Test Consumable";
              product.description = "A consumable product that you can purchase";
              product.addOffer(new CdvPurchase2.Offer({
                id: "test-consumable-offer1",
                pricingPhases: [{
                  price: "$4.99",
                  currency: "USD",
                  priceMicros: 499e4,
                  paymentMode: CdvPurchase2.PaymentMode.UP_FRONT,
                  recurrenceMode: CdvPurchase2.RecurrenceMode.NON_RECURRING
                }],
                product
              }, decorator));
              break;
            case "CONSUMABLE_FAILING":
              product.title = "Failing Consumable";
              product.description = "A consumable product that cannot be purchased";
              product.addOffer(new CdvPurchase2.Offer({
                id: "test-consumable-fail-offer1",
                pricingPhases: [{
                  price: "$1.99",
                  currency: "USD",
                  priceMicros: 199e4,
                  paymentMode: CdvPurchase2.PaymentMode.UP_FRONT,
                  recurrenceMode: CdvPurchase2.RecurrenceMode.NON_RECURRING
                }],
                product
              }, decorator));
              break;
            case "NON_CONSUMABLE":
              product.title = "Non Consumable";
              product.description = "A non consumable product";
              product.addOffer(new CdvPurchase2.Offer({
                id: "test-non-consumable-offer1",
                pricingPhases: [{
                  price: "$9.99",
                  currency: "USD",
                  priceMicros: 999e4,
                  paymentMode: CdvPurchase2.PaymentMode.UP_FRONT,
                  recurrenceMode: CdvPurchase2.RecurrenceMode.NON_RECURRING
                }],
                product
              }, decorator));
              break;
            case "PAID_SUBSCRIPTION":
              product.title = "A subscription product";
              product.description = "An auto-renewing paid subscription with a trial period";
              product.addOffer(new CdvPurchase2.Offer({
                id: "test-paid-subscription-offer1",
                product,
                pricingPhases: [{
                  price: "$0.00",
                  currency: "USD",
                  priceMicros: 0,
                  paymentMode: CdvPurchase2.PaymentMode.FREE_TRIAL,
                  recurrenceMode: CdvPurchase2.RecurrenceMode.FINITE_RECURRING,
                  billingCycles: 3,
                  billingPeriod: "P1W"
                }, {
                  price: "$4.99",
                  currency: "USD",
                  priceMicros: 499e4,
                  paymentMode: CdvPurchase2.PaymentMode.PAY_AS_YOU_GO,
                  recurrenceMode: CdvPurchase2.RecurrenceMode.INFINITE_RECURRING,
                  billingPeriod: "P1M"
                }]
              }, decorator));
              break;
            case "PAID_SUBSCRIPTION_ACTIVE":
              product.title = "An owned subscription product";
              product.description = "An active paid subscription";
              product.addOffer(new CdvPurchase2.Offer({
                id: Test2.testProducts.PAID_SUBSCRIPTION_ACTIVE.extra.offerId,
                product,
                pricingPhases: [{
                  price: "$19.99",
                  currency: "USD",
                  priceMicros: 1999e4,
                  paymentMode: CdvPurchase2.PaymentMode.PAY_AS_YOU_GO,
                  recurrenceMode: CdvPurchase2.RecurrenceMode.INFINITE_RECURRING,
                  billingPeriod: "P1Y"
                }]
              }, decorator));
              break;
            default:
              const unhandledSwitchCase = key;
              throw new Error(`Unhandled enum case: ${unhandledSwitchCase}`);
          }
          return product;
        }
        Test2.initTestProduct = initTestProduct;
      })(Test = CdvPurchase2.Test || (CdvPurchase2.Test = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let WindowsStore;
      (function(WindowsStore2) {
        class Adapter {
          constructor() {
            this.id = CdvPurchase2.Platform.WINDOWS_STORE;
            this.name = "WindowsStore";
            this.ready = false;
            this.supportsParallelLoading = false;
            this.products = [];
            this.receipts = [];
          }
          initialize() {
            return __awaiter(this, void 0, void 0, function* () {
              return;
            });
          }
          get isSupported() {
            return false;
          }
          loadProducts(products) {
            return __awaiter(this, void 0, void 0, function* () {
              return products.map((p) => windowsStoreError(CdvPurchase2.ErrorCode.PRODUCT_NOT_AVAILABLE, "TODO", p.id));
            });
          }
          loadReceipts() {
            return __awaiter(this, void 0, void 0, function* () {
              return [];
            });
          }
          order(offer) {
            return __awaiter(this, void 0, void 0, function* () {
              return windowsStoreError(CdvPurchase2.ErrorCode.UNKNOWN, "TODO: Not implemented", offer.productId);
            });
          }
          finish(transaction) {
            return __awaiter(this, void 0, void 0, function* () {
              return windowsStoreError(CdvPurchase2.ErrorCode.UNKNOWN, "TODO: Not implemented", null);
            });
          }
          handleReceiptValidationResponse(receipt, response) {
            return __awaiter(this, void 0, void 0, function* () {
              return;
            });
          }
          receiptValidationBody(receipt) {
            return __awaiter(this, void 0, void 0, function* () {
              return;
            });
          }
          requestPayment(payment, additionalData) {
            return __awaiter(this, void 0, void 0, function* () {
              return windowsStoreError(CdvPurchase2.ErrorCode.UNKNOWN, "requestPayment not supported", null);
            });
          }
          manageSubscriptions() {
            return __awaiter(this, void 0, void 0, function* () {
              return windowsStoreError(CdvPurchase2.ErrorCode.UNKNOWN, "manageSubscriptions not supported", null);
            });
          }
          manageBilling() {
            return __awaiter(this, void 0, void 0, function* () {
              return windowsStoreError(CdvPurchase2.ErrorCode.UNKNOWN, "manageBilling not supported", null);
            });
          }
          checkSupport(functionality) {
            return false;
          }
          restorePurchases() {
            return __awaiter(this, void 0, void 0, function* () {
              return void 0;
            });
          }
        }
        WindowsStore2.Adapter = Adapter;
        function windowsStoreError(code, message, productId) {
          return CdvPurchase2.storeError(code, message, CdvPurchase2.Platform.WINDOWS_STORE, productId);
        }
      })(WindowsStore = CdvPurchase2.WindowsStore || (CdvPurchase2.WindowsStore = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        let Ajax;
        (function(Ajax2) {
          Ajax2.HTTP_REQUEST_TIMEOUT = 408;
        })(Ajax = Utils2.Ajax || (Utils2.Ajax = {}));
        function ajax(log, options) {
          if (typeof window !== "undefined" && window.cordova && window.cordova.plugin && window.cordova.plugin.http) {
            return ajaxWithHttpPlugin(log, options);
          }
          var doneCb = function() {
          };
          var xhr = new XMLHttpRequest();
          if (options.timeout) {
            xhr.timeout = options.timeout;
            xhr.ontimeout = function() {
              log.warn("ajax -> request to " + options.url + " timeout");
              Utils2.callExternal(log, "ajax.error", options.error, Ajax.HTTP_REQUEST_TIMEOUT, "Timeout");
            };
          }
          xhr.open(options.method || "POST", options.url, true);
          xhr.onreadystatechange = function() {
            try {
              if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                  Utils2.callExternal(log, "ajax.success", options.success, JSON.parse(xhr.responseText));
                } else {
                  log.warn("ajax -> request to " + options.url + " failed with status " + xhr.status + " (" + xhr.statusText + ")");
                  Utils2.callExternal(log, "ajax.error", options.error, xhr.status, xhr.statusText);
                }
              }
            } catch (e) {
              log.warn("ajax -> request to " + options.url + " failed with an exception: " + e.message);
              if (options.error)
                options.error(417, e.message, null);
            }
            if (xhr.readyState === 4)
              Utils2.callExternal(log, "ajax.done", doneCb);
          };
          const customHeaders = options.customHeaders;
          if (customHeaders) {
            Object.keys(customHeaders).forEach(function(header) {
              log.debug("ajax -> adding custom header: " + header);
              xhr.setRequestHeader(header, customHeaders[header]);
            });
          }
          xhr.setRequestHeader("Accept", "application/json");
          log.debug("ajax -> send request to " + options.url);
          if (options.data) {
            xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            xhr.send(JSON.stringify(options.data));
          } else {
            xhr.send();
          }
          return {
            done: function(cb) {
              doneCb = cb;
              return this;
            }
          };
        }
        Utils2.ajax = ajax;
        function ajaxWithHttpPlugin(log, options) {
          let doneCb = function() {
          };
          const ajaxOptions = {
            method: (options.method || "get").toLowerCase(),
            data: options.data,
            serializer: "json"
            // responseType: 'json',
          };
          if (options.customHeaders) {
            log.debug("ajax[http] -> adding custom headers: " + JSON.stringify(options.customHeaders));
            ajaxOptions.headers = options.customHeaders;
          }
          log.debug("ajax[http] -> send request to " + options.url);
          const ajaxDone = (response) => {
            try {
              if (response.status == 200) {
                Utils2.callExternal(log, "ajax.success", options.success, JSON.parse(response.data));
              } else {
                log.warn("ajax[http] -> request to " + options.url + " failed with status " + response.status + " (" + response.error + ")");
                Utils2.callExternal(log, "ajax.error", options.error, response.status, response.error);
              }
            } catch (e) {
              log.warn("ajax[http] -> request to " + options.url + " failed with an exception: " + e.message);
              if (options.error)
                Utils2.callExternal(log, "ajax.error", options.error, 417, e.message);
            }
            Utils2.callExternal(log, "ajax.done", doneCb);
          };
          window.cordova.plugin.http.sendRequest(options.url, ajaxOptions, ajaxDone, ajaxDone);
          return {
            done: function(cb) {
              doneCb = cb;
              return this;
            }
          };
        }
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function callExternal(log, name, callback, ...args) {
          try {
            const args2 = Array.prototype.slice.call(arguments, 3);
            if (callback)
              callback.apply(CdvPurchase2.store, args2);
          } catch (e) {
            log.logCallbackException(name, e);
          }
        }
        Utils2.callExternal = callExternal;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function delay(fn, milliseconds) {
          return setTimeout(fn, milliseconds);
        }
        Utils2.delay = delay;
        function debounce(fn, milliseconds) {
          return createDebouncer(fn, milliseconds).call;
        }
        Utils2.debounce = debounce;
        function createDebouncer(fn, milliseconds) {
          let timeout = null;
          let waiting = [];
          const later = function(context, args) {
            const toCall = waiting;
            waiting = [];
            timeout = null;
            fn();
            toCall.forEach((fn2) => fn2());
          };
          const debounced = function() {
            if (timeout)
              window.clearTimeout(timeout);
            timeout = setTimeout(later, milliseconds);
          };
          return {
            call: debounced,
            wait: () => new Promise((resolve) => {
              if (timeout)
                waiting.push(resolve);
              else
                resolve();
            })
          };
        }
        Utils2.createDebouncer = createDebouncer;
        function asyncDelay(milliseconds) {
          return new Promise((resolve) => setTimeout(resolve, milliseconds));
        }
        Utils2.asyncDelay = asyncDelay;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function formatBillingCycleEN(pricingPhase) {
          switch (fixedRecurrenceMode(pricingPhase)) {
            case CdvPurchase2.RecurrenceMode.FINITE_RECURRING:
              return `${pricingPhase.billingCycles}x ${Utils2.formatDurationEN(pricingPhase.billingPeriod)}`;
            case CdvPurchase2.RecurrenceMode.NON_RECURRING:
              return "for " + Utils2.formatDurationEN(pricingPhase.billingPeriod);
            default:
              return "every " + Utils2.formatDurationEN(pricingPhase.billingPeriod, { omitOne: true });
          }
        }
        Utils2.formatBillingCycleEN = formatBillingCycleEN;
        function fixedRecurrenceMode(pricingPhase) {
          var _a;
          const cycles = (_a = pricingPhase.billingCycles) !== null && _a !== void 0 ? _a : 0;
          if (pricingPhase.recurrenceMode === CdvPurchase2.RecurrenceMode.FINITE_RECURRING) {
            if (cycles == 1)
              return CdvPurchase2.RecurrenceMode.NON_RECURRING;
            if (cycles <= 0)
              return CdvPurchase2.RecurrenceMode.INFINITE_RECURRING;
          }
          return pricingPhase.recurrenceMode;
        }
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function formatDurationEN(iso, options) {
          if (!iso)
            return "";
          const l = iso.length;
          const n = iso.slice(1, l - 1);
          if (n === "1") {
            if (options === null || options === void 0 ? void 0 : options.omitOne) {
              return { "D": "day", "W": "week", "M": "month", "Y": "year" }[iso[l - 1]] || iso[l - 1];
            } else {
              return { "D": "1 day", "W": "1 week", "M": "1 month", "Y": "1 year" }[iso[l - 1]] || iso[l - 1];
            }
          } else {
            const u = { "D": "days", "W": "weeks", "M": "months", "Y": "years" }[iso[l - 1]] || iso[l - 1];
            return `${n} ${u}`;
          }
        }
        Utils2.formatDurationEN = formatDurationEN;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        const HEX2STR = "0123456789abcdef".split("");
        function toHexString(r) {
          for (var n = "", e = 0; e < 4; e++)
            n += HEX2STR[r >> 8 * e + 4 & 15] + HEX2STR[r >> 8 * e & 15];
          return n;
        }
        function hexStringFromArray(array) {
          const out = [];
          for (var arrayLength = array.length, i = 0; i < arrayLength; i++)
            out.push(toHexString(array[i]));
          return out.join("");
        }
        function add32(r, n) {
          return r + n & 4294967295;
        }
        function complexShift(r, n, e, t, o, u, shiftFunction) {
          function shiftAdd32(op0, op1, v1) {
            return add32(op0 << op1 | op0 >>> 32 - op1, v1);
          }
          function add32x4(i0, i1, j0, j1) {
            return add32(add32(i1, i0), add32(j0, j1));
          }
          return shiftAdd32(add32x4(r, n, t, u), o, e);
        }
        var step1Function = function(shiftFunction, n, e, t, o, u, f, a) {
          return complexShift(e & t | ~e & o, n, e, u, f, a, shiftFunction);
        };
        var step2Function = function(shiftFunction, n, e, t, o, u, f, a) {
          return complexShift(e & o | t & ~o, n, e, u, f, a, shiftFunction);
        };
        var step3Function = function(shiftFunction, n, e, t, o, u, f, a) {
          return complexShift(e ^ t ^ o, n, e, u, f, a, shiftFunction);
        };
        var step4Function = function(shiftFunction, n, e, t, o, u, f, a) {
          return complexShift(t ^ (e | ~o), n, e, u, f, a, shiftFunction);
        };
        function hashStep(inOutVec4, strAsInts, shiftFunction) {
          if (!shiftFunction)
            shiftFunction = add32;
          let v0 = inOutVec4[0];
          let v1 = inOutVec4[1];
          let v2 = inOutVec4[2];
          let v3 = inOutVec4[3];
          var step1 = step1Function.bind(null, shiftFunction);
          v0 = step1(v0, v1, v2, v3, strAsInts[0], 7, -680876936);
          v3 = step1(v3, v0, v1, v2, strAsInts[1], 12, -389564586);
          v2 = step1(v2, v3, v0, v1, strAsInts[2], 17, 606105819);
          v1 = step1(v1, v2, v3, v0, strAsInts[3], 22, -1044525330);
          v0 = step1(v0, v1, v2, v3, strAsInts[4], 7, -176418897);
          v3 = step1(v3, v0, v1, v2, strAsInts[5], 12, 1200080426);
          v2 = step1(v2, v3, v0, v1, strAsInts[6], 17, -1473231341);
          v1 = step1(v1, v2, v3, v0, strAsInts[7], 22, -45705983);
          v0 = step1(v0, v1, v2, v3, strAsInts[8], 7, 1770035416);
          v3 = step1(v3, v0, v1, v2, strAsInts[9], 12, -1958414417);
          v2 = step1(v2, v3, v0, v1, strAsInts[10], 17, -42063);
          v1 = step1(v1, v2, v3, v0, strAsInts[11], 22, -1990404162);
          v0 = step1(v0, v1, v2, v3, strAsInts[12], 7, 1804603682);
          v3 = step1(v3, v0, v1, v2, strAsInts[13], 12, -40341101);
          v2 = step1(v2, v3, v0, v1, strAsInts[14], 17, -1502002290);
          v1 = step1(v1, v2, v3, v0, strAsInts[15], 22, 1236535329);
          var step2 = step2Function.bind(null, shiftFunction);
          v0 = step2(v0, v1, v2, v3, strAsInts[1], 5, -165796510);
          v3 = step2(v3, v0, v1, v2, strAsInts[6], 9, -1069501632);
          v2 = step2(v2, v3, v0, v1, strAsInts[11], 14, 643717713);
          v1 = step2(v1, v2, v3, v0, strAsInts[0], 20, -373897302);
          v0 = step2(v0, v1, v2, v3, strAsInts[5], 5, -701558691);
          v3 = step2(v3, v0, v1, v2, strAsInts[10], 9, 38016083);
          v2 = step2(v2, v3, v0, v1, strAsInts[15], 14, -660478335);
          v1 = step2(v1, v2, v3, v0, strAsInts[4], 20, -405537848);
          v0 = step2(v0, v1, v2, v3, strAsInts[9], 5, 568446438);
          v3 = step2(v3, v0, v1, v2, strAsInts[14], 9, -1019803690);
          v2 = step2(v2, v3, v0, v1, strAsInts[3], 14, -187363961);
          v1 = step2(v1, v2, v3, v0, strAsInts[8], 20, 1163531501);
          v0 = step2(v0, v1, v2, v3, strAsInts[13], 5, -1444681467);
          v3 = step2(v3, v0, v1, v2, strAsInts[2], 9, -51403784);
          v2 = step2(v2, v3, v0, v1, strAsInts[7], 14, 1735328473);
          v1 = step2(v1, v2, v3, v0, strAsInts[12], 20, -1926607734);
          var step3 = step3Function.bind(null, shiftFunction);
          v0 = step3(v0, v1, v2, v3, strAsInts[5], 4, -378558);
          v3 = step3(v3, v0, v1, v2, strAsInts[8], 11, -2022574463);
          v2 = step3(v2, v3, v0, v1, strAsInts[11], 16, 1839030562);
          v1 = step3(v1, v2, v3, v0, strAsInts[14], 23, -35309556);
          v0 = step3(v0, v1, v2, v3, strAsInts[1], 4, -1530992060);
          v3 = step3(v3, v0, v1, v2, strAsInts[4], 11, 1272893353);
          v2 = step3(v2, v3, v0, v1, strAsInts[7], 16, -155497632);
          v1 = step3(v1, v2, v3, v0, strAsInts[10], 23, -1094730640);
          v0 = step3(v0, v1, v2, v3, strAsInts[13], 4, 681279174);
          v3 = step3(v3, v0, v1, v2, strAsInts[0], 11, -358537222);
          v2 = step3(v2, v3, v0, v1, strAsInts[3], 16, -722521979);
          v1 = step3(v1, v2, v3, v0, strAsInts[6], 23, 76029189);
          v0 = step3(v0, v1, v2, v3, strAsInts[9], 4, -640364487);
          v3 = step3(v3, v0, v1, v2, strAsInts[12], 11, -421815835);
          v2 = step3(v2, v3, v0, v1, strAsInts[15], 16, 530742520);
          v1 = step3(v1, v2, v3, v0, strAsInts[2], 23, -995338651);
          var step4 = step4Function.bind(null, shiftFunction);
          v0 = step4(v0, v1, v2, v3, strAsInts[0], 6, -198630844);
          v3 = step4(v3, v0, v1, v2, strAsInts[7], 10, 1126891415);
          v2 = step4(v2, v3, v0, v1, strAsInts[14], 15, -1416354905);
          v1 = step4(v1, v2, v3, v0, strAsInts[5], 21, -57434055);
          v0 = step4(v0, v1, v2, v3, strAsInts[12], 6, 1700485571);
          v3 = step4(v3, v0, v1, v2, strAsInts[3], 10, -1894986606);
          v2 = step4(v2, v3, v0, v1, strAsInts[10], 15, -1051523);
          v1 = step4(v1, v2, v3, v0, strAsInts[1], 21, -2054922799);
          v0 = step4(v0, v1, v2, v3, strAsInts[8], 6, 1873313359);
          v3 = step4(v3, v0, v1, v2, strAsInts[15], 10, -30611744);
          v2 = step4(v2, v3, v0, v1, strAsInts[6], 15, -1560198380);
          v1 = step4(v1, v2, v3, v0, strAsInts[13], 21, 1309151649);
          v0 = step4(v0, v1, v2, v3, strAsInts[4], 6, -145523070);
          v3 = step4(v3, v0, v1, v2, strAsInts[11], 10, -1120210379);
          v2 = step4(v2, v3, v0, v1, strAsInts[2], 15, 718787259);
          v1 = step4(v1, v2, v3, v0, strAsInts[9], 21, -343485551);
          inOutVec4[0] = shiftFunction(v0, inOutVec4[0]);
          inOutVec4[1] = shiftFunction(v1, inOutVec4[1]);
          inOutVec4[2] = shiftFunction(v2, inOutVec4[2]);
          inOutVec4[3] = shiftFunction(v3, inOutVec4[3]);
        }
        ;
        function stringToIntArray(r) {
          for (var ret = [], e = 0; e < 64; e += 4)
            ret[e >> 2] = r.charCodeAt(e) + (r.charCodeAt(e + 1) << 8) + (r.charCodeAt(e + 2) << 16) + (r.charCodeAt(e + 3) << 24);
          return ret;
        }
        function computeMD5(str, shiftFunction) {
          let lastCharIndex;
          const strLength = str.length;
          const vec4 = [1732584193, -271733879, -1732584194, 271733878];
          for (lastCharIndex = 64; lastCharIndex <= strLength; lastCharIndex += 64)
            hashStep(vec4, stringToIntArray(str.substring(lastCharIndex - 64, lastCharIndex)), shiftFunction);
          const vec16 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          const reminderLength = (str = str.substring(lastCharIndex - 64)).length;
          let vec16Index;
          for (vec16Index = 0; vec16Index < reminderLength; vec16Index++)
            vec16[vec16Index >> 2] |= str.charCodeAt(vec16Index) << (vec16Index % 4 << 3);
          vec16[vec16Index >> 2] |= 128 << (vec16Index % 4 << 3);
          if (vec16Index > 55) {
            hashStep(vec4, vec16, shiftFunction);
            for (vec16Index = 16; vec16Index--; )
              vec16[vec16Index] = 0;
          }
          vec16[14] = 8 * strLength;
          hashStep(vec4, vec16, shiftFunction);
          return vec4;
        }
        ;
        function md5(str) {
          if (!str)
            return "";
          let shiftFunction;
          if ("5d41402abc4b2a76b9719d911017c592" !== hexStringFromArray(computeMD5("hello")))
            shiftFunction = function(r, n) {
              const e = (65535 & r) + (65535 & n);
              return (r >> 16) + (n >> 16) + (e >> 16) << 16 | 65535 & e;
            };
          return hexStringFromArray(computeMD5(str, shiftFunction));
        }
        Utils2.md5 = md5;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function platformId() {
          var _a, _b, _c;
          if ((_a = window.cordova) === null || _a === void 0 ? void 0 : _a.platformId)
            return (_b = window.cordova) === null || _b === void 0 ? void 0 : _b.platformId;
          if ((_c = window.Capacitor) === null || _c === void 0 ? void 0 : _c.getPlatform)
            return window.Capacitor.getPlatform();
          return "web";
        }
        Utils2.platformId = platformId;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function safeCallback(logger, className, callback, callbackName, reason) {
          return function(value) {
            safeCall(logger, className, callback, value, callbackName, reason);
          };
        }
        Utils2.safeCallback = safeCallback;
        function safeCall(logger, className, callback, value, callbackName, reason) {
          if (!callback) {
            return;
          }
          if (!callbackName) {
            callbackName = callback.name || "#" + Utils2.md5(callback.toString());
          }
          setTimeout(() => {
            try {
              logger.debug(`Calling callback: type=${className} name=${callbackName} reason=${reason}`);
              callback(value);
            } catch (error) {
              logger.error(`Error in callback: type=${className} name=${callbackName} reason=${reason}`);
              logger.debug(callback.toString());
              const errorAsError = error;
              if ("message" in errorAsError)
                logger.error(errorAsError.message);
              if ("fileName" in error)
                logger.error("in " + error.fileName + ":" + error.lineNumber);
              if ("stack" in errorAsError)
                logger.error(errorAsError.stack);
            }
          }, 0);
        }
        Utils2.safeCall = safeCall;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Utils;
      (function(Utils2) {
        function getCryptoExtension() {
          return window.crypto || window.msCrypto;
        }
        function uuidv4() {
          return ("10000000-1000-4000-8000" + -1e11).replace(/[018]/g, function(c) {
            return (c ^ getCryptoExtension().getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
          });
        }
        Utils2.uuidv4 = uuidv4;
      })(Utils = CdvPurchase2.Utils || (CdvPurchase2.Utils = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Validator;
      (function(Validator2) {
        let Internal;
        (function(Internal2) {
          function isArray(arg) {
            return Object.prototype.toString.call(arg) === "[object Array]";
          }
          function isObject(arg) {
            return Object.prototype.toString.call(arg) === "[object Object]";
          }
          function getPrivacyPolicy(store) {
            if (typeof store.validator_privacy_policy === "string")
              return store.validator_privacy_policy.split(",");
            else if (isArray(store.validator_privacy_policy))
              return store.validator_privacy_policy;
            else
              return ["analytics", "support", "fraud"];
          }
          function getDeviceInfo(store) {
            const privacyPolicy = getPrivacyPolicy(store);
            function allowed(policy) {
              return privacyPolicy.indexOf(policy) >= 0;
            }
            const ret = {
              plugin: "cordova-plugin-purchase/" + CdvPurchase2.PLUGIN_VERSION
            };
            const wdw = window;
            const device = isObject(wdw.device) ? wdw.device : {};
            if (allowed("analytics") || allowed("support")) {
              const ionic = wdw.Ionic || wdw.ionic;
              if (ionic && ionic.version)
                ret.ionic = ionic.version;
              if (device.cordova)
                ret.cordova = device.cordova;
              if (device.model)
                ret.model = device.model;
              if (device.platform)
                ret.platform = device.platform;
              if (device.version)
                ret.version = device.version;
              if (device.manufacturer)
                ret.manufacturer = device.manufacturer;
            }
            if (allowed("tracking")) {
              if (device.serial)
                ret.serial = device.serial;
              if (device.uuid)
                ret.uuid = device.uuid;
            }
            if (device.isVirtual)
              ret.isVirtual = device.isVirtual;
            if (allowed("fraud")) {
              var fingerprint = "";
              if (device.serial)
                fingerprint = "serial:" + device.serial;
              else if (device.uuid)
                fingerprint = "uuid:" + device.uuid;
              else {
                if (device.model)
                  fingerprint += "/" + device.model;
                if (device.manufacturer)
                  fingerprint = "/" + device.manufacturer;
              }
              if (fingerprint)
                ret.fingerprint = CdvPurchase2.Utils.md5(fingerprint);
            }
            return ret;
          }
          Internal2.getDeviceInfo = getDeviceInfo;
        })(Internal = Validator2.Internal || (Validator2.Internal = {}));
      })(Validator = CdvPurchase2.Validator || (CdvPurchase2.Validator = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      let Validator;
      (function(Validator2) {
        let Request;
        /* @__PURE__ */ (function(Request2) {
          ;
        })(Request = Validator2.Request || (Validator2.Request = {}));
      })(Validator = CdvPurchase2.Validator || (CdvPurchase2.Validator = {}));
    })(CdvPurchase || (CdvPurchase = {}));
    var CdvPurchase;
    (function(CdvPurchase2) {
      class VerifiedReceipt {
        /**
         * @internal
         */
        constructor(receipt, response, decorator) {
          var _a;
          this.className = "VerifiedReceipt";
          this.id = response.id;
          this.sourceReceipt = receipt;
          this.collection = (_a = response.collection) !== null && _a !== void 0 ? _a : [];
          this.latestReceipt = response.latest_receipt;
          this.nativeTransactions = [response.transaction];
          this.warning = response.warning;
          this.validationDate = response.date ? new Date(response.date) : /* @__PURE__ */ new Date();
          Object.defineProperty(this, "raw", { "enumerable": false, get() {
            return response;
          } });
          Object.defineProperty(this, "finish", { "enumerable": false, get() {
            return () => decorator.finish(this);
          } });
        }
        /** Platform this receipt originated from */
        get platform() {
          return this.sourceReceipt.platform;
        }
        /** Get raw response data from the receipt validation request */
        get raw() {
          return {};
        }
        // actual implementation as "defineProperty" in constructor.
        /**
         * Update the receipt content
         *
         * @internal
         */
        set(receipt, response) {
          var _a;
          this.id = response.id;
          this.sourceReceipt = receipt;
          this.collection = (_a = response.collection) !== null && _a !== void 0 ? _a : [];
          this.latestReceipt = response.latest_receipt;
          this.nativeTransactions = [response.transaction];
          this.warning = response.warning;
        }
        /** Finish all transactions in the receipt */
        finish() {
          return __awaiter(this, void 0, void 0, function* () {
          });
        }
      }
      CdvPurchase2.VerifiedReceipt = VerifiedReceipt;
    })(CdvPurchase || (CdvPurchase = {}));
  }
});
export default require_store();
//# sourceMappingURL=cordova-plugin-purchase.js.map
