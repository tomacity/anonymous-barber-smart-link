(() => {
  const PROJECT_KEY = "a103498c-c713-4920-b9ae-fc6b5009ffed";
  const ENDPOINT = "https://zistogr.vercel.app/api/track";
  function makeId(prefix) {
    return prefix + "_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2));
  }
  function storedId(storage, key, prefix) {
    try {
      let id = storage.getItem(key);
      if (!id) { id = makeId(prefix); storage.setItem(key, id); }
      return id;
    } catch { return makeId(prefix); }
  }
  const visitorId = storedId(localStorage, "zisto_visitor_id", "zv");
  const sessionId = storedId(sessionStorage, "zisto_session_id", "zs");
  const ua = navigator.userAgent;
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobile|iphone|ipod|android/i.test(ua) ? "mobile" : "desktop";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Other";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Macintosh|Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Other";
  const params = new URLSearchParams(location.search);
  function track(eventType, metadata = {}) {
    const payload = {
      project_key: PROJECT_KEY,
      event_type: eventType,
      session_id: sessionId,
      visitor_id: visitorId,
      page_url: location.href,
      page_path: location.pathname,
      referrer: document.referrer || null,
      device_type: device,
      browser,
      operating_system: os,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      utm_content: params.get("utm_content"),
      utm_term: params.get("utm_term"),
      metadata: { source: params.get("source") || params.get("utm_source") || "direct", ...metadata }
    };
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(r => { if (!r.ok) console.warn("Zisto tracking HTTP", r.status); })
      .catch(err => console.warn("Zisto tracking failed:", err));
  }
  window.Zisto = { ...(window.Zisto || {}), track };
  track("page_view");
  document.querySelectorAll(".js-book").forEach(button => {
    button.addEventListener("click", () => track("button_click", { action: "booking_open", placement: button.textContent.trim().slice(0, 80) }));
  });
})();