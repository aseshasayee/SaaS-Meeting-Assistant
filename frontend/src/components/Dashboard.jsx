import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Upload, FileText, Clock, Users, LogOut, CheckCircle, AlertCircle } from 'lucide-react'

export default function Dashboard({ session }) {
  const [meetings, setMeetings] = useState([])
  const [tasks, setTasks] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [activeTab, setActiveTab] = useState('upload')

  useEffect(() => {
    fetchMeetings()
    fetchTasks()
  }, [])

  const fetchMeetings = async () => {
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setMeetings(data || [])
    } catch (error) {
      console.error('Error fetching meetings:', error)
    }
  }

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          meetings(filename, created_at),
          employees(name, email)
        `)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
    }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append('meeting', file)

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/meetings/upload`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      setUploadResult(result)
      
      if (response.ok) {
        fetchMeetings()
        fetchTasks()
      }
    } catch (error) {
      console.error('Upload error:', error)
      setUploadResult({ error: 'Upload failed. Please try again.' })
    } finally {
      setUploading(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100'
      case 'in_progress': return 'text-blue-600 bg-blue-100'
      case 'overdue': return 'text-red-600 bg-red-100'
      default: return 'text-yellow-600 bg-yellow-100'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">Meeting Assistant</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {session.user.email}
              </span>
              <button
                onClick={signOut}
                className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'upload', label: 'Upload Meeting', icon: Upload },
              { id: 'meetings', label: 'Meetings', icon: FileText },
              { id: 'tasks', label: 'Tasks', icon: Clock }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-5 w-5 mr-2" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Meeting Recording</h2>
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <label className="cursor-pointer">
                  <span className="text-lg font-medium text-gray-900">
                    Choose a file or drag it here
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="audio/*,video/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
                <p className="text-sm text-gray-500 mt-2">
                  Supports audio and video files
                </p>
              </div>

              {uploading && (
                <div className="mt-6 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                  <span className="text-gray-600">Processing meeting...</span>
                </div>
              )}

              {uploadResult && (
                <div className={`mt-6 p-4 rounded-lg ${
                  uploadResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
                }`}>
                  {uploadResult.error ? (
                    <div className="flex items-center">
                      <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                      <span className="text-red-800">{uploadResult.error}</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center mb-3">
                        <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                        <span className="text-green-800 font-medium">{uploadResult.message}</span>
                      </div>
                      {uploadResult.tasks && uploadResult.tasks.length > 0 && (
                        <div className="bg-white rounded-lg p-4 mt-4">
                          <h4 className="font-medium text-gray-900 mb-2">Extracted Tasks:</h4>
                          <ul className="space-y-2">
                            {uploadResult.tasks.map((task, index) => (
                              <li key={index} className="text-sm text-gray-700">
                                <strong>{task.employee_name}:</strong> {task.task_description}
                                {task.due_date && <span className="text-gray-500"> (Due: {task.due_date})</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'meetings' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Meetings</h2>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {meetings.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p>No meetings uploaded yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {meetings.map((meeting) => (
                    <div key={meeting.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-gray-900 mb-2">
                            {meeting.filename}
                          </h3>
                          {meeting.summary && (
                            <p className="text-gray-600 mb-3">{meeting.summary}</p>
                          )}
                          <p className="text-sm text-gray-500">
                            {formatDate(meeting.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Task Overview</h2>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p>No tasks available</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {tasks.map((task) => (
                    <div key={task.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-2">
                            <h3 className="text-lg font-medium text-gray-900">
                              {task.task_description}
                            </h3>
                            <span className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(task.status)}`}>
                              {task.status}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            {task.employees && (
                              <div className="flex items-center">
                                <Users className="h-4 w-4 mr-1" />
                                {task.employees.name} ({task.employees.email})
                              </div>
                            )}
                            {task.due_date && (
                              <div className="flex items-center">
                                <Clock className="h-4 w-4 mr-1" />
                                Due: {new Date(task.due_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-2">
                            From meeting: {task.meetings?.filename} • {formatDate(task.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}