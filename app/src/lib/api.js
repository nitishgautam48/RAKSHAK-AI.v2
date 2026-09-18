const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let currentToken = null;
export function setAuthToken(token) {
  currentToken = token;
  if (token) localStorage.setItem('tsa_token', token);
  else localStorage.removeItem('tsa_token');
}
export function getAuthToken() {
  if (currentToken) return currentToken;
  currentToken = localStorage.getItem('tsa_token');
  return currentToken;
}

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, formData, headers = {} } = {}) {
  const token = getAuthToken();
  const opts = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(formData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  };
  if (formData) opts.body = formData;
  else if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  postForm: (path, formData) => request(path, { method: 'POST', formData }),
  // Auth-header-gated file downloads (a plain <a href> can't attach a Bearer
  // token) - fetches the bytes and hands back a blob: URL the caller revokes
  // once done with it (e.g. after opening/downloading).
  getBlob: async (path) => {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    return URL.createObjectURL(await res.blob());
  },
};

export { ApiError, API_BASE };
