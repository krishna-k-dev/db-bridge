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
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [isFinancialYearDialogOpen, setIsFinancialYearDialogOpen] = useState(false)
  const [isPartnerDialogOpen, setIsPartnerDialogOpen] = useState(false)
  const [editingFinancialYear, setEditingFinancialYear] = useState<FinancialYear | null>(null)
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null)
  const [deleteItem, setDeleteItem] = useState<{ type: 'financial-year' | 'partner', item: FinancialYear | Partner } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadFinancialYears()
    loadPartners()
  }, [])

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

  const handleSaveFinancialYear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const year = formData.get('year') as string

    try {
      if (editingFinancialYear) {
        await ipcRenderer.invoke('update-financial-year', editingFinancialYear.id, { year })
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
        await ipcRenderer.invoke('update-partner', editingPartner.id, { name })
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

  const handleDelete = async () => {
    if (!deleteItem) return

    try {
      if (deleteItem.type === 'financial-year') {
        await ipcRenderer.invoke('delete-financial-year', deleteItem.item.id)
        toast.success('Financial year deleted successfully!')
        loadFinancialYears()
      } else {
        await ipcRenderer.invoke('delete-partner', deleteItem.item.id)
        toast.success('Partner deleted successfully!')
        loadPartners()
      }
      setDeleteItem(null)
    } catch (error) {
      console.error('Failed to delete item:', error)
      toast.error('Failed to delete item. Please try again.')
    }
  }

  const openFinancialYearDialog = (financialYear?: FinancialYear) => {
    setEditingFinancialYear(financialYear || null)
    setIsFinancialYearDialogOpen(true)
  }

  const openPartnerDialog = (partner?: Partner) => {
    setEditingPartner(partner || null)
    setIsPartnerDialogOpen(true)
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
                          defaultValue={editingFinancialYear?.year || ''}
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
                  <div key={year.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">{year.year}</span>
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
                          defaultValue={editingPartner?.name || ''}
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
                  <div key={partner.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">{partner.name}</span>
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
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteItem?.type === 'financial-year' ? 'Financial Year' : 'Partner'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteItem ? (deleteItem.type === 'financial-year' ? (deleteItem.item as FinancialYear).year : (deleteItem.item as Partner).name) : ''}"?
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

interface FinancialYear {
  id: string
  year: string
}

interface Partner {
  id: string
  name: string
}

export default SettingsPage
