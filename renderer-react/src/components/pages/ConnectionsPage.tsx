import { useState, useEffect } from 'react'
import { Plus, Search, Upload, Download, MoreVertical, Edit, Trash2, Play, Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { toast } from "sonner"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface Connection {
  id: string
  name: string
  server: string
  database: string
  user?: string
  password?: string
  port?: number
  financialYear?: string
  group?: "self" | "partner"
  partner?: string
  options?: {
    trustServerCertificate?: boolean
    encrypt?: boolean
    [key: string]: any
  }
  createdAt?: Date
  lastTested?: Date
}

interface ConnectionsPageProps {
  onCountChange: (count: number) => void
}

const ConnectionsPage = ({ onCountChange }: ConnectionsPageProps) => {
  const navigate = useNavigate()
  const [connections, setConnections] = useState<Connection[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConnectionId, setDeleteConnectionId] = useState<string | null>(null)

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

  const handleTestConnection = async (connectionId: string) => {
    try {
      const result = await ipcRenderer.invoke('test-connection', connectionId)
      if (result && result.success) {
        toast.success('Connection test successful!')
      } else {
        toast.error(`Connection test failed: ${result?.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to test connection:', error)
      toast.error('Failed to test connection. Please try again.')
    }
  }

  const handleEditConnection = (_connectionId: string) => {
    // Navigate to edit connection page
    navigate(`/connections/${_connectionId}/edit`)
  }

  const handleDuplicateConnection = async (connectionId: string) => {
    try {
      const result = await ipcRenderer.invoke('duplicate-connection', connectionId)
      if (result && result.success) {
        toast.success('Connection duplicated successfully!')
        // Refresh connections list
        loadConnections()
      } else {
        toast.error(`Failed to duplicate connection: ${result?.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to duplicate connection:', error)
      toast.error('Failed to duplicate connection. Please try again.')
    }
  }

  const handleDeleteConnection = async () => {
    if (!deleteConnectionId) return

    try {
      await ipcRenderer.invoke('delete-connection', deleteConnectionId)
      toast.success('Connection deleted successfully!')
      // Reload connections after deletion
      loadConnections()
      setDeleteConnectionId(null)
    } catch (error) {
      console.error('Failed to delete connection:', error)
      toast.error('Failed to delete connection. Please try again.')
    }
  }

  useEffect(() => {
    // Load connections from IPC
    loadConnections()
  }, [])

  useEffect(() => {
    onCountChange(connections.length)
  }, [connections, onCountChange])

  const handleTestAllConnections = async () => {
    if (connections.length === 0) {
      toast.warning('No connections to test')
      return
    }

    let successCount = 0
    let failCount = 0
    const results: string[] = []

    for (const connection of connections) {
      try {
        const result = await ipcRenderer.invoke('test-connection', connection.id)
        if (result && result.success) {
          successCount++
          results.push(`${connection.name}: ✅ Success`)
        } else {
          failCount++
          results.push(`${connection.name}: ❌ Failed - ${result?.error || 'Unknown error'}`)
        }
      } catch (error) {
        failCount++
        results.push(`${connection.name}: ❌ Error - ${error}`)
      }
    }

    const summary = `Test Results:\n${results.join('\n')}\n\nSummary: ${successCount} successful, ${failCount} failed`
    toast.info(summary, { duration: 10000 }) // Show for 10 seconds since it's detailed
  }

  const handleBulkUpload = () => {
    // Create a hidden file input
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const lines = text.split('\n').filter(line => line.trim())
        if (lines.length < 2) {
          toast.error('CSV file must have at least a header row and one data row')
          return
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        const requiredHeaders = ['name', 'server', 'database']
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))

        if (missingHeaders.length > 0) {
          toast.error(`Missing required columns: ${missingHeaders.join(', ')}`)
          return
        }

        let successCount = 0
        let failCount = 0

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim())
          if (values.length !== headers.length) continue

          const connectionData: any = {}
          headers.forEach((header, index) => {
            connectionData[header] = values[index]
          })

          // Set defaults
          connectionData.id = `conn_${Date.now()}_${i}`
          connectionData.financialYear = connectionData.financialYear || '2024-25'
          connectionData.group = connectionData.group || 'self'
          connectionData.options = {
            trustServerCertificate: true
          }

          try {
            await ipcRenderer.invoke('add-connection', connectionData)
            successCount++
          } catch (error) {
            console.error('Failed to add connection:', error)
            failCount++
          }
        }

        toast.success(`Bulk upload completed: ${successCount} connections added, ${failCount} failed`)
        loadConnections()
      } catch (error) {
        console.error('Failed to process CSV:', error)
        alert('Failed to process CSV file')
      }
    }
    input.click()
  }

  const handleDownloadTemplate = () => {
    const csvContent = `name,server,database,user,password,financialYear,group,partner
My Connection,localhost,MyDatabase,sa,,2024-25,self,
Partner Connection,partner-server,PartnerDB,user,password,2024-25,partner,partner1`

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'connections_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const filteredConnections = connections.filter(conn =>
    conn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conn.server.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conn.database.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (conn.user && conn.user.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (conn.financialYear && conn.financialYear.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (conn.group && conn.group.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (conn.partner && conn.partner.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">SQL Server Connections</h2>
            <p className="text-gray-600 mt-1">Manage your database connections</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleTestAllConnections}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Play className="w-4 h-4" />
              Test All
            </button>
            <button
              onClick={handleBulkUpload}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Bulk Upload
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>
            <button
              onClick={() => navigate('/connections/create')}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Connection
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mt-6 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search connections..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </header>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Server
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Database
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Financial Year
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Group
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Partner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No connections found. Click "Add Connection" to get started.
                  </td>
                </tr>
              ) : (
                filteredConnections.map((connection) => (
                  <tr key={connection.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {connection.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      {connection.server}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      {connection.database}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      {connection.financialYear || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        connection.group === 'self'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {connection.group === 'self' ? 'Self' : 'Partner'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      {connection.partner || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Connected
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleTestConnection(connection.id)}>
                            <Play className="w-4 h-4 mr-2" />
                            Test Connection
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditConnection(connection.id)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateConnection(connection.id)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setDeleteConnectionId(connection.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!deleteConnectionId} onOpenChange={() => setDeleteConnectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this connection? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConnection} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ConnectionsPage
