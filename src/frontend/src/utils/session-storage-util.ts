export const getSessionStorage = (key: string) => {
  return sessionStorage.getItem(key);
};

export const setSessionStorage = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    console.warn(
      `[session-storage-util] sessionStorage.setItem("${key}") failed (quota/security). Skipping.`,
    );
  }
};

export const removeSessionStorage = (key: string) => {
  sessionStorage.removeItem(key);
};
