import { useState, useEffect } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

const LogsPage = () => {
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      const data = await ipcRenderer.invoke('get-logs')
      if (data) {
        // Assuming data is an array of log strings
        setLogs(Array.isArray(data) ? data as unknown as string[] : [])
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    }
  }

  const clearLogs = async () => {
    try {
      await ipcRenderer.invoke('clear-logs')
      setLogs([])
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Activity Logs</h2>
            <p className="text-gray-600 mt-1">
              Monitor system events and job execution
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadLogs}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={clearLogs}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      </header>

      {/* Logs Container */}
      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-lg border opacity-95 border-gray-200 h-full">
          <div className="p-4 h-full overflow-auto font-mono text-sm bg-slate-900">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8 ">
                No logs available
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={cn('mb-1', log.includes('[ERROR]') ? 'text-red-400' : log.includes('[WARN]') ? 'text-yellow-400' : 'text-blue-400')}>
                  {log} 
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LogsPage
