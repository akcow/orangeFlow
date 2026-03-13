export const getLocalStorage = (key: string) => {
  return localStorage.getItem(key);
};

export const setLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    console.warn(
      `[local-storage-util] localStorage.setItem("${key}") failed (quota/security). Skipping.`,
    );
  }
};

export const removeLocalStorage = (key: string) => {
  localStorage.removeItem(key);
};
