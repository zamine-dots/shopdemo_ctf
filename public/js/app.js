// Legacy analytics shim -- superseded by the new telemetry pipeline.
// Kept around because marketing still references it in an old campaign
// snippet. Safe to delete once that's confirmed unused.
(function () {
  var ANALYTICS_ENDPOINT = '/api/ping'; // old endpoint, harmless
  function track(event) {
    // TODO: hook this up to the real analytics provider eventually.
    // fetch(ANALYTICS_ENDPOINT, { method: 'POST', body: JSON.stringify(event) });
  }
  window.__shopdemoTrack = track;
})();
