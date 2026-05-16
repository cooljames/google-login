let inMemoryToken: string | null = null;

export const setToken = (token: string | null) => {
  inMemoryToken = token;
  try {
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  } catch (e) {
    console.warn('localStorage is not available:', e);
  }
};

export const getToken = (): string | null => {
  if (inMemoryToken) return inMemoryToken;
  try {
    return localStorage.getItem('auth_token');
  } catch (e) {
    return null;
  }
};

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    credentials: 'include',
    ...init,
    headers,
  });
};
