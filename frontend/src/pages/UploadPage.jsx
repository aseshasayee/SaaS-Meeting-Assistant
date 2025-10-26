import { useState, useCallback } from 'react'
import { useApiService } from '../services/api'
import { 
  Upload, 
  File, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  X,
  Play,
  Pause,
  Volume2
} from 'lucide-react'

export default function UploadPage() {
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [showAgentJson, setShowAgentJson] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const api = useApiService()

  const handleFileSelect = useCallback((file) => {
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
      setSelectedFile(file)
      setUploadResult(null)
    }
  }, [])

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }, [handleFileSelect])

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setUploadResult(null)

    try {
      const result = await api.uploadMeeting(selectedFile)
      setUploadResult(result)
      // automatically open agent JSON popup when crew/agent result is returned
      if (result?.crewResult) setShowAgentJson(true)
      setSelectedFile(null)
    } catch (error) {
      setUploadResult({ error: error.message })
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (file) => {
    if (file.type.startsWith('audio/')) {
      return <Volume2 className="w-8 h-8 text-blue-600" />
    } else if (file.type.startsWith('video/')) {
      return <Play className="w-8 h-8 text-purple-600" />
    }
    return <File className="w-8 h-8 text-gray-600" />
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Upload Meeting Recording</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Upload your meeting audio or video file and let our AI extract tasks, create summaries, 
          and send automated follow-up emails to your team.
        </p>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="p-8">
          {!selectedFile ? (
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive 
                  ? 'border-indigo-400 bg-indigo-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="space-y-4">
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
                  dragActive ? 'bg-indigo-100' : 'bg-gray-100'
                }`}>
                  <Upload className={`w-8 h-8 ${
                    dragActive ? 'text-indigo-600' : 'text-gray-600'
                  }`} />
                </div>
                
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Drop your meeting file here
                  </h3>
                  <p className="text-gray-600 mb-4">
                    or click to browse from your computer
                  </p>
                  
                  <label className="inline-block">
                    <input
                      type="file"
                      className="hidden"
                      accept="audio/*,video/*"
                      onChange={handleFileInput}
                      disabled={uploading}
                    />
                    <span className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors cursor-pointer inline-flex items-center">
                      <Upload className="w-4 h-4 mr-2" />
                      Choose File
                    </span>
                  </label>
                </div>
                
                <div className="text-sm text-gray-500">
                  <p>Supports: MP3, MP4, WAV, M4A, MOV, AVI (Max 100MB)</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected File */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {getFileIcon(selectedFile)}
                    <div>
                      <h3 className="font-medium text-gray-900">{selectedFile.name}</h3>
                      <p className="text-sm text-gray-600">
                        {formatFileSize(selectedFile.size)} • {selectedFile.type}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    disabled={uploading}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Upload Button */}
              <div className="text-center">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center mx-auto"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-3" />
                      Upload & Process
                    </>
                  )}
                </button>
                
                {uploading && (
                  <p className="text-sm text-gray-600 mt-3">
                    This may take a few minutes depending on the file size...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`rounded-2xl p-6 ${
          uploadResult.error 
            ? 'bg-red-50 border border-red-200' 
            : 'bg-green-50 border border-green-200'
        }`}>
          {uploadResult.error ? (
            <div className="flex items-start">
              <AlertCircle className="w-6 h-6 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-red-900 mb-2">Upload Failed</h3>
                <p className="text-red-800">{uploadResult.error}</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start mb-4">
                <CheckCircle className="w-6 h-6 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-green-900 mb-2">
                    Meeting Processed Successfully!
                  </h3>
                  <p className="text-green-800">{uploadResult.message}</p>
                </div>
              </div>

              {/* Summary */}
              {uploadResult.crewResult?.meeting_summary?.summary && (
                <div className="bg-white rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Meeting Summary</h4>
                  <p className="text-gray-700">{uploadResult.crewResult.meeting_summary.summary}</p>
                </div>
              )}

              {/* Extracted Tasks */}
              {uploadResult.tasks && uploadResult.tasks.length > 0 && (
                <div className="bg-white rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Extracted Tasks</h4>
                  <div className="space-y-3">
                    {uploadResult.tasks.map((task, index) => (
                      <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900">{task.employee_name}</span>
                            {task.due_date && (
                              <span className="text-sm text-gray-600">Due: {task.due_date}</span>
                            )}
                          </div>
                          <p className="text-gray-700">{task.task_description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Emails Sent */}
              {uploadResult.crewResult?.emails && uploadResult.crewResult.emails.length > 0 && (
                <div className="bg-white rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">
                    Emails Sent ({uploadResult.crewResult.emails.length})
                  </h4>
                  <div className="space-y-2">
                    {uploadResult.crewResult.emails.map((email, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm text-gray-700">{email.employee_email}</span>
                        <span className="text-sm text-gray-600">{email.subject}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent JSON / Debug Popup Trigger */}
              {uploadResult?.crewResult && (
                <div className="mt-4 flex items-center space-x-3">
                  <button
                    onClick={() => setShowAgentJson(true)}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                  >
                    View Agent JSON
                  </button>
                  <span className="text-sm text-gray-500">Raw agent output for debugging</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Agent JSON Modal */}
      {showAgentJson && uploadResult?.crewResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={() => setShowAgentJson(false)} />
          <div className="relative max-w-3xl w-full mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-lg font-medium">Agent JSON Output</h3>
              <button onClick={() => setShowAgentJson(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-auto">
              <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(uploadResult.crewResult, null, 2)}</pre>
            </div>
            <div className="p-3 border-t flex justify-end">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(JSON.stringify(uploadResult.crewResult, null, 2))
                }}
                className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Copy JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Task Extraction</h3>
          <p className="text-gray-600">
            Automatically identify and extract actionable tasks from your meeting transcripts.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
            <Volume2 className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Smart Transcription</h3>
          <p className="text-gray-600">
            Convert audio and video files into accurate, searchable text transcripts.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
            <Upload className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Auto Follow-ups</h3>
          <p className="text-gray-600">
            Send personalized follow-up emails to team members with their specific tasks.
          </p>
        </div>
      </div>
    </div>
  )
}