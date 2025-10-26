import { useAuth } from '../contexts/AuthContext'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

class ApiService {
  async getHeaders() {
    const { getAccessToken } = useAuth()
    const token = await getAccessToken()
    return {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    }
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`
    const headers = await this.getHeaders()
    
    const config = {
      headers,
      ...options,
    }

    const response = await fetch(url, config)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong')
    }

    return data
  }

  // Auth endpoints
  async getProfile() {
    return this.request('/api/profile')
  }

  async updateProfile(profileData) {
    return this.request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    })
  }

  // Meeting endpoints
  async getMeetings(page = 1, limit = 10) {
    return this.request(`/api/meetings?page=${page}&limit=${limit}`)
  }

  async getMeeting(id) {
    return this.request(`/api/meetings/${id}`)
  }

  async uploadMeeting(file) {
    const formData = new FormData()
    formData.append('meeting', file)

    const { getAccessToken } = useAuth()
    const token = await getAccessToken()

    const response = await fetch(`${API_BASE_URL}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: formData,
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Upload failed')
    }

    return data
  }

  // Task endpoints
  async getTasks(filters = {}) {
    const params = new URLSearchParams(filters)
    return this.request(`/api/tasks?${params}`)
  }

  async updateTask(id, updates) {
    return this.request(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  // Employee endpoints
  async getEmployees() {
    return this.request('/api/employees')
  }

  async addEmployee(employeeData) {
    return this.request('/api/employees', {
      method: 'POST',
      body: JSON.stringify(employeeData),
    })
  }

  // Dashboard endpoints
  async getDashboardStats() {
    return this.request('/api/dashboard-stats')
  }

  // Notification endpoints
  async getNotifications() {
    return this.request('/api/notifications')
  }

  async markNotificationRead(id) {
    return this.request(`/api/notifications/${id}/read`, {
      method: 'PUT',
    })
  }
}

// Create a function that returns a new instance to avoid the hook issue
export const createApiService = () => new ApiService()

// For use in components
export const useApiService = () => {
  const auth = useAuth()
  
  const apiService = {
    async request(endpoint, options = {}) {
      const url = `${API_BASE_URL}${endpoint}`
      const token = await auth.getAccessToken()
      const headers = {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      }
      
      const config = {
        headers,
        ...options,
      }

      const response = await fetch(url, config)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong')
      }

      return data
    },

    // Auth endpoints
    getProfile: () => apiService.request('/api/profile'),
    updateProfile: (profileData) => apiService.request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    }),

    // Meeting endpoints
    getMeetings: (page = 1, limit = 10) => apiService.request(`/api/meetings?page=${page}&limit=${limit}`),
    getMeeting: (id) => apiService.request(`/api/meetings/${id}`),
    
    async uploadMeeting(file) {
      const formData = new FormData()
      formData.append('meeting', file)
      const token = await auth.getAccessToken()

      const response = await fetch(`${API_BASE_URL}/api/meetings/upload`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      return data
    },

    // Task endpoints
    getTasks: (filters = {}) => {
      const params = new URLSearchParams(filters)
      return apiService.request(`/api/tasks?${params}`)
    },
    createTask: (taskData) => apiService.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    }),
    updateTask: (id, updates) => apiService.request(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
    deleteTask: (id) => apiService.request(`/api/tasks/${id}`, {
      method: 'DELETE',
    }),

    // Employee endpoints
    getEmployees: () => apiService.request('/api/employees'),
    addEmployee: (employeeData) => apiService.request('/api/employees', {
      method: 'POST',
      body: JSON.stringify(employeeData),
    }),

    // Dashboard endpoints
    getDashboardStats: () => apiService.request('/api/dashboard-stats'),

    // Notification endpoints
    getNotifications: () => apiService.request('/api/notifications'),
    markNotificationRead: (id) => apiService.request(`/api/notifications/${id}/read`, {
      method: 'PUT',
    }),
  }

  return apiService
}