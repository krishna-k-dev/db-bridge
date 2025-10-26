import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2 } from 'lucide-react'
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

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

const SettingsPage = () => {
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [partners, setPartners] = useState<string[]>([])
  const [jobGroups, setJobGroups] = useState<string[]>([])
  const [appSettings, setAppSettings] = useState<any>({})
  const [formSettings, setFormSettings] = useState<any>({})
  const [isFinancialYearDialogOpen, setIsFinancialYearDialogOpen] = useState(false)
  const [isPartnerDialogOpen, setIsPartnerDialogOpen] = useState(false)
  const [isJobGroupDialogOpen, setIsJobGroupDialogOpen] = useState(false)
  const [editingFinancialYear, setEditingFinancialYear] = useState<string | null>(null)
  const [editingPartner, setEditingPartner] = useState<string | null>(null)
  const [editingJobGroup, setEditingJobGroup] = useState<string | null>(null)
  const [deleteItem, setDeleteItem] = useState<{ type: 'financial-year' | 'partner' | 'job-group', item: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadFinancialYears()
    loadPartners()
    loadJobGroups()
    loadAppSettings()
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
      ...appSettings,
    })
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

  const handleSaveFinancialYear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const year = formData.get('year') as string

    try {
      if (editingFinancialYear) {
        await ipcRenderer.invoke('update-financial-year', editingFinancialYear, { year })
        toast.success('Financial year updated successfully!')
      } else {
        // main handler expects a string year, not an object
        await ipcRenderer.invoke('create-financial-year', year)
        toast.success('Financial year added successfully!')
      }
      loadFinancialYears()
      setIsFinancialYearDialogOpen(false)
      setEditingFinancialYear(null)
    } catch (error) {
      console.error('Failed to save financial year:', error)
      toast.error('Failed to save financial year. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSavePartner = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string

    try {
      if (editingPartner) {
        await ipcRenderer.invoke('update-partner', editingPartner, { name })
        toast.success('Partner updated successfully!')
      } else {
        // main handler expects a string name, not an object
        await ipcRenderer.invoke('create-partner', name)
        toast.success('Partner added successfully!')
      }
      loadPartners()
      setIsPartnerDialogOpen(false)
      setEditingPartner(null)
    } catch (error) {
      console.error('Failed to save partner:', error)
      toast.error('Failed to save partner. Please try again.')
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

  const handleSaveAppSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
  const defaultConnectionTimeout = parseInt(formData.get('defaultConnectionTimeout') as string) || formSettings.defaultConnectionTimeout || 30
  const dbPoolMax = parseInt(formData.get('dbPoolMax') as string) || formSettings.dbPoolMax || 20
  const maxConcurrentConnections = parseInt(formData.get('maxConcurrentConnections') as string) || formSettings.maxConcurrentConnections || 50
  const jobQueueMaxConcurrent = parseInt(formData.get('jobQueueMaxConcurrent') as string) || formSettings.jobQueueMaxConcurrent || 10
  const enableProgressStreaming = formData.get('enableProgressStreaming') === 'on' || !!formSettings.enableProgressStreaming
  const logVerbosity = formData.get('logVerbosity') as string || formSettings.logVerbosity || 'info'

    try {
      await ipcRenderer.invoke('update-settings', {
        ...appSettings,
        defaultConnectionTimeout,
        dbPoolMax,
        maxConcurrentConnections,
        jobQueueMaxConcurrent,
        enableProgressStreaming,
        logVerbosity
      })
      setAppSettings({ 
        ...appSettings, 
        defaultConnectionTimeout, 
        dbPoolMax,
        maxConcurrentConnections,
        jobQueueMaxConcurrent,
        enableProgressStreaming,
        logVerbosity
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
            <div className="space-y-2">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
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
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteItem?.type === 'financial-year' ? 'Financial Year' : deleteItem?.type === 'partner' ? 'Partner' : 'Job Group'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteItem?.item}"?
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
    </div>
  )
}

export default SettingsPage
