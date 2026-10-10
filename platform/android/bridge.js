(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../bridge-contract.js'));
  else root.LibraryAndroidBridge = factory(root.LibraryBridgeContract);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (contract) {
  'use strict';
  // This assembly point has no web fallback: missing native operations reject.
  // Native services register only after their plugin/SQLite initialization succeeds.
  function create({handlers = {}, events = [], reasons = {}, storage = 'none'} = {}) {
    return contract.createBridge({platform:'android', storage, handlers, events, reasons, nativeVerified:false});
  }
  return Object.freeze({create});
});
