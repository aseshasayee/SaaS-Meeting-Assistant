import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'

// Initialize Supabase
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      fetchProfile()
      fetchMeetings()
      fetchEmployees()
    }
  }, [session])

  const fetchProfile = async () => {
    try {
      const token = session.access_token
      const response = await fetch('http://localhost:5000/api/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      setProfile(data.profile)
    } catch (error) {
      console.error('Error fetching profile:', error)
    }
  }

  const fetchMeetings = async () => {
    try {
      const token = session.access_token
      const response = await fetch('http://localhost:5000/api/meetings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      setMeetings(data.meetings || [])
    } catch (error) {
      console.error('Error fetching meetings:', error)
    }
  }

  const fetchEmployees = async () => {
    try {
      const token = session.access_token
      const response = await fetch('http://localhost:5000/api/employees', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      setEmployees(data.employees || [])
    } catch (error) {
      console.error('Error fetching employees:', error)
    }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('meeting', file)

    try {
      const token = session.access_token
      const response = await fetch('http://localhost:5000/api/meetings/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      const result = await response.json()
      
      if (result.success) {
        alert(`Meeting processed successfully! ${result.tasks.length} tasks created, ${result.emailsSent} emails sent.`)
        fetchMeetings() // Refresh meetings list
      } else {
        alert(result.message || 'Upload failed')
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Upload failed')
    } finally {
      setUploading(false)
      event.target.value = '' // Reset file input
    }
  }

  const addEmployee = async (employeeData) => {
    try {
      const token = session.access_token
      const response = await fetch('http://localhost:5000/api/employees', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(employeeData)
      })

      if (response.ok) {
        fetchEmployees() // Refresh employees list
        return true
      }
    } catch (error) {
      console.error('Error adding employee:', error)
    }
    return false
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Meeting Assistant</h1>
            <p className="text-gray-600">Sign up with your company email to get started</p>
          </div>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            theme="light"
            providers={[]}
            redirectTo={window.location.origin}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Meeting Assistant</h1>
              {profile && (
                <p className="text-sm text-gray-600">
                  {profile.companies?.name || 'Loading company...'}
                </p>
              )}
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Upload Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">Upload Meeting Recording</h2>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept="audio/*,video/*,.mp3,.wav,.mp4,.mov"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className={`cursor-pointer ${uploading ? 'opacity-50' : ''}`}
                >
                  <div className="text-4xl mb-4">📁</div>
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    {uploading ? 'Processing...' : 'Upload Meeting File'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {uploading ? 'AI is analyzing your meeting...' : 'Click to select audio/video files'}
                  </p>
                </label>
              </div>
              {uploading && (
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-4">
                  <p className="text-blue-800 text-sm">
                    🤖 Processing your meeting: Transcribing → AI Analysis → Task Creation → Email Notifications
                  </p>
                </div>
              )}
            </div>

            {/* Recent Meetings */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Recent Meetings ({meetings.length})</h2>
              <div className="space-y-4">
                {meetings.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No meetings uploaded yet</p>
                ) : (
                  meetings.map((meeting) => (
                    <div key={meeting.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-gray-900">{meeting.filename}</h3>
                          <p className="text-sm text-gray-500">
                            {new Date(meeting.created_at).toLocaleDateString()}
                          </p>
                          {meeting.summary && (
                            <p className="text-sm text-gray-700 mt-2">{meeting.summary}</p>
                          )}
                        </div>
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Processed
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Employee Management Sidebar */}
          <div className="space-y-6">
            {/* Add Employee Form */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Add Team Member</h2>
              <form onSubmit={async (e) => {
                e.preventDefault()
                const formData = new FormData(e.target)
                const employeeData = {
                  name: formData.get('name'),
                  email: formData.get('email'),
                  department: formData.get('department')
                }
                
                if (await addEmployee(employeeData)) {
                  e.target.reset()
                  alert('Employee added successfully!')
                } else {
                  alert('Failed to add employee')
                }
              }}>
                <div className="space-y-4">
                  <input
                    name="name"
                    type="text"
                    placeholder="Full Name"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    name="email"
                    type="email"
                    placeholder="Email Address"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    name="department"
                    type="text"
                    placeholder="Department"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Add Employee
                  </button>
                </div>
              </form>
            </div>

            {/* Employee List */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Team Members ({employees.length})</h2>
              <div className="space-y-3">
                {employees.length === 0 ? (
                  <p className="text-gray-500 text-sm">No team members added yet</p>
                ) : (
                  employees.map((employee) => (
                    <div key={employee.id} className="border-l-4 border-blue-500 pl-3">
                      <div className="font-medium text-gray-900">{employee.name}</div>
                      <div className="text-sm text-gray-600">{employee.email}</div>
                      {employee.department && (
                        <div className="text-xs text-gray-500">{employee.department}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App