import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApiService } from '../services/api'
import { 
  BarChart3, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  Users,
  FileText,
  Plus,
  ArrowUpRight,
  Settings
} from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [recentMeetings, setRecentMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const { ensureUserProfile } = useAuth()
  const api = useApiService()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const data = await api.getDashboardStats()
      setStats(data.stats)
      setRecentMeetings(data.recentMeetings)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProfile = async () => {
    try {
      setProfileLoading(true)
      await ensureUserProfile()
      alert('Profile creation attempted! Check the console for details.')
      // Refresh dashboard data
      await fetchDashboardData()
    } catch (error) {
      console.error('Profile creation failed:', error)
      alert('Profile creation failed: ' + error.message)
    } finally {
      setProfileLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's what's happening with your meetings.</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={handleCreateProfile}
            disabled={profileLoading}
            className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors flex items-center disabled:opacity-50"
          >
            <Settings className="w-4 h-4 mr-2" />
            {profileLoading ? 'Creating...' : 'Fix Profile'}
          </button>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            New Meeting
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Total Meetings</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalMeetings || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-sm">
            <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
            <span className="text-green-600 font-medium">+12%</span>
            <span className="text-gray-600 ml-1">from last month</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Total Tasks</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalTasks || 0}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-sm">
            <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
            <span className="text-green-600 font-medium">+8%</span>
            <span className="text-gray-600 ml-1">from last month</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Pending Tasks</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.pendingTasks || 0}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-sm">
            <span className="text-gray-600">Awaiting completion</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Overdue Tasks</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.overdueTasks || 0}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-sm">
            <span className="text-red-600">Needs attention</span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Meetings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Recent Meetings</h3>
              <button className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center">
                View all
                <ArrowUpRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
          <div className="p-6">
            {recentMeetings.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No recent meetings</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentMeetings.map((meeting) => (
                  <div key={meeting.id} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {meeting.filename}
                      </p>
                      {meeting.summary && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {meeting.summary}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(meeting.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors group">
                <div className="text-center">
                  <Plus className="w-8 h-8 text-gray-400 group-hover:text-indigo-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">
                    Upload Meeting
                  </p>
                </div>
              </button>
              
              <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors group">
                <div className="text-center">
                  <Users className="w-8 h-8 text-gray-400 group-hover:text-purple-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600 group-hover:text-purple-600">
                    Manage Team
                  </p>
                </div>
              </button>
              
              <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors group">
                <div className="text-center">
                  <BarChart3 className="w-8 h-8 text-gray-400 group-hover:text-green-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600 group-hover:text-green-600">
                    View Reports
                  </p>
                </div>
              </button>
              
              <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 transition-colors group">
                <div className="text-center">
                  <CheckCircle2 className="w-8 h-8 text-gray-400 group-hover:text-yellow-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600 group-hover:text-yellow-600">
                    Review Tasks
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Task Overview Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Task Status Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.totalTasks - stats?.pendingTasks - stats?.overdueTasks || 0}
            </p>
            <p className="text-sm text-gray-600">Completed</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.pendingTasks || 0}</p>
            <p className="text-sm text-gray-600">Pending</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.overdueTasks || 0}</p>
            <p className="text-sm text-gray-600">Overdue</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <BarChart3 className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.totalTasks || 0}</p>
            <p className="text-sm text-gray-600">Total</p>
          </div>
        </div>
      </div>
    </div>
  )
}