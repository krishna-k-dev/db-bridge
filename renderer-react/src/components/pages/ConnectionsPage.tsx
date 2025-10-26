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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

const { ipcRenderer } = window.require('electron')
const XLSX = window.require('xlsx')

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
    [key: string]: unknown
  }
  createdAt?: Date
  lastTested?: Date
  testStatus?: "connected" | "failed" | "not-tested"
}

interface ConnectionsPageProps {
  onCountChange: (count: number) => void
}

// Header mapping for CSV/Excel to interface keys
const headerMapping: { [key: string]: string } = {
  'name': 'name',
  'server': 'server',
  'database': 'database',
  'user': 'user',
  'password': 'password',
  'port': 'port',
  'financialyear': 'financialYear',
  'group': 'group',
  'partner': 'partner'
}

const ConnectionsPage = ({ onCountChange }: ConnectionsPageProps) => {
  const navigate = useNavigate()
  const [connections, setConnections] = useState<Connection[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConnectionId, setDeleteConnectionId] = useState<string | null>(null)
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false)
  const [selectedConnections, setSelectedConnections] = useState<string[]>([])
  const [isBulkDeleteConfirm, setIsBulkDeleteConfirm] = useState(false)
  const [filterFinancialYear, setFilterFinancialYear] = useState<string>('all')
  const [filterGroup, setFilterGroup] = useState<string>('all')
  const [filterPartner, setFilterPartner] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [isBulkTesting, setIsBulkTesting] = useState(false)
  const [testingProgress, setTestingProgress] = useState<{ [key: string]: 'pending' | 'testing' | 'success' | 'failed' }>({})
  const [showTestMonitor, setShowTestMonitor] = useState(false)

  const loadConnections = async () => {
    try {
      const data = await ipcRenderer.invoke('get-connections')
      if (data) {
        // Normalize testStatus for existing connections: map legacy 'tested' -> 'connected'
        const connectionsWithStatus = data.map((conn: Connection) => ({
          ...conn,
          testStatus:
            (conn as any).testStatus === 'tested'
              ? 'connected'
              : conn.testStatus || (conn.lastTested ? 'connected' : 'not-tested'),
        }))
        setConnections(connectionsWithStatus)
      }
    } catch (error) {
      console.error('Failed to load connections:', error)
    }
  }

  const handleTestConnection = async (connectionId: string) => {
    const testPromise = ipcRenderer.invoke('test-connection', connectionId).then(async (result: any) => {
      if (result && result.success) {
        // Reload connections to get updated status
        await loadConnections();
        return result
      } else {
        // Reload connections to get updated status even on failure
        await loadConnections();
        throw new Error(result?.error || 'Connection test failed')
      }
    })

    toast.promise(testPromise, {
      loading: 'Testing connection...',
      success: 'Connection test successful!',
      error: (error) => `Connection test failed: ${error.message}`,
    })
  }

  const handleEditConnection = (_connectionId: string) => {
    // Navigate to edit connection page
    navigate(`/connections/${_connectionId}/edit`)
  }

  const handleDuplicateConnection = async (connectionId: string) => {
    const result = await ipcRenderer.invoke('duplicate-connection', connectionId)
    toast.promise(result, {
      loading: 'Duplicating connection...',
      success: 'Connection duplicated successfully!',
      error: (error) => `Failed to duplicate connection: ${error?.message || 'Unknown error'}`,
      finally: () =>  loadConnections(),
    })
  }

       
    
  const handleBulkDelete = async () => {
    if (selectedConnections.length === 0) return
    const result =  Promise.all(selectedConnections.map(id => ipcRenderer.invoke('delete-connection', id)))
    toast.promise(result, {
      loading: 'Deleting connections...',
      success: `${selectedConnections.length} connections deleted successfully!`,
      error: (error) => `Failed to delete connections: ${error?.message || 'Unknown error'}`,
      finally: () => {
        loadConnections()
        setSelectedConnections([])
      }
    })
  }

  const handleDeleteConnection = async () => {
    if (!deleteConnectionId) return
    const result = ipcRenderer.invoke('delete-connection', deleteConnectionId)
    toast.promise(result, {
      loading: 'Deleting connection...',
      success: 'Connection deleted successfully!',
      error: (error) => `Failed to delete connection: ${error?.message || 'Unknown error'}`,
      finally: () => {
        loadConnections()
        setDeleteConnectionId(null)
      }
    })
  }

  useEffect(() => {
    // Load connections from IPC
    loadConnections()
  }, [])

  useEffect(() => {
    onCountChange(connections.length)
  }, [connections, onCountChange])

  const handleTestAllConnections = async (): Promise<string> => {
    if (isBulkTesting) {
      toast.warning('Bulk test already in progress')
      return ''
    }

    if (filteredConnections.length === 0) {
      toast.warning('No connections to test')
      return ''
    }

    setIsBulkTesting(true)
    setShowTestMonitor(true)
    
    // Initialize all connections as testing (parallel execution)
    const initialProgress: { [key: string]: 'pending' | 'testing' | 'success' | 'failed' } = {}
    filteredConnections.forEach(c => {
      initialProgress[c.id] = 'testing'
    })
    setTestingProgress(initialProgress)

    try {
      // Test all connections in parallel for speed
      const results = await Promise.all(
        filteredConnections.map(async (connection) => {
          try {
            const result = await ipcRenderer.invoke('test-connection', connection.id)
            const status = result.success ? 'success' : 'failed'
            setTestingProgress(prev => ({ ...prev, [connection.id]: status }))
            return { id: connection.id, success: result.success }
          } catch (error) {
            setTestingProgress(prev => ({ ...prev, [connection.id]: 'failed' }))
            return { id: connection.id, success: false }
          }
        })
      )

      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length

      // Reload connections to get updated status
      await loadConnections()

      const summary = `Test completed: ${successCount} successful, ${failCount} failed`
      
      // Keep monitor open for 2 more seconds to show results
      setTimeout(() => {
        setShowTestMonitor(false)
        setIsBulkTesting(false)
      }, 2000)

      return summary
    } catch (error: any) {
      console.error('Bulk test invocation failed:', error)
      // Better message if IPC handler missing (common in dev when main didn't register)
      if (error && String(error.message || error).includes('No handler registered')) {
        toast.error('Bulk test failed: backend handler not available. Please restart the app.')
        throw new Error('Bulk test handler not available')
      }
      toast.error(`Bulk test failed: ${error?.message || String(error)}`)
      throw new Error(`Bulk test failed: ${error?.message || String(error)}`)
    } finally {
      setIsBulkTesting(false)
    }
  }

  const processBulkUpload = async (file: File) => {
    let data: any[] = []

    if (file.name.endsWith('.csv')) {
      // Parse CSV
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length < 2) {
        throw new Error('CSV file must have at least a header row and one data row')
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim())
        if (values.length !== headers.length) continue
        const row: any = {}
        headers.forEach((header, index) => {
          row[header] = values[index]
        })
        data.push(row)
      }
    } else {
      // Parse Excel
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      if (rawData.length < 2) {
        throw new Error('Excel file must have at least a header row and one data row')
      }

      const headers = (rawData[0] as string[]).map(h => h.trim().toLowerCase())
      data = rawData.slice(1).map((row: any) => {
        const obj: any = {}
        headers.forEach((header, index) => {
          obj[header] = row[index] || ''
        })
        return obj
      })
    }

    const requiredHeaders = ['name', 'server', 'database']
    const fileHeaders = Object.keys(data[0] || {}).map(h => h.toLowerCase())
    const missingHeaders = requiredHeaders.filter(h => !fileHeaders.includes(h))

    if (missingHeaders.length > 0) {
      throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`)
    }

    // Collect unique financial years and partners from the data
    const uniqueFinancialYearsInData = new Set<string>()
    const uniquePartnersInData = new Set<string>()

    for (const row of data) {
      const financialYear = row['financialyear']?.toString().trim()
      if (financialYear) {
        uniqueFinancialYearsInData.add(financialYear)
      }
      const group = row['group']?.toString().trim().toLowerCase()
      const partner = row['partner']?.toString().trim()
      if (group === 'partner' && partner) {
        uniquePartnersInData.add(partner)
      }
    }

    // Get existing financial years and partners
    const existingFinancialYears = await ipcRenderer.invoke('get-financial-years')
    const existingPartners = await ipcRenderer.invoke('get-partners')

    // Create new financial years
    for (const year of uniqueFinancialYearsInData) {
      if (!existingFinancialYears.some((fy: any) => fy.year?.toLowerCase() === year.toLowerCase())) {
        await ipcRenderer.invoke('create-financial-year', year)
      }
    }

    // Create new partners
    for (const partner of uniquePartnersInData) {
      if (!existingPartners.some((p: any) => p.name?.toLowerCase() === partner.toLowerCase())) {
        await ipcRenderer.invoke('create-partner', partner)
      }
    }

    let successCount = 0
    let failCount = 0

    for (const row of data) {
      const connectionData: Partial<Connection> = {}
      Object.keys(row).forEach(key => {
        const mappedKey = headerMapping[key] || key
        const value = row[key]?.toString().trim()
        if (value) {
          (connectionData as any)[mappedKey] = value
        }
      })

      // Normalize and set defaults
      connectionData.id = `conn_${Date.now()}_${Math.random()}`
      connectionData.financialYear = connectionData.financialYear || '2024-25'
      const groupValue = (connectionData.group as string)?.toLowerCase()
      connectionData.group = (groupValue === 'partner') ? 'partner' : 'self'
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

    return { successCount, failCount }
  }

  const handleBulkUpload = () => {
    // Create a hidden file input
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const p = processBulkUpload(file).then((result) => {
        loadConnections()
        setIsBulkDialogOpen(false)
        return result
      })

      toast.promise(p, {
        loading: 'Processing file...',
        success: ({ successCount, failCount }) => `Bulk upload completed: ${successCount} connections added, ${failCount} failed`,
        error: (err: any) => err?.message || 'Failed to process the file. Please check the format.',
      })
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

  const handleExportConnections = async () => {
    // Ask user whether to include passwords in the export
    const includePasswords = window.confirm(
      'Include passwords in the exported file? This will write plaintext passwords to the file. Only proceed if you understand the security implications.'
    )

    // Prepare data for export - use filtered connections
    const exportData = filteredConnections.map(conn => ({
      name: conn.name,
      server: conn.server,
      database: conn.database,
      user: conn.user || '',
      password: includePasswords ? (conn.password || '') : '',
      port: conn.port || '',
      financialYear: conn.financialYear || '',
      group: conn.group || 'self',
      partner: conn.partner || '',
      testStatus: conn.testStatus || 'not-tested',
      lastTested: conn.lastTested ? new Date(conn.lastTested).toLocaleString() : '',
      createdAt: conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : ''
    }))

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData)
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Connections')
    
    // Generate default filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0]
    const defaultFilename = `connections_export_${timestamp}.xlsx`
    
    // Show save dialog
    const result = await ipcRenderer.invoke('show-save-dialog', {
      title: 'Save Connections Export',
      defaultPath: defaultFilename,
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (result.canceled || !result.filePath) {
      return // User canceled
    }
    
    try {
      // Write Excel file to selected path
      XLSX.writeFile(wb, result.filePath)
      
      // Extract directory path for display
      const fileName = result.filePath.split('\\').pop() || result.filePath.split('/').pop() || 'file'
      const dirPath = result.filePath.substring(0, result.filePath.lastIndexOf('\\')) || 
                     result.filePath.substring(0, result.filePath.lastIndexOf('/')) || result.filePath
      
      toast.success(`Connections exported to ${fileName}`, {
        description: `Saved in: ${dirPath}`,
        action: {
          label: 'Open Folder',
          onClick: () => {
            ipcRenderer.invoke('open-file-location', result.filePath)
          }
        }
      })
    } catch (error) {
      toast.error(`Failed to export connections: ${error}`)
    }
  }

  const uniqueFinancialYears = [...new Set(connections.map(c => c.financialYear).filter(Boolean))]
  const uniquePartners = [...new Set(connections.map(c => c.partner).filter(Boolean))]

  const filteredConnections = connections.filter(conn => {
    const matchesSearch = !searchTerm ||
      (conn.name && conn.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (conn.server && conn.server.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (conn.database && conn.database.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (conn.user && conn.user.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (conn.financialYear && conn.financialYear.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (conn.group && conn.group.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (conn.partner && conn.partner.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesFinancialYear = filterFinancialYear === 'all' || conn.financialYear === filterFinancialYear
    const matchesGroup = filterGroup === 'all' || conn.group === filterGroup
    const matchesPartner = filterPartner === 'all' || conn.partner === filterPartner
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'connected' && conn.testStatus === 'connected') ||
      (filterStatus === 'failed' && conn.testStatus === 'failed') ||
      (filterStatus === 'not-tested' && conn.testStatus === 'not-tested')

    return matchesSearch && matchesFinancialYear && matchesGroup && matchesPartner && matchesStatus
  })

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
            {selectedConnections.length > 0 && (
              <button
                onClick={() => setIsBulkDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected ({selectedConnections.length})
              </button>
            )}
            <button
              onClick={() => toast.promise(handleTestAllConnections(), { 
                loading: 'Testing all connections...', 
                success: (summary) => summary, 
                error: 'Failed to test connections' 
              })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Play className="w-4 h-4" />
              Test All
            </button>
            <button
              onClick={() => setIsBulkDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Bulk Upload
            </button>
            <button
              onClick={handleExportConnections}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={() => navigate('/connections/create')}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mt-6 space-y-4">
          <div className="flex gap-4">
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
          <div className="flex gap-4 flex-wrap">
            <select
              value={filterFinancialYear}
              onChange={(e) => setFilterFinancialYear(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Financial Years</option>
              {uniqueFinancialYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Groups</option>
              <option value="self">Self</option>
              <option value="partner">Partner</option>
            </select>
            {filterGroup === 'partner' && (
              <select
                value={filterPartner}
                onChange={(e) => setFilterPartner(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Partners</option>
                {uniquePartners.map(partner => (
                  <option key={partner} value={partner}>{partner}</option>
                ))}
              </select>
            )}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Status</option>
              <option value="connected">Connected</option>
              <option value="failed">Failed</option>
              <option value="not-tested">Not Tested</option>
            </select>
          </div>
        </div>
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
                    checked={selectedConnections.length === filteredConnections.length && filteredConnections.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedConnections(filteredConnections.map(c => c.id))
                      } else {
                        setSelectedConnections([])
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Server
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Database
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Financial Year
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Group
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Partner
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Last Updated
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-xs">
              {filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    No connections found. Click "Add Connection" to get started.
                  </td>
                </tr>
              ) : (
                filteredConnections.map((connection) => (
                  <tr key={connection.id} className="hover:bg-gray-50">
                    <td className="px-2 py-1 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedConnections.includes(connection.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedConnections(prev => [...prev, connection.id])
                          } else {
                            setSelectedConnections(prev => prev.filter(id => id !== connection.id))
                          }
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap  text-gray-900">
                      {connection.name}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {connection.server}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {connection.database}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {connection.financialYear || 'N/A'}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        connection.group === 'self'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {connection.group === 'self' ? 'Self' : 'Partner'}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {connection.partner || '-'}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        connection.testStatus === 'connected'
                          ? 'bg-green-100 text-green-800'
                          : connection.testStatus === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {connection.testStatus === 'connected'
                          ? 'Connected'
                          : connection.testStatus === 'failed'
                          ? 'Failed'
                          : 'Not Tested'}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {connection.lastTested ? new Date(connection.lastTested).toLocaleString() : '-'}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
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

      <AlertDialog open={isBulkDeleteConfirm} onOpenChange={() => setIsBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Connections</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the selected {selectedConnections.length} connections? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleBulkDelete(); setIsBulkDeleteConfirm(false); }} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Upload Connections</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file to add multiple connections at once. Download the template first to see the required format.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 mt-4">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>
            <button
              onClick={handleBulkUpload}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Select File
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test All Connections Monitor */}
      <Dialog open={showTestMonitor} onOpenChange={setShowTestMonitor}>
        <DialogContent className="max-w-2xl max-h-[600px]">
          <DialogHeader>
            <DialogTitle>Testing Connections</DialogTitle>
            <DialogDescription>
              Testing {filteredConnections.length} connections...
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
            {filteredConnections.map(conn => {
              const status = testingProgress[conn.id] || 'pending'
              return (
                <div key={conn.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{conn.name}</div>
                    <div className="text-xs text-gray-600">{conn.server} / {conn.database}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'pending' && (
                      <span className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded-full">Pending</span>
                    )}
                    {status === 'testing' && (
                      <span className="px-2 py-1 text-xs bg-blue-200 text-blue-700 rounded-full animate-pulse">Testing...</span>
                    )}
                    {status === 'success' && (
                      <span className="px-2 py-1 text-xs bg-green-200 text-green-700 rounded-full">✓ Connected</span>
                    )}
                    {status === 'failed' && (
                      <span className="px-2 py-1 text-xs bg-red-200 text-red-700 rounded-full">✗ Failed</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ConnectionsPage
