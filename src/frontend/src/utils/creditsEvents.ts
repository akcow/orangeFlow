const CREDITS_REFRESH_EVENT = "credits:refresh";

export function dispatchCreditsRefreshEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
}

export function subscribeCreditsRefresh(handler: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(CREDITS_REFRESH_EVENT, handler);
  return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler);
}
