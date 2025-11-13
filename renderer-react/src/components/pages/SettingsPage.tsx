import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Database, Download, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { AdvancedScheduleSelector, generateCron, parseCronToConfig, type ScheduleConfig } from "@/components/AdvancedScheduleSelector"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

const SettingsPage = () => {
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [partners, setPartners] = useState<string[]>([])
  const [jobGroups, setJobGroups] = useState<string[]>([])
  const [stores, setStores] = useState<Array<{ name: string; shortName: string }>>([])
  const [systemUsers, setSystemUsers] = useState<Array<{ name: string; number: string; group: string }>>([])
  const [whatsappGroups, setWhatsappGroups] = useState<Array<{ name: string; groupId: string }>>([])
  const [appSettings, setAppSettings] = useState<any>({})
  const [formSettings, setFormSettings] = useState<any>({})
  const [connectionTestSchedule, setConnectionTestSchedule] = useState<ScheduleConfig>({ type: 'repeated', mode: 'every', everyUnit: 'hours', everyValue: 2 })
  const [isFinancialYearDialogOpen, setIsFinancialYearDialogOpen] = useState(false)
  const [isPartnerDialogOpen, setIsPartnerDialogOpen] = useState(false)
  const [isJobGroupDialogOpen, setIsJobGroupDialogOpen] = useState(false)
  const [isStoreDialogOpen, setIsStoreDialogOpen] = useState(false)
  const [isSystemUserDialogOpen, setIsSystemUserDialogOpen] = useState(false)
  const [isWhatsappGroupDialogOpen, setIsWhatsappGroupDialogOpen] = useState(false)
  const [editingFinancialYear, setEditingFinancialYear] = useState<string | null>(null)
  const [editingPartner, setEditingPartner] = useState<string | null>(null)
  const [editingJobGroup, setEditingJobGroup] = useState<string | null>(null)
  const [editingStore, setEditingStore] = useState<{ name: string; shortName: string } | null>(null)
  const [editingSystemUser, setEditingSystemUser] = useState<{ name: string; number: string; group: string } | null>(null)
  const [editingWhatsappGroup, setEditingWhatsappGroup] = useState<{ name: string; groupId: string } | null>(null)
  const [deleteItem, setDeleteItem] = useState<{ type: 'financial-year' | 'partner' | 'job-group' | 'store' | 'system-user' | 'whatsapp-group', item: string | { name: string; groupId: string } } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTestingConnections, setIsTestingConnections] = useState(false)
  const [testingProgress, setTestingProgress] = useState<{ [key: string]: 'pending' | 'testing' | 'success' | 'failed' }>({})
  const [showTestMonitor, setShowTestMonitor] = useState(false)
  const [allConnections, setAllConnections] = useState<any[]>([])
  
  // Migration states
  const [oldDataInfo, setOldDataInfo] = useState<{ exists: boolean; oldPath: string | null; newPath: string | null; items: string[] } | null>(null)
  const [isMigrating, setIsMigrating] = useState(false)

  useEffect(() => {
    loadFinancialYears()
    loadPartners()
    loadJobGroups()
    loadStores()
    loadSystemUsers()
    loadWhatsappGroups()
    loadAppSettings()
    checkOldData()
  }, [])

  // Sync formSettings when appSettings are loaded
  useEffect(() => {
    setFormSettings({
      defaultConnectionTimeout: appSettings.defaultConnectionTimeout ?? 30,
      dbPoolMax: appSettings.dbPoolMax ?? 20,
      maxConcurrentConnections: appSettings.maxConcurrentConnections ?? 50,
      jobQueueMaxConcurrent: appSettings.jobQueueMaxConcurrent ?? 10,
      enableProgressStreaming: appSettings.enableProgressStreaming !== false,
      logVerbosity: appSettings.logVerbosity ?? 'info',
      sheetNameFormat: appSettings.sheetNameFormat ?? 'databaseName',
      multiQueryUseQueryNameOnly: appSettings.multiQueryUseQueryNameOnly ?? false,
      connectionTestEnabled: appSettings.connectionTestEnabled ?? false,
      connectionTestInterval: appSettings.connectionTestInterval ?? 2,
      connectionTestSendTo: appSettings.connectionTestSendTo ?? 'number',
      connectionTestShowFailed: appSettings.connectionTestShowFailed !== false,
      connectionTestShowPassed: appSettings.connectionTestShowPassed === true,
      ...appSettings,
    })
    
    // Parse connection test schedule from cron or interval (backward compatible)
    if (appSettings.connectionTestCron) {
      setConnectionTestSchedule(parseCronToConfig(appSettings.connectionTestCron))
    } else {
      // Convert old interval format (hours) to new repeated format
      const intervalHours = appSettings.connectionTestInterval ?? 2
      setConnectionTestSchedule({ type: 'repeated', mode: 'every', everyUnit: 'hours', everyValue: intervalHours })
    }
  }, [appSettings])

  const loadFinancialYears = async () => {
    try {
      const data = await ipcRenderer.invoke('get-financial-years')
      if (data) {
        setFinancialYears(data)
      }
    } catch (error) {
      console.error('Failed to load financial years:', error)
    }
  }

  const loadPartners = async () => {
    try {
      const data = await ipcRenderer.invoke('get-partners')
      if (data) {
        setPartners(data)
      }
    } catch (error) {
      console.error('Failed to load partners:', error)
    }
  }

  const loadJobGroups = async () => {
    try {
      const data = await ipcRenderer.invoke('get-job-groups')
      if (data) {
        setJobGroups(data)
      }
    } catch (error) {
      console.error('Failed to load job groups:', error)
    }
  }

  const loadStores = async () => {
    try {
      const data = await ipcRenderer.invoke('get-stores')
      if (data) {
        setStores(data)
      }
    } catch (error) {
      console.error('Failed to load stores:', error)
    }
  }

  const loadSystemUsers = async () => {
    try {
      const data = await ipcRenderer.invoke('get-system-users')
      if (data) {
        setSystemUsers(data)
      }
    } catch (error) {
      console.error('Failed to load system users:', error)
    }
  }

  const loadWhatsappGroups = async () => {
    try {
      const data = await ipcRenderer.invoke('get-whatsapp-groups')
      if (data) {
        setWhatsappGroups(data)
      }
    } catch (error) {
      console.error('Failed to load WhatsApp groups:', error)
    }
  }

  const loadAppSettings = async () => {
    try {
      const data = await ipcRenderer.invoke('get-settings')
      if (data) {
        setAppSettings(data)
      }
    } catch (error) {
      console.error('Failed to load app settings:', error)
    }
  }

  const checkOldData = async () => {
    try {
      const result = await ipcRenderer.invoke('check-old-data')
      setOldDataInfo(result)
    } catch (error) {
      console.error('Failed to check old data:', error)
    }
  }

  const handleMigration = async (force = false) => {
    setIsMigrating(true)
    try {
      const result = await ipcRenderer.invoke('migrate-old-data', force)
      
      if (result.success) {
        toast.success(`✅ ${result.message}`, {
          description: result.migratedItems?.length > 0 
            ? `Migrated: ${result.migratedItems.join(', ')}`
            : undefined,
          duration: 5000
        })
        
        // Refresh data
        await checkOldData()
        await loadFinancialYears()
        await loadPartners()
        await loadJobGroups()
        await loadStores()
        await loadSystemUsers()
        await loadWhatsappGroups()
        await loadAppSettings()
        
        // Show notification to restart app
        setTimeout(() => {
          toast.info('📢 Please refresh the page to see all migrated data', {
            duration: 10000
          })
        }, 1000)
      } else {
        toast.error(result.message || 'Migration failed')
      }
      
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach((err: string) => {
          toast.error(err)
        })
      }
    } catch (error: any) {
      toast.error(`Migration failed: ${error.message}`)
    } finally {
      setIsMigrating(false)
    }
  }

  const handleSaveFinancialYear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const year = formData.get('year') as string

    if (!year || !year.trim()) {
      toast.error('Financial year cannot be empty')
      setIsLoading(false)
      return
    }

    try {
      let result
      if (editingFinancialYear) {
        // Backend expects: updateFinancialYear(oldYear: string, newYear: string)
        result = await ipcRenderer.invoke('update-financial-year', editingFinancialYear, year.trim())
      } else {
        // Backend expects: createFinancialYear(year: string)
        result = await ipcRenderer.invoke('create-financial-year', year.trim())
      }
      
      // Check if the operation was successful
      if (result.success) {
        toast.success(editingFinancialYear ? 'Financial year updated successfully!' : 'Financial year added successfully!')
        loadFinancialYears()
        setIsFinancialYearDialogOpen(false)
        setEditingFinancialYear(null)
      } else {
        toast.error(result.message || 'Failed to save financial year')
      }
    } catch (error: any) {
      console.error('Failed to save financial year:', error)
      toast.error(error?.message || 'Failed to save financial year. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSavePartner = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string

    if (!name || !name.trim()) {
      toast.error('Partner name cannot be empty')
      setIsLoading(false)
      return
    }

    try {
      let result
      if (editingPartner) {
        // Backend expects: updatePartner(oldName: string, newName: string)
        result = await ipcRenderer.invoke('update-partner', editingPartner, name.trim())
      } else {
        // Backend expects: createPartner(name: string)
        result = await ipcRenderer.invoke('create-partner', name.trim())
      }
      
      // Check if the operation was successful
      if (result.success) {
        toast.success(editingPartner ? 'Partner updated successfully!' : 'Partner added successfully!')
        loadPartners()
        setIsPartnerDialogOpen(false)
        setEditingPartner(null)
      } else {
        toast.error(result.message || 'Failed to save partner')
      }
    } catch (error: any) {
      console.error('Failed to save partner:', error)
      toast.error(error?.message || 'Failed to save partner. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveJobGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string

    try {
      if (editingJobGroup) {
        await ipcRenderer.invoke('update-job-group', editingJobGroup, name)
        toast.success('Job group updated successfully!')
      } else {
        await ipcRenderer.invoke('create-job-group', name)
        toast.success('Job group added successfully!')
      }
      loadJobGroups()
      setIsJobGroupDialogOpen(false)
      setEditingJobGroup(null)
    } catch (error) {
      console.error('Failed to save job group:', error)
      toast.error('Failed to save job group. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveStore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('store-name') as string
    const shortName = formData.get('store-short-name') as string

    if (!name || !name.trim()) {
      toast.error('Store name cannot be empty')
      setIsLoading(false)
      return
    }

    if (!shortName || !shortName.trim()) {
      toast.error('Store short name cannot be empty')
      setIsLoading(false)
      return
    }

    try {
      let result
      if (editingStore) {
        result = await ipcRenderer.invoke('update-store', editingStore.shortName, name.trim(), shortName.trim())
      } else {
        result = await ipcRenderer.invoke('create-store', name.trim(), shortName.trim())
      }
      
      if (result.success) {
        toast.success(editingStore ? 'Store updated successfully!' : 'Store added successfully!')
        loadStores()
        setIsStoreDialogOpen(false)
        setEditingStore(null)
      } else {
        toast.error(result.message || 'Failed to save store')
      }
    } catch (error: any) {
      console.error('Failed to save store:', error)
      toast.error(error?.message || 'Failed to save store. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveSystemUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('user-name') as string
    const number = formData.get('user-number') as string
    const group = formData.get('user-group') as string

    if (!name || !name.trim()) {
      toast.error('User name cannot be empty')
      setIsLoading(false)
      return
    }

    if (!number || !number.trim()) {
      toast.error('User number cannot be empty')
      setIsLoading(false)
      return
    }

    if (!group || !group.trim()) {
      toast.error('User group cannot be empty')
      setIsLoading(false)
      return
    }

    try {
      let result
      if (editingSystemUser) {
        result = await ipcRenderer.invoke('update-system-user', editingSystemUser.number, name.trim(), number.trim(), group.trim())
      } else {
        result = await ipcRenderer.invoke('create-system-user', name.trim(), number.trim(), group.trim())
      }
      
      if (result.success) {
        toast.success(editingSystemUser ? 'System user updated successfully!' : 'System user added successfully!')
        loadSystemUsers()
        setIsSystemUserDialogOpen(false)
        setEditingSystemUser(null)
      } else {
        toast.error(result.message || 'Failed to save system user')
      }
    } catch (error: any) {
      console.error('Failed to save system user:', error)
      toast.error(error?.message || 'Failed to save system user. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveWhatsappGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const groupName = formData.get('whatsapp-group-name') as string
    const groupId = formData.get('whatsapp-group-id') as string

    if (!groupName || !groupName.trim()) {
      toast.error('WhatsApp group name cannot be empty')
      setIsLoading(false)
      return
    }

    if (!groupId || !groupId.trim()) {
      toast.error('WhatsApp group ID cannot be empty')
      setIsLoading(false)
      return
    }

    try {
      let result
      if (editingWhatsappGroup) {
        result = await ipcRenderer.invoke('update-whatsapp-group', editingWhatsappGroup.groupId, groupName.trim(), groupId.trim())
      } else {
        result = await ipcRenderer.invoke('create-whatsapp-group', groupName.trim(), groupId.trim())
      }
      
      if (result.success) {
        toast.success(editingWhatsappGroup ? 'WhatsApp group updated successfully!' : 'WhatsApp group added successfully!')
        loadWhatsappGroups()
        setIsWhatsappGroupDialogOpen(false)
        setEditingWhatsappGroup(null)
      } else {
        toast.error(result.message || 'Failed to save WhatsApp group')
      }
    } catch (error: any) {
      console.error('Failed to save WhatsApp group:', error)
      toast.error(error?.message || 'Failed to save WhatsApp group. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveAppSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
  const defaultConnectionTimeout = parseInt(formData.get('defaultConnectionTimeout') as string) || formSettings.defaultConnectionTimeout || 30
  const dbPoolMax = parseInt(formData.get('dbPoolMax') as string) || formSettings.dbPoolMax || 20
  const maxConcurrentConnections = parseInt(formData.get('maxConcurrentConnections') as string) || formSettings.maxConcurrentConnections || 50
  const jobQueueMaxConcurrent = parseInt(formData.get('jobQueueMaxConcurrent') as string) || formSettings.jobQueueMaxConcurrent || 10
  const enableProgressStreaming = formData.get('enableProgressStreaming') === 'on' || !!formSettings.enableProgressStreaming
  const sheetNameFormat = formData.get('sheetNameFormat') as string || formSettings.sheetNameFormat || 'databaseName'
  const multiQueryUseQueryNameOnly = formData.get('multiQueryUseQueryNameOnly') === 'on'
  const logVerbosity = formData.get('logVerbosity') as string || formSettings.logVerbosity || 'info'
  
  // Connection Test Settings
  const connectionTestEnabled = formData.get('connectionTestEnabled') === 'on'
  const connectionTestSendTo = (formData.get('connectionTestSendTo') as "number" | "groups") || 'number'
  const connectionTestShowFailed = formData.get('connectionTestShowFailed') === 'on'
  const connectionTestShowPassed = formData.get('connectionTestShowPassed') === 'on'
  
  // Generate cron from schedule config
  const connectionTestCron = generateCron(connectionTestSchedule)
  // For backward compatibility, also keep interval (in hours)
  let connectionTestInterval = 2
  if (connectionTestSchedule.type === 'repeated') {
    if (connectionTestSchedule.mode === 'every') {
      if (connectionTestSchedule.everyUnit === 'hours') {
        connectionTestInterval = connectionTestSchedule.everyValue ?? 1
      } else {
        // minutes -> convert to hours (rounded)
        connectionTestInterval = Math.max(1, Math.round((connectionTestSchedule.everyValue ?? 60) / 60))
      }
    } else if (connectionTestSchedule.mode === 'hourlyAt') {
      connectionTestInterval = 1
    }
  }

    try {
      await ipcRenderer.invoke('update-settings', {
        ...appSettings,
        defaultConnectionTimeout,
        dbPoolMax,
        maxConcurrentConnections,
        jobQueueMaxConcurrent,
        enableProgressStreaming,
        sheetNameFormat,
        multiQueryUseQueryNameOnly,
        logVerbosity,
        connectionTestEnabled,
        connectionTestInterval,
        connectionTestCron,
        connectionTestSendTo,
        connectionTestShowFailed,
        connectionTestShowPassed
      })
      setAppSettings({ 
        ...appSettings, 
        defaultConnectionTimeout, 
        dbPoolMax,
        maxConcurrentConnections,
        jobQueueMaxConcurrent,
        enableProgressStreaming,
        sheetNameFormat,
        logVerbosity,
        connectionTestEnabled,
        connectionTestInterval,
        connectionTestCron,
        connectionTestSendTo,
        connectionTestShowFailed,
        connectionTestShowPassed
      })
      toast.success('Application settings updated successfully!')
    } catch (error) {
      console.error('Failed to save app settings:', error)
      toast.error('Failed to save application settings. Please try again.')
    } finally {
      setIsLoading(false)
      loadAppSettings()
    }
  }

  const handleDelete = async () => {
    if (!deleteItem) return

    try {
      if (deleteItem.type === 'financial-year') {
        await ipcRenderer.invoke('delete-financial-year', deleteItem.item)
        toast.success('Financial year deleted successfully!')
        loadFinancialYears()
      } else if (deleteItem.type === 'partner') {
        await ipcRenderer.invoke('delete-partner', deleteItem.item)
        toast.success('Partner deleted successfully!')
        loadPartners()
      } else if (deleteItem.type === 'job-group') {
        await ipcRenderer.invoke('delete-job-group', deleteItem.item as string)
        toast.success('Job group deleted successfully!')
        loadJobGroups()
      } else if (deleteItem.type === 'store') {
        await ipcRenderer.invoke('delete-store', deleteItem.item)
        toast.success('Store deleted successfully!')
        loadStores()
      } else if (deleteItem.type === 'system-user') {
        await ipcRenderer.invoke('delete-system-user', deleteItem.item)
        toast.success('System user deleted successfully!')
        loadSystemUsers()
      } else if (deleteItem.type === 'whatsapp-group') {
        await ipcRenderer.invoke('delete-whatsapp-group', (deleteItem.item as { name: string; groupId: string }).groupId)
        toast.success('WhatsApp group deleted successfully!')
        loadWhatsappGroups()
      }
      setDeleteItem(null)
    } catch (error) {
      console.error('Failed to delete item:', error)
      toast.error('Failed to delete item. Please try again.')
    }
  }

  const openFinancialYearDialog = (financialYear?: string) => {
    setEditingFinancialYear(financialYear || null)
    setIsFinancialYearDialogOpen(true)
  }

  const openPartnerDialog = (partner?: string) => {
    setEditingPartner(partner || null)
    setIsPartnerDialogOpen(true)
  }

  const openJobGroupDialog = (jobGroup?: string) => {
    setEditingJobGroup(jobGroup || null)
    setIsJobGroupDialogOpen(true)
  }

  const openStoreDialog = (store?: { name: string; shortName: string }) => {
    setEditingStore(store || null)
    setIsStoreDialogOpen(true)
  }

  const openSystemUserDialog = (user?: { name: string; number: string; group: string }) => {
    setEditingSystemUser(user || null)
    setIsSystemUserDialogOpen(true)
  }

  const openWhatsappGroupDialog = (group?: { name: string; groupId: string }) => {
    setEditingWhatsappGroup(group || null)
    setIsWhatsappGroupDialogOpen(true)
  }

  const handleTestNow = async () => {
    if (isTestingConnections) {
      toast.warning('Test already in progress')
      return
    }

    try {
      // Load connections first
      const data = await ipcRenderer.invoke('get-connections')
      const connections = data || []
      
      if (connections.length === 0) {
        toast.warning('No connections to test')
        return
      }

      setAllConnections(connections)
      setIsTestingConnections(true)
      setShowTestMonitor(true)
      
      // Initialize all connections as testing (parallel execution)
      const initialProgress: { [key: string]: 'pending' | 'testing' | 'success' | 'failed' } = {}
      connections.forEach((c: any) => {
        initialProgress[c.id] = 'testing'
      })
      setTestingProgress(initialProgress)

      // Test all connections in PARALLEL for speed (same as before)
      const results = await Promise.all(
        connections.map(async (connection: any) => {
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

      // After all tests complete, send WhatsApp notification in background
      // This runs async - doesn't block the UI
      ipcRenderer.invoke('test-all-connections').catch((err: any) => {
        console.error('Failed to send WhatsApp notification:', err)
      })

      const summary = `Test completed: ${successCount} successful, ${failCount} failed`
      
      // Keep monitor open for 2 more seconds to show results
      setTimeout(() => {
        setShowTestMonitor(false)
        setIsTestingConnections(false)
      }, 2000)

      toast.success(summary)
    } catch (error: any) {
      console.error('Failed to test connections:', error)
      toast.error(error?.message || 'Failed to test connections. Please try again.')
      setShowTestMonitor(false)
      setIsTestingConnections(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <p className="text-gray-600 mt-1">Manage financial years and partners</p>
          </div>
        </div>
      </header>

      {/* Settings Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Data Migration Section - Show if old data detected */}
        {oldDataInfo?.exists && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200 p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500 rounded-lg">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  Old "SQL Bridge" Data Detected
                </h3>
                <p className="text-gray-700 mb-3">
                  We found data from your previous "SQL Bridge" installation. Would you like to migrate it to the new "Bridge" app?
                </p>
                <div className="bg-white rounded-lg p-4 mb-4 border border-blue-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">📦 Available to migrate:</p>
                  <div className="flex flex-wrap gap-2">
                    {oldDataInfo.items.map(item => (
                      <span key={item} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-gray-600 space-y-1">
                    <p><strong>From:</strong> {oldDataInfo.oldPath}</p>
                    <p><strong>To:</strong> {oldDataInfo.newPath}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => handleMigration(false)}
                    disabled={isMigrating}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isMigrating ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Migrating...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Migrate Now
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => setOldDataInfo({ ...oldDataInfo, exists: false })}
                    variant="outline"
                    disabled={isMigrating}
                  >
                    Remind Me Later
                  </Button>
                  <Button
                    onClick={() => setOldDataInfo({ exists: false, oldPath: null, newPath: null, items: [] })}
                    variant="ghost"
                    disabled={isMigrating}
                    className="text-gray-600"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Application Settings Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Settings</h3>
          <form onSubmit={handleSaveAppSettings} className="space-y-6">
            {/* Connection Settings */}
            <div className="border-b pb-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">Connection Settings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultConnectionTimeout">Connection Timeout (seconds)</Label>
                  <Input
                    id="defaultConnectionTimeout"
                    name="defaultConnectionTimeout"
                    type="number"
                    min="1"
                    max="300"
                    value={formSettings.defaultConnectionTimeout}
                    onChange={(e) => setFormSettings({...formSettings, defaultConnectionTimeout: parseInt(e.target.value) || 0})}
                    placeholder="30"
                    required
                  />
                  <p className="text-sm text-gray-600">
                    Maximum time to wait for a database connection.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dbPoolMax">Pool Size (per server)</Label>
                  <Input
                    id="dbPoolMax"
                    name="dbPoolMax"
                    type="number"
                    min="1"
                    max="100"
                    value={formSettings.dbPoolMax}
                    onChange={(e) => setFormSettings({...formSettings, dbPoolMax: parseInt(e.target.value) || 0})}
                    placeholder="20"
                    required
                  />
                  <p className="text-sm text-gray-600">
                    Maximum connections per database server.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxConcurrentConnections">Max Concurrent Connections</Label>
                  <Input
                    id="maxConcurrentConnections"
                    name="maxConcurrentConnections"
                    type="number"
                    min="1"
                    max="500"
                    value={formSettings.maxConcurrentConnections}
                    onChange={(e) => setFormSettings({...formSettings, maxConcurrentConnections: parseInt(e.target.value) || 0})}
                    placeholder="50"
                    required
                  />
                  <p className="text-sm text-gray-600">
                    Total concurrent database connections allowed.
                  </p>
                </div>
              </div>
            </div>

            {/* Job Queue Settings */}
            <div className="border-b pb-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">Job Queue Settings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jobQueueMaxConcurrent">Max Concurrent Jobs</Label>
                  <Input
                    id="jobQueueMaxConcurrent"
                    name="jobQueueMaxConcurrent"
                    type="number"
                    min="1"
                    max="50"
                    value={formSettings.jobQueueMaxConcurrent}
                    onChange={(e) => setFormSettings({...formSettings, jobQueueMaxConcurrent: parseInt(e.target.value) || 0})}
                    placeholder="10"
                    required
                  />
                  <p className="text-sm text-gray-600">
                    Maximum jobs running simultaneously.
                  </p>
                </div>
              </div>
            </div>

            {/* UI and Features */}
            <div className="border-b pb-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">Features</h4>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                    <input
                    id="enableProgressStreaming"
                    name="enableProgressStreaming"
                    type="checkbox"
                    checked={!!formSettings.enableProgressStreaming}
                    onChange={(e) => setFormSettings({...formSettings, enableProgressStreaming: e.target.checked})}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <Label htmlFor="enableProgressStreaming" className="cursor-pointer">
                    Enable Real-time Progress Streaming
                  </Label>
                </div>
                <p className="text-sm text-gray-600 ml-6">
                  Show live progress updates during job execution.
                </p>
              </div>
            </div>

            {/* Excel/Sheets Configuration */}
            <div className="border-b pb-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">Excel & Google Sheets</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sheetNameFormat">Sheet Name Format</Label>
                  <select
                    id="sheetNameFormat"
                    name="sheetNameFormat"
                    value={formSettings.sheetNameFormat || 'databaseName'}
                    onChange={(e) => setFormSettings({...formSettings, sheetNameFormat: e.target.value})}
                    className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="databaseName">Database Name (Default)</option>
                    <option value="connectionName">Connection Name</option>
                    <option value="storeName">Store Name</option>
                  </select>
                  <p className="text-sm text-gray-600">
                    Choose how sheet names are generated in Excel and Google Sheets exports.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id="multiQueryUseQueryNameOnly"
                      name="multiQueryUseQueryNameOnly"
                      checked={formSettings.multiQueryUseQueryNameOnly || false}
                      onChange={(e) => setFormSettings({...formSettings, multiQueryUseQueryNameOnly: e.target.checked})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Multi-Query: Use Query Name Only for Sheets</span>
                  </label>
                  <p className="text-sm text-gray-600">
                    When enabled, multi-query jobs will create sheets with only the query name (e.g., "Sales Report") instead of "ConnectionName - QueryName".
                  </p>
                </div>
              </div>
            </div>

            {/* Logging */}
            <div className="pb-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">Logging</h4>
              <div className="space-y-2">
                <Label htmlFor="logVerbosity">Log Verbosity</Label>
                <select
                  id="logVerbosity"
                  name="logVerbosity"
                  value={formSettings.logVerbosity}
                  onChange={(e) => setFormSettings({...formSettings, logVerbosity: e.target.value})}
                  className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="error">Error Only</option>
                  <option value="warn">Warnings</option>
                  <option value="info">Info (Recommended)</option>
                  <option value="debug">Debug (Verbose)</option>
                </select>
                <p className="text-sm text-gray-600">
                  Control the level of detail in application logs.
                </p>
              </div>
            </div>

            {/* Connection Test Settings */}
            <div className="border-t pt-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">📡 Connection Test (WhatsApp Notifications)</h4>
              
              <div className="space-y-4">
                {/* Enable/Disable */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="connectionTestEnabled"
                    name="connectionTestEnabled"
                    checked={formSettings.connectionTestEnabled || false}
                    onChange={(e) => setFormSettings({...formSettings, connectionTestEnabled: e.target.checked})}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <Label htmlFor="connectionTestEnabled" className="cursor-pointer">
                    Enable Automated Connection Testing
                  </Label>
                </div>

                {/* Test Schedule - Full Control */}
                <div className="space-y-3">
                  <Label>Test Schedule</Label>
                  <p className="text-sm text-gray-600 mb-3">
                    Complete control over when connection tests run (every X minutes/hours, daily at specific time, etc.)
                  </p>
                  <AdvancedScheduleSelector
                    value={connectionTestSchedule}
                    onChange={setConnectionTestSchedule}
                  />
                </div>

                {/* Send To Selection */}
                <div className="space-y-2">
                  <Label>Send Notifications To</Label>
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="sendToNumber"
                        name="connectionTestSendTo"
                        value="number"
                        checked={formSettings.connectionTestSendTo !== 'groups'}
                        onChange={(e) => setFormSettings({...formSettings, connectionTestSendTo: e.target.value as "number" | "groups"})}
                        className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                      />
                      <label htmlFor="sendToNumber" className="text-sm cursor-pointer">
                        WhatsApp Number (All System Users)
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="sendToGroups"
                        name="connectionTestSendTo"
                        value="groups"
                        checked={formSettings.connectionTestSendTo === 'groups'}
                        onChange={(e) => setFormSettings({...formSettings, connectionTestSendTo: e.target.value as "number" | "groups"})}
                        className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                      />
                      <label htmlFor="sendToGroups" className="text-sm cursor-pointer">
                        WhatsApp Groups (All Groups)
                      </label>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    {formSettings.connectionTestSendTo === 'groups' 
                      ? `Will send notifications to all ${whatsappGroups.length} configured WhatsApp groups`
                      : `Will send notifications to all ${systemUsers.length} configured system users`
                    }
                  </p>
                </div>

                {/* Status Filters */}
                <div className="space-y-2">
                  <Label>Show Status</Label>
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showFailed"
                        name="connectionTestShowFailed"
                        checked={formSettings.connectionTestShowFailed !== false}
                        onChange={(e) => setFormSettings({...formSettings, connectionTestShowFailed: e.target.checked})}
                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                      />
                      <label htmlFor="showFailed" className="text-sm cursor-pointer">Failed Connections</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showPassed"
                        name="connectionTestShowPassed"
                        checked={formSettings.connectionTestShowPassed === true}
                        onChange={(e) => setFormSettings({...formSettings, connectionTestShowPassed: e.target.checked})}
                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                      />
                      <label htmlFor="showPassed" className="text-sm cursor-pointer">Passed Connections</label>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    Filter which connection statuses to include in notifications
                  </p>
                </div>

                {/* Manual Test Now Button */}
                <div className="space-y-2">
                  <Label>Manual Test</Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestNow}
                    disabled={isTestingConnections}
                    className="w-full md:w-auto"
                  >
                    {isTestingConnections ? 'Testing...' : 'Test Now'}
                  </Button>
                  <p className="text-sm text-gray-600">
                    Manually trigger a connection test and send notifications immediately
                  </p>
                </div>
              </div>
            </div>

            {/* Data Management Section */}
            <div className="border-b pb-4">
              <h4 className="text-md font-medium text-gray-800 mb-3">Data Management</h4>
              <div className="space-y-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <Database className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900 mb-1">Import from Old "SQL Bridge" Version</h5>
                      <p className="text-sm text-gray-600 mb-3">
                        If you have data from the previous "SQL Bridge" application, you can import it here. 
                        This will copy your jobs, connections, settings, and logs to the new "Bridge" app.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => checkOldData()}
                        disabled={isMigrating}
                        className="w-full md:w-auto"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {isMigrating ? 'Checking...' : 'Check & Import Old Data'}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Show detected info if available */}
                  {oldDataInfo?.exists && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900 mb-2">✅ Old Data Found!</h5>
                          <p className="text-sm text-gray-700 mb-2">
                            <strong>Location:</strong> {oldDataInfo.oldPath}
                          </p>
                          <p className="text-sm text-gray-700 mb-3">
                            <strong>Items found:</strong> {oldDataInfo.items.join(', ')}
                          </p>
                          <Button
                            type="button"
                            onClick={() => handleMigration(false)}
                            disabled={isMigrating}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {isMigrating ? (
                              <>
                                <span className="animate-spin mr-2">⏳</span>
                                Importing...
                              </>
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-2" />
                                Import Now
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Show if no data found */}
                  {oldDataInfo && !oldDataInfo.exists && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-sm text-gray-600">
                        ℹ️ No old "SQL Bridge" data detected. If you have data in a custom location, 
                        please check the logs for searched paths.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Settings'}
            </Button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Financial Years Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Financial Years</h3>
              <Dialog open={isFinancialYearDialogOpen} onOpenChange={setIsFinancialYearDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => openFinancialYearDialog()}
                    className="flex items-center gap-2 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Year
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingFinancialYear ? 'Edit Financial Year' : 'Add Financial Year'}</DialogTitle>
                    <DialogDescription>
                      {editingFinancialYear ? 'Update the financial year details.' : 'Add a new financial year to the system.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSaveFinancialYear}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="year">Financial Year (e.g., 2024-25)</Label>
                        <Input
                          id="year"
                          name="year"
                          defaultValue={editingFinancialYear || ''}
                          placeholder="2024-25"
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsFinancialYearDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Saving...' : (editingFinancialYear ? 'Update' : 'Add')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {financialYears.length === 0 ? (
                <div className="text-sm text-gray-500">No financial years configured</div>
              ) : (
                financialYears.map((year) => (
                  <div key={year} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">{year}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openFinancialYearDialog(year)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => setDeleteItem({ type: 'financial-year', item: year })}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Partners Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Partners</h3>
              <Dialog open={isPartnerDialogOpen} onOpenChange={setIsPartnerDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => openPartnerDialog()}
                    className="flex items-center gap-2 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Partner
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingPartner ? 'Edit Partner' : 'Add Partner'}</DialogTitle>
                    <DialogDescription>
                      {editingPartner ? 'Update the partner details.' : 'Add a new partner to the system.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSavePartner}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Partner Name</Label>
                        <Input
                          id="name"
                          name="name"
                          defaultValue={editingPartner || ''}
                          placeholder="Partner Company Name"
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsPartnerDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Saving...' : (editingPartner ? 'Update' : 'Add')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {partners.length === 0 ? (
                <div className="text-sm text-gray-500">No partners configured</div>
              ) : (
                partners.map((partner) => (
                  <div key={partner} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">{partner}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openPartnerDialog(partner)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => setDeleteItem({ type: 'partner', item: partner })}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Job Groups Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Job Groups</h3>
              <Dialog open={isJobGroupDialogOpen} onOpenChange={setIsJobGroupDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => openJobGroupDialog()}
                    className="flex items-center gap-2 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Job Group
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingJobGroup ? 'Edit Job Group' : 'Add Job Group'}</DialogTitle>
                    <DialogDescription>
                      {editingJobGroup ? 'Update the job group name.' : 'Add a new job group to organize your jobs.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSaveJobGroup}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Job Group Name</Label>
                        <Input
                          id="name"
                          name="name"
                          defaultValue={editingJobGroup || ''}
                          placeholder="Job Group Name"
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsJobGroupDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Saving...' : (editingJobGroup ? 'Update' : 'Add')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {jobGroups.length === 0 ? (
                <div className="text-sm text-gray-500">No job groups configured</div>
              ) : (
                jobGroups.map((jobGroup) => (
                  <div key={jobGroup} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">{jobGroup}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openJobGroupDialog(jobGroup)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => setDeleteItem({ type: 'job-group', item: jobGroup })}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stores Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Stores</h3>
              <Dialog open={isStoreDialogOpen} onOpenChange={setIsStoreDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => openStoreDialog()}
                    className="flex items-center gap-2 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Store
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingStore ? 'Edit Store' : 'Add Store'}</DialogTitle>
                    <DialogDescription>
                      {editingStore ? 'Update the store details.' : 'Add a new store with name and short name.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSaveStore}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="store-name">Store Name</Label>
                        <Input
                          id="store-name"
                          name="store-name"
                          defaultValue={editingStore?.name || ''}
                          placeholder="Store Full Name"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="store-short-name">Short Name</Label>
                        <Input
                          id="store-short-name"
                          name="store-short-name"
                          defaultValue={editingStore?.shortName || ''}
                          placeholder="Short Name (will be shown in selections)"
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsStoreDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Saving...' : (editingStore ? 'Update' : 'Add')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {stores.length === 0 ? (
                <div className="text-sm text-gray-500">No stores configured</div>
              ) : (
                stores.map((store) => (
                  <div key={store.shortName} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-medium">{store.name}</span>
                      <span className="text-sm text-gray-500 ml-2">({store.shortName})</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openStoreDialog(store)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => setDeleteItem({ type: 'store', item: store.shortName })}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* System Users Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">System Users</h3>
              <Dialog open={isSystemUserDialogOpen} onOpenChange={setIsSystemUserDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => openSystemUserDialog()}
                    className="flex items-center gap-2 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add System User
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingSystemUser ? 'Edit System User' : 'Add System User'}</DialogTitle>
                    <DialogDescription>
                      {editingSystemUser ? 'Update the system user details.' : 'Add a new system user for WhatsApp notifications.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSaveSystemUser}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="user-name">Name</Label>
                        <Input
                          id="user-name"
                          name="user-name"
                          defaultValue={editingSystemUser?.name || ''}
                          placeholder="User Name"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="user-number">WhatsApp Number</Label>
                        <Input
                          id="user-number"
                          name="user-number"
                          defaultValue={editingSystemUser?.number || ''}
                          placeholder="919876543210"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="user-group">Group</Label>
                        <Input
                          id="user-group"
                          name="user-group"
                          defaultValue={editingSystemUser?.group || ''}
                          placeholder="Admin, Developer, Manager, etc."
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsSystemUserDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Saving...' : (editingSystemUser ? 'Update' : 'Add')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {systemUsers.length === 0 ? (
                <div className="text-sm text-gray-500">No system users configured</div>
              ) : (
                systemUsers.map((user) => (
                  <div key={user.number} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-medium">{user.name}</span>
                      <span className="text-sm text-gray-500 ml-2">• {user.number}</span>
                      <span className="text-xs text-blue-600 ml-2 bg-blue-50 px-2 py-0.5 rounded">{user.group}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openSystemUserDialog(user)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => setDeleteItem({ type: 'system-user', item: user.number })}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* WhatsApp Groups Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">WhatsApp Groups</h3>
              <Dialog open={isWhatsappGroupDialogOpen} onOpenChange={setIsWhatsappGroupDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => openWhatsappGroupDialog()}
                    className="flex items-center gap-2 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Group
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingWhatsappGroup ? 'Edit WhatsApp Group' : 'Add WhatsApp Group'}</DialogTitle>
                    <DialogDescription>
                      {editingWhatsappGroup ? 'Update the group name and ID.' : 'Add a new WhatsApp group for notifications.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSaveWhatsappGroup}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="whatsapp-group-name">Group Name</Label>
                        <Input
                          id="whatsapp-group-name"
                          name="whatsapp-group-name"
                          defaultValue={editingWhatsappGroup?.name || ''}
                          placeholder="e.g., Tech Team, Management, etc."
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="whatsapp-group-id">Group ID</Label>
                        <Input
                          id="whatsapp-group-id"
                          name="whatsapp-group-id"
                          defaultValue={editingWhatsappGroup?.groupId || ''}
                          placeholder="e.g., 120363123456789012@g.us"
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsWhatsappGroupDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Saving...' : (editingWhatsappGroup ? 'Update' : 'Add')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {whatsappGroups.length === 0 ? (
                <div className="text-sm text-gray-500">No WhatsApp groups configured</div>
              ) : (
                whatsappGroups.map((group) => (
                  <div key={group.groupId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex flex-col">
                      <span className="font-medium">{group.name}</span>
                      <span className="text-xs text-gray-500">{group.groupId}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openWhatsappGroupDialog(group)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => setDeleteItem({ type: 'whatsapp-group', item: group })}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteItem?.type === 'financial-year' ? 'Financial Year' : deleteItem?.type === 'partner' ? 'Partner' : deleteItem?.type === 'whatsapp-group' ? 'WhatsApp Group' : 'Job Group'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{typeof deleteItem?.item === 'string' ? deleteItem.item : deleteItem?.item?.name}"?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test All Connections Monitor */}
      <Dialog open={showTestMonitor} onOpenChange={setShowTestMonitor}>
        <DialogContent className="max-w-2xl max-h-[600px]">
          <DialogHeader>
            <DialogTitle>Testing Connections</DialogTitle>
            <DialogDescription>
              Testing {allConnections.length} connections...
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
            {allConnections.map(conn => {
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

export default SettingsPage
