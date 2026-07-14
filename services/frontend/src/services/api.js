import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach bearer token automatically if present
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const authAPI = {
  login: async (username, password) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
    }
    return response.data;
  },
  register: async (username, email, password, role = 'operator') => {
    const response = await api.post('/auth/register', { username, email, password, role });
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  logout: () => {
    localStorage.removeItem('token');
  },
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  }
};

export const serversAPI = {
  getServers: async (status) => {
    const response = await api.get('/servers', { params: { status } });
    return response.data;
  },
  getServer: async (id) => {
    const response = await api.get(`/servers/${id}`);
    return response.data;
  },
  createServer: async (data) => {
    const response = await api.post('/servers', data);
    return response.data;
  },
  updateServer: async (id, data) => {
    const response = await api.put(`/servers/${id}`, data);
    return response.data;
  },
  deleteServer: async (id) => {
    const response = await api.delete(`/servers/${id}`);
    return response.data;
  }
};

export const metricsAPI = {
  getMetrics: async (serverId, limit = 100) => {
    const response = await api.get('/metrics', {
      params: { server_id: serverId, limit }
    });
    return response.data;
  },
  logMetric: async (data) => {
    const response = await api.post('/metrics', data);
    return response.data;
  }
};

export const incidentsAPI = {
  getIncidents: async (filters = {}) => {
    const response = await api.get('/incidents', { params: filters });
    return response.data;
  },
  getIncident: async (id) => {
    const response = await api.get(`/incidents/${id}`);
    return response.data;
  },
  updateIncident: async (id, data) => {
    const response = await api.put(`/incidents/${id}`, data);
    return response.data;
  },
  acknowledgeIncident: async (id, notes = "") => {
    const response = await api.put(`/incidents/${id}`, {
      acknowledged: true,
      notes
    });
    return response.data;
  },
  resolveIncident: async (id, notes = "") => {
    const response = await api.put(`/incidents/${id}`, {
      resolved: true,
      notes
    });
    return response.data;
  }
};

export const predictionsAPI = {
  runPrediction: async (serverId, includeForecast = true, includeAnomaly = true, includeClassification = true) => {
    const response = await api.post('/predictions', {
      server_id: serverId,
      include_forecast: includeForecast,
      include_anomaly_detection: includeAnomaly,
      include_classification: includeClassification
    });
    return response.data;
  }
};

export default api;
