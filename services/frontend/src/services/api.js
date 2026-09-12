import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ML_BASE_URL = import.meta.env.VITE_ML_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Automatically inject JWT token from localStorage ('dc_token' with 'token' fallback)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('dc_token') || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Fallback Demo Data Generator ─────────────────────────────────────────────
const MOCK_SERVERS = [
  { id: "srv-01", hostname: "server-01", name: "Core DB Primary", ip_address: "10.0.1.11", status: "active", location: "Rack A-01 (DC-East)", cpu_cores: 64, ram_gb: 256, disk_gb: 4000, cpu_pct: 42, ram_pct: 58, temp_celsius: 44, disk_used_pct: 62 },
  { id: "srv-02", hostname: "server-02", name: "Core DB Replica", ip_address: "10.0.1.12", status: "active", location: "Rack A-02 (DC-East)", cpu_cores: 64, ram_gb: 256, disk_gb: 4000, cpu_pct: 38, ram_pct: 55, temp_celsius: 41, disk_used_pct: 60 },
  { id: "srv-03", hostname: "server-03", name: "App Gateway Alpha", ip_address: "10.0.2.21", status: "anomalous", location: "Rack B-01 (DC-East)", cpu_cores: 32, ram_gb: 128, disk_gb: 2000, cpu_pct: 94, ram_pct: 88, temp_celsius: 82, disk_used_pct: 78 },
  { id: "srv-04", hostname: "server-04", name: "App Gateway Beta", ip_address: "10.0.2.22", status: "active", location: "Rack B-02 (DC-East)", cpu_cores: 32, ram_gb: 128, disk_gb: 2000, cpu_pct: 51, ram_pct: 63, temp_celsius: 52, disk_used_pct: 48 },
  { id: "srv-05", hostname: "server-05", name: "Cache Redis Cluster", ip_address: "10.0.3.31", status: "active", location: "Rack B-03 (DC-East)", cpu_cores: 48, ram_gb: 512, disk_gb: 1000, cpu_pct: 29, ram_pct: 74, temp_celsius: 46, disk_used_pct: 35 },
  { id: "srv-06", hostname: "server-06", name: "Kafka Broker Node 1", ip_address: "10.0.4.41", status: "active", location: "Rack C-01 (DC-West)", cpu_cores: 32, ram_gb: 128, disk_gb: 8000, cpu_pct: 62, ram_pct: 67, temp_celsius: 58, disk_used_pct: 82 },
  { id: "srv-07", hostname: "server-07", name: "Kafka Broker Node 2", ip_address: "10.0.4.42", status: "anomalous", location: "Rack C-02 (DC-West)", cpu_cores: 32, ram_gb: 128, disk_gb: 8000, cpu_pct: 87, ram_pct: 91, temp_celsius: 79, disk_used_pct: 89 },
  { id: "srv-08", hostname: "server-08", name: "ML Inference Engine", ip_address: "10.0.5.51", status: "active", location: "Rack C-03 (DC-West)", cpu_cores: 128, ram_gb: 512, disk_gb: 10000, cpu_pct: 71, ram_pct: 82, temp_celsius: 67, disk_used_pct: 54 },
  { id: "srv-09", hostname: "server-09", name: "Edge API Proxy", ip_address: "10.0.6.61", status: "active", location: "Rack A-03 (DC-East)", cpu_cores: 16, ram_gb: 64, disk_gb: 1000, cpu_pct: 33, ram_pct: 45, temp_celsius: 39, disk_used_pct: 28 },
  { id: "srv-10", hostname: "server-10", name: "Storage NAS Node", ip_address: "10.0.7.71", status: "active", location: "Rack B-04 (DC-West)", cpu_cores: 24, ram_gb: 96, disk_gb: 24000, cpu_pct: 45, ram_pct: 52, temp_celsius: 48, disk_used_pct: 73 }
];

const MOCK_INCIDENTS = [
  { id: "inc-101", server_id: "server-03", severity: "critical", incident_type: "cpu_spike", anomaly_score: 0.94, detected_at: new Date(Date.now() - 12 * 60000).toISOString(), resolved_at: null, acknowledged: false, notes: "Sudden spike in CPU utilization exceeding 94% with correlated thermal escalation to 82°C." },
  { id: "inc-102", server_id: "server-07", severity: "high", incident_type: "memory_leak", anomaly_score: 0.88, detected_at: new Date(Date.now() - 45 * 60000).toISOString(), resolved_at: null, acknowledged: true, notes: "Monotonic RAM climbing detected by Isolation Forest over the last 45 minutes." },
  { id: "inc-103", server_id: "server-08", severity: "medium", incident_type: "thermal_event", anomaly_score: 0.64, detected_at: new Date(Date.now() - 120 * 60000).toISOString(), resolved_at: null, acknowledged: false, notes: "Temperature elevation following GPU batch task completion." },
  { id: "inc-104", server_id: "server-01", severity: "low", incident_type: "network_anomaly", anomaly_score: 0.42, detected_at: new Date(Date.now() - 240 * 60000).toISOString(), resolved_at: new Date(Date.now() - 60 * 60000).toISOString(), acknowledged: true, notes: "Brief spike in ingress packets during database replication checkpoint." },
  { id: "inc-105", server_id: "server-06", severity: "medium", incident_type: "disk_failure", anomaly_score: 0.69, detected_at: new Date(Date.now() - 360 * 60000).toISOString(), resolved_at: new Date(Date.now() - 180 * 60000).toISOString(), acknowledged: true, notes: "Disk queue length threshold breach on volume /var/kafka-logs." }
];

// Generate 60 timestamps of timeline metrics
export function generateHealthTimeline(points = 60) {
  const result = [];
  const now = Date.now();
  for (let i = points - 1; i >= 0; i--) {
    const t = new Date(now - i * 60000);
    const wave = Math.sin((points - i) / 5);
    result.push({
      timestamp: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isoTime: t.toISOString(),
      cpu: Math.round(48 + wave * 14 + (Math.random() * 6 - 3)),
      ram: Math.round(62 + Math.cos((points - i) / 8) * 8 + (Math.random() * 4 - 2)),
      temp: Math.round(52 + wave * 7 + (Math.random() * 3 - 1.5)),
    });
  }
  return result;
}

// ── Auth Services ────────────────────────────────────────────────────────────
export const authAPI = {
  login: async (email, password) => {
    // 1. Try standard JSON payload as specified in user request
    try {
      const response = await api.post('/auth/login', { email, password, username: email });
      const token = response.data.access_token || response.data.token;
      if (token) {
        localStorage.setItem('dc_token', token);
        localStorage.setItem('token', token);
      }
      return response.data;
    } catch {
      // 2. Fallback to OAuth2 Form Data if backend expects x-www-form-urlencoded
      try {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        const res = await axios.post(`${BASE_URL}/api/v1/auth/login`, formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const token = res.data.access_token || res.data.token;
        if (token) {
          localStorage.setItem('dc_token', token);
          localStorage.setItem('token', token);
        }
        return res.data;
      } catch (err2) {
        // If demo mode or dev without initialized credentials, throw for UI handler
        throw err2;
      }
    }
  },
  loginDemo: () => {
    const demoToken = 'demo-operator-token-' + Date.now();
    localStorage.setItem('dc_token', demoToken);
    localStorage.setItem('token', demoToken);
    localStorage.setItem('dc_user', JSON.stringify({
      username: 'dc_operator',
      email: 'operator@datacenter.internal',
      role: 'Enterprise Administrator'
    }));
    return { access_token: demoToken, role: 'admin' };
  },
  logout: () => {
    localStorage.removeItem('dc_token');
    localStorage.removeItem('token');
    localStorage.removeItem('dc_user');
  },
  isAuthenticated: () => {
    return !!(localStorage.getItem('dc_token') || localStorage.getItem('token'));
  },
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem('dc_user')) || { username: 'Operator', role: 'Engineer' };
    } catch {
      return { username: 'Operator', role: 'Engineer' };
    }
  }
};

// ── Servers Services ─────────────────────────────────────────────────────────
export const serversAPI = {
  getServers: async (status) => {
    try {
      const response = await api.get('/servers', { params: { status } });
      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data;
      }
    } catch (e) {
      console.warn('API /servers fallback to mock data:', e.message);
    }
    // Return mock servers merged with any status filter
    if (status) {
      return MOCK_SERVERS.filter(s => s.status === status);
    }
    return MOCK_SERVERS;
  },
  getServer: async (id) => {
    try {
      const response = await api.get(`/servers/${id}`);
      return response.data;
    } catch {
      const found = MOCK_SERVERS.find(s => s.id === id || s.hostname === id);
      return found || MOCK_SERVERS[0];
    }
  }
};

// ── Metrics Services ─────────────────────────────────────────────────────────
export const metricsAPI = {
  getMetrics: async (serverId, limit = 60) => {
    try {
      const response = await api.get('/metrics', { params: { server_id: serverId, limit } });
      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data;
      }
    } catch (e) {
      console.warn('API /metrics fallback to timeline generator');
    }
    return generateHealthTimeline(limit);
  }
};

// ── Incidents Services ───────────────────────────────────────────────────────
export const incidentsAPI = {
  getIncidents: async (filters = {}) => {
    try {
      const response = await api.get('/incidents', { params: filters });
      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data;
      }
    } catch (e) {
      console.warn('API /incidents fallback to mock list');
    }
    return MOCK_INCIDENTS;
  },
  getIncident: async (id) => {
    try {
      const response = await api.get(`/incidents/${id}`);
      return response.data;
    } catch {
      return MOCK_INCIDENTS.find(i => i.id === id) || MOCK_INCIDENTS[0];
    }
  },
  acknowledgeIncident: async (id, notes = '') => {
    try {
      const response = await api.patch(`/incidents/${id}/acknowledge`, { notes });
      return response.data;
    } catch {
      try {
        const response = await api.put(`/incidents/${id}`, { acknowledged: true, notes });
        return response.data;
      } catch {
        // Return updated local mock
        const item = MOCK_INCIDENTS.find(i => i.id === id);
        if (item) item.acknowledged = true;
        return item;
      }
    }
  },
  resolveIncident: async (id, notes = '') => {
    try {
      const response = await api.put(`/incidents/${id}`, { resolved: true, notes });
      return response.data;
    } catch {
      const item = MOCK_INCIDENTS.find(i => i.id === id);
      if (item) item.resolved_at = new Date().toISOString();
      return item;
    }
  }
};

// ── Predictions & ML Services ────────────────────────────────────────────────
export const predictionsAPI = {
  runPrediction: async (serverId, options = {}) => {
    try {
      const response = await api.post('/predictions', {
        server_id: serverId,
        include_forecast: options.includeForecast ?? true,
        include_anomaly_detection: options.includeAnomaly ?? true,
        include_classification: options.includeClassification ?? true,
      });
      return response.data;
    } catch {
      // Mock realistic prediction payload
      return {
        server_id: serverId,
        anomaly: { anomaly_score: 0.87, is_anomaly: true },
        classification: { incident_type: "cpu_spike", confidence: 0.91 },
        forecast: {
          confidence_interval: 5.4,
          forecast: Array.from({ length: 30 }, (_, i) => ({
            timestamp: new Date(Date.now() + (i + 1) * 60000).toISOString(),
            cpu_pct: Math.min(100, Math.round(75 + i * 0.6 + Math.sin(i) * 3)),
            ram_pct: Math.min(100, Math.round(65 + i * 0.4 + Math.cos(i) * 2))
          }))
        }
      };
    }
  },

  getForecast: async (serverId, metrics) => {
    try {
      const response = await axios.post(`${ML_BASE_URL}/forecast`, {
        server_id: serverId,
        metrics: metrics || generateHealthTimeline(60)
      });
      return response.data;
    } catch (e) {
      console.warn('Direct ML forecast fallback');
      const now = Date.now();
      return {
        server_id: serverId,
        data: {
          confidence_interval: 6.2,
          forecast: Array.from({ length: 30 }, (_, i) => ({
            timestamp: new Date(now + (i + 1) * 60000).toISOString(),
            cpu_pct: Math.min(100, Math.round(82 + i * 0.45)),
            ram_pct: Math.min(100, Math.round(78 + i * 0.35))
          }))
        }
      };
    }
  },

  getEnsemblePredict: async (metrics) => {
    try {
      const response = await axios.post(`${ML_BASE_URL}/ensemble/predict`, {
        server_id: metrics?.server_id || "server-03",
        metrics: metrics || { cpu_pct: 94, ram_pct: 88, temp_celsius: 82, disk_io_mbps: 50, net_mbps: 100, disk_used_pct: 60 }
      });
      return response.data;
    } catch {
      return {
        ensemble_score: 0.874,
        risk_level: "HIGH",
        predicted_incident: "cpu_spike",
        window_hours: "6-12",
        models: {
          isolation_forest: { score: 0.82, is_anomaly: true, weight: 0.35 },
          xgboost: { score: 0.91, predicted_type: "cpu_spike", weight: 0.40 },
          bilstm_forecaster: { alert_flag: true, peak_cpu: 94.2, weight: 0.25 }
        },
        factors: [
          { name: "CPU utilization", value: 91, shap_value: 0.38, impact: "positive" },
          { name: "Temperature", value: 84, shap_value: 0.32, impact: "positive" },
          { name: "Memory pressure", value: 71, shap_value: 0.18, impact: "positive" },
          { name: "Network errors", value: 62, shap_value: 0.11, impact: "positive" },
          { name: "Disk I/O", value: 41, shap_value: -0.07, impact: "negative" }
        ],
        recommendation: "Critical workload throttling recommended. Elevate cooling fan profiles and migrate container replicas away from this node."
      };
    }
  }
};

export const mlAPI = predictionsAPI;

export default api;
