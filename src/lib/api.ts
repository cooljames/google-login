export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  let token = null;
  try {
    token = localStorage.getItem('auth_token');
  } catch (e) {
    console.warn('localStorage is not available:', e);
  }
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    headers,
  });
};
