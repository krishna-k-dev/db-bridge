import { useState, useEffect } from 'react'
import { Download, Trash2, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle, Database, Eye } from 'lucide-react'
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')
const XLSX = window.require('xlsx')

interface JobExecutionHistory {
  id: string
  jobId: string
  jobName: string
  status: 'completed' | 'failed' | 'running'
  startedAt: Date
  completedAt?: Date
  duration?: number
  totalConnections: number
  completedConnections: number
  failedConnections: number
  errors?: string[]
  result?: any
  connectionDetails?: Array<{
    connectionId: string
    connectionName?: string
    status?: string
    error?: string
  }>
}

interface PoolMetrics {
  totalPools: number
  totalActiveConnections: number
  totalIdleConnections: number
  maxConnectionsPerPool: number
  maxConcurrentConnections: number
  pools: Array<{
    key: string
    server: string
    database: string
    activeConnections: number
    idleConnections: number
    totalConnections: number
  }>
}

const MonitoringPage = () => {
  const [history, setHistory] = useState<JobExecutionHistory[]>([])
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [poolMetrics, setPoolMetrics] = useState<PoolMetrics | null>(null)
  const [retryingJobs, setRetryingJobs] = useState<string[]>([])
  const [retryJobId, setRetryJobId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedJob, setSelectedJob] = useState<JobExecutionHistory | null>(null)
  const [connections, setConnections] = useState<any[]>([])
  const [modalSearchTerm, setModalSearchTerm] = useState('')

  useEffect(() => {
    loadHistory()
    loadPoolMetrics()
    loadConnections()
    
    // Refresh pool metrics every 5 seconds
    const poolInterval = setInterval(loadPoolMetrics, 5000)
    
    // Listen for job completion to update history
    const handleJobComplete = () => {
      loadHistory()
    }

    ipcRenderer.on('job:history:updated', handleJobComplete)

    return () => {
      clearInterval(poolInterval)
      ipcRenderer.removeListener('job:history:updated', handleJobComplete)
    }
  }, [])

  const loadHistory = async () => {
    try {
      const data = await ipcRenderer.invoke('get-job-history')
      if (data) {
        setHistory(data)
      }
    } catch (error) {
      console.error('Failed to load job history:', error)
    }
  }

  const loadPoolMetrics = async () => {
    try {
      const data = await ipcRenderer.invoke('get-pool-metrics')
      if (data) {
        setPoolMetrics(data)
      }
    } catch (error) {
      console.error('Failed to load pool metrics:', error)
    }
  }

  const loadConnections = async () => {
    try {
      const data = await ipcRenderer.invoke('get-connections')
      if (data) {
        setConnections(data)
      }
    } catch (error) {
      console.error('Failed to load connections:', error)
    }
  }

  const handleRefresh = () => {
    loadHistory()
    loadPoolMetrics()
    loadConnections()
    toast.success('Monitoring data refreshed')
  }

  const handleViewJob = (job: JobExecutionHistory) => {
    setSelectedJob(job)
    setShowModal(true)
    setModalSearchTerm('')
  }

  const handleRetryJob = async () => {
    if (!retryJobId) return

    const job = history.find(h => h.id === retryJobId)
    if (!job || !job.connectionDetails) return

    const failedIds = job.connectionDetails.filter(c => c.status === 'failed').map(c => c.connectionId)
    if (failedIds.length === 0) {
      toast.error('No failed connections found to retry')
      setRetryJobId(null)
      return
    }

    setRetryingJobs(prev => [...prev, retryJobId])
    setRetryJobId(null)

    const promise = ipcRenderer.invoke('run-job-connections', job.jobId, failedIds)

    toast.promise(promise, {
      loading: `Retrying ${failedIds.length} connection(s)...`,
      success: () => {
        loadHistory()
        return 'Retry started'
      },
      error: 'Failed to start retry'
    })

    try {
      await promise
    } finally {
      setRetryingJobs(prev => prev.filter(id => id !== retryJobId))
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedItems.length === 0) return

    const deletePromise = ipcRenderer.invoke('delete-job-history', selectedItems)

    toast.promise(deletePromise, {
      loading: `Deleting ${selectedItems.length} records...`,
      success: () => {
        loadHistory()
        setSelectedItems([])
        return `${selectedItems.length} records deleted successfully!`
      },
      error: 'Failed to delete records'
    })
  }

  const handleExportHistory = async () => {
    const exportData = filteredHistory.map(item => ({
      'Job Name': item.jobName,
      'Status': item.status,
      'Started At': new Date(item.startedAt).toLocaleString(),
      'Completed At': item.completedAt ? new Date(item.completedAt).toLocaleString() : '-',
      'Duration (sec)': item.duration ? (item.duration / 1000).toFixed(2) : '-',
      'Total Connections': item.totalConnections,
      'Completed': item.completedConnections,
      'Failed': item.failedConnections,
      'Errors': item.errors ? item.errors.join('; ') : '-'
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Job History')

    const timestamp = new Date().toISOString().split('T')[0]
    const defaultFilename = `job_history_${timestamp}.xlsx`

    const result = await ipcRenderer.invoke('show-save-dialog', {
      title: 'Export Job History',
      defaultPath: defaultFilename,
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) return

    try {
      XLSX.writeFile(wb, result.filePath)
      const fileName = result.filePath.split('\\').pop() || result.filePath.split('/').pop() || 'file'
      toast.success(`Job history exported to ${fileName}`)
    } catch (error) {
      toast.error(`Failed to export: ${error}`)
    }
  }

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all job history? This cannot be undone.')) return

    const clearPromise = ipcRenderer.invoke('clear-job-history')

    toast.promise(clearPromise, {
      loading: 'Clearing history...',
      success: () => {
        loadHistory()
        setSelectedItems([])
        return 'Job history cleared successfully!'
      },
      error: 'Failed to clear history'
    })
  }

  const filteredHistory = history.filter(item => {
    const matchesSearch = !searchTerm || 
      item.jobName.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus

    return matchesSearch && matchesStatus
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'running':
        return <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    const classes = {
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      running: 'bg-blue-100 text-blue-800'
    }[status] || 'bg-gray-100 text-gray-800'

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${classes}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Job Execution History</h2>
            <p className="text-gray-600 mt-1">View and manage job execution logs</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            {selectedItems.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected ({selectedItems.length})
              </button>
            )}
            <button
              onClick={handleExportHistory}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 flex gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-sm text-blue-600 font-medium">Total Executions</div>
            <div className="text-2xl font-bold text-blue-900">{history.length}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-sm text-green-600 font-medium">Completed</div>
            <div className="text-2xl font-bold text-green-900">
              {history.filter(h => h.status === 'completed').length}
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-sm text-red-600 font-medium">Failed</div>
            <div className="text-2xl font-bold text-red-900">
              {history.filter(h => h.status === 'failed').length}
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-sm text-purple-600 font-medium">Running</div>
            <div className="text-2xl font-bold text-purple-900">
              {history.filter(h => h.status === 'running').length}
            </div>
          </div>
        </div>

        {/* Connection Pool Monitoring */}
        {poolMetrics && (
          <div className="mt-6 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg p-4 border border-cyan-200">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-cyan-600" />
              <h3 className="text-lg font-bold text-gray-900">SQL Connection Pool Status</h3>
            </div>
            
            {/* Pool Summary */}
            <div className="grid grid-cols-5 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-gray-600 font-medium">Total Pools</div>
                <div className="text-xl font-bold text-gray-900">{poolMetrics.totalPools}</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-green-600 font-medium">Active Connections</div>
                <div className="text-xl font-bold text-green-900">{poolMetrics.totalActiveConnections}</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-blue-600 font-medium">Idle Connections</div>
                <div className="text-xl font-bold text-blue-900">{poolMetrics.totalIdleConnections}</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-orange-600 font-medium">Max Per Pool</div>
                <div className="text-xl font-bold text-orange-900">{poolMetrics.maxConnectionsPerPool}</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-purple-600 font-medium">Max Concurrent</div>
                <div className="text-xl font-bold text-purple-900">{poolMetrics.maxConcurrentConnections}</div>
              </div>
            </div>

            {/* Individual Pools */}
            {poolMetrics.pools && poolMetrics.pools.length > 0 && (
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="text-sm font-bold text-gray-900 mb-3">Active Pools by Server</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {poolMetrics.pools.map((pool, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{pool.server}</div>
                        <div className="text-xs text-gray-600">DB: {pool.database}</div>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <div className="text-center">
                          <div className="text-green-600 font-bold">{pool.activeConnections}</div>
                          <div className="text-gray-500">Active</div>
                        </div>
                        <div className="text-center">
                          <div className="text-blue-600 font-bold">{pool.idleConnections}</div>
                          <div className="text-gray-500">Idle</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-900 font-bold">{pool.totalConnections}</div>
                          <div className="text-gray-500">Total</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === filteredHistory.length && filteredHistory.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(filteredHistory.map(h => h.id))
                      } else {
                        setSelectedItems([])
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Job Name
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Started At
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Connections
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Result
                </th>
                <th className="px-2 py-1 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-xs">
              {filteredHistory.length === 0 ? (
                <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No job history found. Jobs will appear here after execution.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-2 py-1 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItems(prev => [...prev, item.id])
                          } else {
                            setSelectedItems(prev => prev.filter(id => id !== item.id))
                          }
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.status)}
                        {getStatusBadge(item.status)}
                      </div>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-900">
                      {item.jobName}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {new Date(item.startedAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {item.duration ? `${(item.duration / 1000).toFixed(2)}s` : '-'}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">{item.completedConnections}</span>
                        <span className="text-gray-400">/</span>
                        <span>{item.totalConnections}</span>
                        {item.failedConnections > 0 && (
                          <span className="text-red-600">({item.failedConnections} failed)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {item.errors && item.errors.length > 0 ? (
                        <div className="text-red-600 text-xs">
                          {item.errors.length} error(s)
                        </div>
                      ) : (
                        <span className="text-green-600">Success</span>
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleViewJob(item)}
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
                        >
                          <Eye className="w-3 h-3 inline mr-1" />
                          View
                        </button>
                        {item.failedConnections > 0 && item.connectionDetails && (
                          <button
                            onClick={() => setRetryJobId(item.id)}
                            disabled={retryingJobs.includes(item.id)}
                            className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 text-xs"
                          >
                            {retryingJobs.includes(item.id) ? 'Retrying...' : 'Retry Failed'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Job Details Modal */}
      {showModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  Job Details: {selectedJob.jobName}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                Started: {new Date(selectedJob.startedAt).toLocaleString()}
                {selectedJob.completedAt && (
                  <> | Completed: {new Date(selectedJob.completedAt).toLocaleString()}</>
                )}
                {selectedJob.duration && (
                  <> | Duration: {(selectedJob.duration / 1000).toFixed(2)}s</>
                )}
              </div>
            </div>

            <div className="p-6">
              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search connections..."
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Connection Details */}
              <div className="max-h-96 overflow-y-auto">
                {selectedJob.connectionDetails && selectedJob.connectionDetails.length > 0 ? (
                  <div className="space-y-2">
                    {selectedJob.connectionDetails
                      .filter(conn => {
                        if (!modalSearchTerm) return true
                        const connection = connections.find(c => c.id === conn.connectionId)
                        const searchLower = modalSearchTerm.toLowerCase()
                        return (
                          conn.connectionName?.toLowerCase().includes(searchLower) ||
                          connection?.database?.toLowerCase().includes(searchLower) ||
                          connection?.server?.toLowerCase().includes(searchLower)
                        )
                      })
                      .map((conn, index) => {
                        const connection = connections.find(c => c.id === conn.connectionId)
                        return (
                          <div key={index} className="border border-gray-200 rounded-lg p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <div className="text-xs text-gray-500 font-medium">Name</div>
                                <div className="text-sm font-medium text-gray-900">
                                  {conn.connectionName || 'Unknown'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 font-medium">Database</div>
                                <div className="text-sm text-gray-900">
                                  {connection?.database || 'Unknown'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 font-medium">Server</div>
                                <div className="text-sm text-gray-900">
                                  {connection?.server || 'Unknown'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 font-medium">Status</div>
                                <div className="flex items-center gap-2">
                                  {conn.status === 'success' || conn.status === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-600" />
                                  )}
                                  <span className={`text-sm font-medium ${
                                    conn.status === 'success' || conn.status === 'completed'
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }`}>
                                    {conn.status === 'success' || conn.status === 'completed' ? 'Success' : 'Failed'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {conn.error && (
                              <div className="mt-2">
                                <div className="text-xs text-gray-500 font-medium">Error</div>
                                <div className="text-sm text-red-600 bg-red-50 p-2 rounded mt-1">
                                  {conn.error}
                                </div>
                              </div>
                            )}
                   
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    No connection details available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={!!retryJobId} onOpenChange={() => setRetryJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retry Failed Connections</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to retry failed connections for job "{history.find(h => h.id === retryJobId)?.jobName}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetryJob} className="bg-orange-600 hover:bg-orange-700">
              Retry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default MonitoringPage
