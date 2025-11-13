import { useState, useEffect } from 'react'
import { Plus,  Users, Server, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from "sonner"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface Connection {
  id: string
  name: string
  group?: "self" | "partner"
}

interface ConnectionsDashboardProps {
  onCountChange: (count: number) => void
}

const ConnectionsDashboard = ({ onCountChange }: ConnectionsDashboardProps) => {
  const navigate = useNavigate()
  const [selfConnectionsCount, setSelfConnectionsCount] = useState(0)
  const [partnerConnectionsCount, setPartnerConnectionsCount] = useState(0)

  useEffect(() => {
    loadConnectionsCounts()
  }, [])

  useEffect(() => {
    onCountChange(selfConnectionsCount + partnerConnectionsCount)
  }, [selfConnectionsCount, partnerConnectionsCount, onCountChange])

  const loadConnectionsCounts = async () => {
    try {
      const allConnections: Connection[] = await ipcRenderer.invoke('get-connections')
      const selfConnections = allConnections.filter((conn: Connection) => !conn.group || conn.group === 'self')
      const partnerConnections = allConnections.filter((conn: Connection) => conn.group === 'partner')
      
      setSelfConnectionsCount(selfConnections.length)
      setPartnerConnectionsCount(partnerConnections.length)
    } catch (error) {
      console.error('Failed to load connections:', error)
      toast.error('Failed to load connections')
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connections Dashboard</h1>
          <p className="text-gray-600">Manage your database connections</p>
        </div>
        <button
          onClick={() => navigate('/connections/create')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Connection
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Self Connections Card */}
        <div
          onClick={() => navigate('/connections/self')}
          className="bg-white rounded-lg shadow-lg border-2 border-gray-200 hover:border-blue-500 hover:shadow-xl transition-all cursor-pointer p-6 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg group-hover:bg-blue-600 transition-colors">
              <Server className="w-8 h-8 text-blue-600 group-hover:text-white" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Self Connections</h2>
          <p className="text-gray-600 mb-4">Your own database connections</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-blue-600">{selfConnectionsCount}</span>
            <span className="text-gray-500">connections</span>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button className="text-blue-600 font-medium text-sm group-hover:underline flex items-center gap-1">
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Partner Connections Card */}
        <div
          onClick={() => navigate('/connections/partner')}
          className="bg-white rounded-lg shadow-lg border-2 border-gray-200 hover:border-green-500 hover:shadow-xl transition-all cursor-pointer p-6 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="bg-green-100 p-3 rounded-lg group-hover:bg-green-600 transition-colors">
              <Users className="w-8 h-8 text-green-600 group-hover:text-white" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Partner Connections</h2>
          <p className="text-gray-600 mb-4">External partner database connections</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-green-600">{partnerConnectionsCount}</span>
            <span className="text-gray-500">connections</span>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button className="text-green-600 font-medium text-sm group-hover:underline flex items-center gap-1">
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 mb-1">Total Connections</p>
            <p className="text-2xl font-bold text-gray-900">{selfConnectionsCount + partnerConnectionsCount}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 mb-1">Self</p>
            <p className="text-2xl font-bold text-blue-600">{selfConnectionsCount}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 mb-1">Partner</p>
            <p className="text-2xl font-bold text-green-600">{partnerConnectionsCount}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConnectionsDashboard
