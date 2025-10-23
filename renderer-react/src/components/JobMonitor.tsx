import { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronUp, Activity, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface JobProgress {
    jobId: string
    jobName?: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    startedAt?: Date
    completedAt?: Date
    totalConnections: number
    completedConnections: number
    failedConnections: number
    currentStep?: string
    percentage: number
    errors?: string[]
    connectionProgress?: Map<string, ConnectionProgress>
}

interface ConnectionProgress {
    connectionId: string
    connectionName: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    startedAt?: Date
    completedAt?: Date
    currentStep?: string
    rowsProcessed?: number
    totalRows?: number
    percentage: number
    error?: string
}

interface ProgressEvent {
    jobId: string
    type: string
    timestamp: Date
    data: any
}

const JobMonitor = () => {
    const [jobs, setJobs] = useState<Map<string, JobProgress>>(new Map())
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [panelOpen, setPanelOpen] = useState(false)
    const navigate = useNavigate()

    // helper to clamp percentage to [0,100]
    const clamp = (v?: number) => Math.max(0, Math.min(100, Number(v || 0)))

    useEffect(() => {
        // Listen for progress events from main process
        const handleProgress = (_event: any, progressEvent: ProgressEvent) => {
            setJobs(prev => {
                const newJobs = new Map(prev)
                let job = newJobs.get(progressEvent.jobId)

                switch (progressEvent.type) {
                    case 'job:started':
                        job = {
                            jobId: progressEvent.jobId,
                            jobName: progressEvent.data.jobName,
                            status: 'running',
                            startedAt: new Date(progressEvent.timestamp),
                            totalConnections: progressEvent.data.totalConnections || 0,
                            completedConnections: 0,
                            failedConnections: 0,
                            percentage: 0,
                            connectionProgress: new Map(),
                        }
                        setExpanded(prev => new Set(prev).add(progressEvent.jobId))
                        break

                    case 'job:progress':
                        if (job) {
                            job.currentStep = progressEvent.data.step
                            job.percentage = clamp(progressEvent.data.percentage ?? job.percentage)
                        }
                        break

                    case 'job:connection:started':
                        if (job) {
                            const connProgress: ConnectionProgress = {
                                connectionId: progressEvent.data.connectionId,
                                connectionName: progressEvent.data.connectionName,
                                status: 'running',
                                startedAt: new Date(progressEvent.timestamp),
                                percentage: 0,
                            }
                            if (!job.connectionProgress) job.connectionProgress = new Map()
                            job.connectionProgress.set(progressEvent.data.connectionId, connProgress)
                        }
                        break

                    case 'job:connection:progress':
                        if (job && job.connectionProgress) {
                            const conn = job.connectionProgress.get(progressEvent.data.connectionId)
                            if (conn) {
                                conn.currentStep = progressEvent.data.step || conn.currentStep
                                conn.rowsProcessed = progressEvent.data.rowsProcessed ?? conn.rowsProcessed
                                conn.totalRows = progressEvent.data.totalRows ?? conn.totalRows
                                conn.percentage = clamp(progressEvent.data.percentage ?? conn.percentage)
                            }
                        }
                        break

                    case 'job:connection:completed':
                        if (job && job.connectionProgress) {
                            const conn = job.connectionProgress.get(progressEvent.data.connectionId)
                            if (conn) {
                                conn.status = 'completed'
                                conn.completedAt = new Date(progressEvent.timestamp)
                                conn.percentage = 100
                                conn.rowsProcessed = progressEvent.data.rowsProcessed ?? conn.rowsProcessed
                            }
                            job.completedConnections = (job.completedConnections || 0) + 1
                            job.percentage = job.totalConnections > 0
                                ? Math.round(((job.completedConnections + job.failedConnections) / job.totalConnections) * 100)
                                : 0
                        }
                        break

                    case 'job:connection:failed':
                        if (job && job.connectionProgress) {
                            const conn = job.connectionProgress.get(progressEvent.data.connectionId)
                            if (conn) {
                                conn.status = 'failed'
                                conn.completedAt = new Date(progressEvent.timestamp)
                                conn.error = progressEvent.data.error
                            }
                            job.failedConnections = (job.failedConnections || 0) + 1
                            job.percentage = job.totalConnections > 0
                                ? Math.round(((job.completedConnections + job.failedConnections) / job.totalConnections) * 100)
                                : 0
                            if (!job.errors) job.errors = []
                            job.errors.push(progressEvent.data.error)
                        }
                        break

                    case 'job:completed':
                        if (job) {
                            job.status = 'completed'
                            job.completedAt = new Date(progressEvent.timestamp)
                            job.percentage = 100
                        }
                        // Auto-hide after 5 seconds
                        setTimeout(() => {
                            setJobs(prev => {
                                const updated = new Map(prev)
                                updated.delete(progressEvent.jobId)
                                return updated
                            })
                        }, 5000)
                        break

                    case 'job:failed':
                        if (job) {
                            job.status = 'failed'
                            job.completedAt = new Date(progressEvent.timestamp)
                            if (!job.errors) job.errors = []
                            job.errors.push(progressEvent.data.error)
                        }
                        break
                }

                if (job) {
                    // ensure stored percentage is clamped
                    job.percentage = clamp(job.percentage)
                    if (job.connectionProgress) {
                        for (const conn of job.connectionProgress.values()) {
                            conn.percentage = clamp(conn.percentage)
                        }
                    }
                    newJobs.set(progressEvent.jobId, job)
                }

                return newJobs
            })
        }

        ipcRenderer.on('job:progress', handleProgress)

        return () => {
            ipcRenderer.removeListener('job:progress', handleProgress)
        }
    }, [])

    const toggleExpanded = (jobId: string) => {
        setExpanded(prev => {
            const newSet = new Set(prev)
            if (newSet.has(jobId)) {
                newSet.delete(jobId)
            } else {
                newSet.add(jobId)
            }
            return newSet
        })
    }

    const runningJobs = Array.from(jobs.values()).filter(j => j.status === 'running')

    // Don't show if no jobs
    // if (!hasJobs) return null

    return (
        <>
            {/* Floating Pill Button - Always visible at bottom-left */}
            <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
                <button
                    onClick={() => setPanelOpen(!panelOpen)}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-3 group"
                >
                    <Activity className="w-5 h-5 animate-pulse" />
                    <div className="flex flex-col items-start">
                        <span className="text-sm font-semibold">{runningJobs.length} Running</span>
                        <span className="text-xs opacity-90">{jobs.size} total jobs</span>
                    </div>
                    {panelOpen ? (
                        <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                    ) : (
                        <ChevronUp className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                    )}
                </button>

                {/* Quick Link to Full Monitoring Page */}
                <button
                    onClick={() => navigate('/monitoring')}
                    className="bg-white text-gray-700 px-3 py-2 rounded-full shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-xs border border-gray-200"
                >
                    <Activity className="w-3 h-3" />
                    View History
                </button>
            </div>

            {/* Expandable Panel */}
            {panelOpen && (
                <div className="fixed bottom-24 left-65 w-96 max-h-[500px] bg-white rounded-lg shadow-2xl border border-gray-200 z-40 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-600" />
                            <h3 className="font-semibold text-gray-900">Active Jobs</h3>
                            <span className="text-sm text-gray-600">({jobs.size})</span>
                        </div>
                        <button
                            onClick={() => setPanelOpen(false)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Close"
                        >
                            <X className="w-4 h-4 text-gray-600" />
                        </button>
                    </div>

                    {/* Jobs List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {Array.from(jobs.values()).map(job => (
                            <div key={job.jobId} className="border border-gray-200 rounded-lg p-3 bg-white hover:shadow-sm transition-shadow min-w-0">
                                {/* Job Header */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            {job.status === 'running' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                                            {job.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                                            {job.status === 'failed' && <XCircle className="w-4 h-4 text-red-600" />}
                                            <span className="font-medium text-sm truncate block max-w-full">{job.jobName || job.jobId}</span>
                                        </div>
                                        {job.currentStep && (
                                            <p className="text-xs text-gray-600 mt-1 truncate max-w-full overflow-hidden">{job.currentStep}</p>
                                        )}
                                    </div>
                                    {job.totalConnections > 0 && (
                                        <button
                                            onClick={() => toggleExpanded(job.jobId)}
                                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                                        >
                                            {expanded.has(job.jobId) ? (
                                                <ChevronUp className="w-4 h-4 text-gray-600" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-gray-600" />
                                            )}
                                        </button>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                <div className="mb-2">
                                    <div className="w-full flex items-center justify-between text-xs text-gray-600 mb-1">
                                        <span>Progress</span>
                                        <span>{clamp(job.percentage)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div
                                            className={`h-2 rounded-full transition-all duration-300 ${
                                                job.status === 'completed' ? 'bg-green-600' :
                                                job.status === 'failed' ? 'bg-red-600' :
                                                'bg-blue-600'
                                            }`}
                                            style={{ width: `${clamp(job.percentage)}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Connection Summary */}
                                {job.totalConnections > 0 && (
                                    <div className="flex items-center gap-4 text-xs text-gray-600">
                                        <span>{job.completedConnections} / {job.totalConnections} completed</span>
                                        {job.failedConnections > 0 && (
                                            <span className="text-red-600">{job.failedConnections} failed</span>
                                        )}
                                    </div>
                                )}

                                {/* Connection Details (Expanded) */}
                                {expanded.has(job.jobId) && job.connectionProgress && (
                                    <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 max-h-48 overflow-y-auto min-w-0">
                                        {Array.from(job.connectionProgress.values()).map(conn => (
                                            <div key={conn.connectionId} className="bg-gray-50 rounded p-2 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 min-w-0">
                                                    {conn.status === 'running' && <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />}
                                                    {conn.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                                                    {conn.status === 'failed' && <XCircle className="w-3 h-3 text-red-600" />}
                                                    <span className="text-xs font-medium truncate block max-w-full">{conn.connectionName}</span>
                                                </div>
                                                {conn.currentStep && (
                                                    <p className="text-xs text-gray-600 ml-5 truncate max-w-full overflow-hidden">{conn.currentStep}</p>
                                                )}
                                                {conn.rowsProcessed !== undefined && (
                                                    <p className="text-xs text-gray-600 ml-5 truncate max-w-full overflow-hidden">{conn.rowsProcessed} rows processed</p>
                                                )}
                                                {conn.error && (
                                                    <p className="text-xs text-red-600 ml-5 truncate max-w-full overflow-hidden">{conn.error}</p>
                                                )}
                                                <div className="w-full bg-gray-200 rounded-full h-1 mt-1 ml-5 overflow-hidden">
                                                    <div
                                                        className={`h-1 rounded-full transition-all ${
                                                            conn.status === 'completed' ? 'bg-green-600' :
                                                            conn.status === 'failed' ? 'bg-red-600' :
                                                            'bg-blue-600'
                                                        }`}
                                                        style={{ width: `${clamp(conn.percentage)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Errors */}
                                {job.errors && job.errors.length > 0 && !expanded.has(job.jobId) && (
                                    <div className="mt-2 text-xs text-red-600">
                                        {job.errors.length} error{job.errors.length !== 1 ? 's' : ''} occurred
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

export default JobMonitor
