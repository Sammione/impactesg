import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://impactesg.onrender.com');

const api = axios.create({
  baseURL: BASE_URL,
});

export const aiApi = {
  getFrameworks: async () => {
    const res = await api.get('/api/v1/ai/frameworks');
    return res.data;
  },

  chat: async (query: string, frameworkId: string, context: string = '') => {
    const res = await api.post('/api/v1/ai/chat', {
      query,
      framework_id: frameworkId,
      context,
    });
    return res.data; // { response: string }
  },

  generateSection: async (sectionName: string, frameworkId: string, data: string) => {
    const res = await api.post('/api/v1/ai/generate-section', {
      section_name: sectionName,
      framework_id: frameworkId,
      data,
    });
    return res.data; // { response: string }
  },

  rewrite: async (content: string, instruction: string) => {
    const res = await api.post('/api/v1/ai/rewrite', {
      content,
      instruction,
    });
    return res.data; // { response: string }
  },

  uploadDocument: async (file: File, frameworkId: string = 'GRI') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('framework_id', frameworkId);

    const res = await api.post('/api/v1/ai/upload-document', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data; // { filename, status, message }
  },

  getDocuments: async () => {
    const res = await api.get('/api/v1/ai/documents');
    return res.data;
  },

  deleteDocument: async (id: number) => {
    const res = await api.delete(`/api/v1/ai/documents/${id}`);
    return res.data;
  },
};

export const analyticsApi = {
  getReadiness: async (frameworkId: string = 'GRI') => {
    const res = await api.get('/api/v1/analytics/readiness', {
      params: { framework_id: frameworkId },
    });
    return res.data;
  },

  getStats: async () => {
    const res = await api.get('/api/v1/analytics/stats');
    return res.data;
  },

  getHistory: async () => {
    const res = await api.get('/api/v1/analytics/history');
    return res.data;
  },

  triggerScore: async () => {
    const res = await api.post('/api/v1/analytics/trigger-score');
    return res.data;
  },

  reset: async () => {
    const res = await api.post('/api/v1/analytics/reset');
    return res.data;
  }
};

export const healthApi = {
  check: async () => {
    const res = await api.get('/api/v1/health');
    return res.data;
  },
};
