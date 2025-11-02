import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Combobox } from "@/components/ui/combobox"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface CreateConnectionFormProps {
  onConnectionCreated?: () => void
}

export function CreateConnectionForm({ onConnectionCreated }: CreateConnectionFormProps) {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [group, setGroup] = useState("self")
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [partners, setPartners] = useState<string[]>([])
  const [stores, setStores] = useState<Array<{ name: string; shortName: string }>>([])
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<string>("")
  const [selectedPartner, setSelectedPartner] = useState<string>("")
  const [selectedStore, setSelectedStore] = useState<string>("")

  // Load financial years, partners, and stores from main
  useEffect(() => {
    (async () => {
      try {
        const fys = await ipcRenderer.invoke('get-financial-years')
        setFinancialYears((fys || []).map((f: any) => f.year || f))
        const parts = await ipcRenderer.invoke('get-partners')
        setPartners((parts || []).map((p: any) => p.name || p))
        const strs = await ipcRenderer.invoke('get-stores')
        setStores(strs || [])
      } catch (err) {
        console.error('Failed to load settings for connection form', err)
      }
    })()
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const serverValue = formData.get('server') as string
    
    // Parse server and port from input (e.g., "localhost:1433" or "192.168.1.1:8000")
    let server = serverValue
    let port: number | undefined = undefined
    
    if (serverValue && serverValue.includes(':')) {
      const parts = serverValue.split(':')
      server = parts[0]
      const portStr = parts[1]
      if (portStr && !isNaN(Number(portStr))) {
        port = Number(portStr)
      }
    }
    
    const connectionData = {
      id: `conn_${Date.now()}`,
      name: formData.get('name'),
      server: server,
      port: port,
      database: formData.get('database'),
      user: formData.get('username') || undefined,
      password: formData.get('password') || undefined,
      financialYear: formData.get('financial-year'),
      group: group,
      partner: group === 'partner' ? formData.get('partner-select') : undefined,
      store: formData.get('store-select') || undefined,
      options: {
        trustServerCertificate: formData.get('trust-cert') === 'on',
      }
    }

    try {
      await ipcRenderer.invoke('add-connection', connectionData)
      toast.success('Connection created successfully!')
      onConnectionCreated?.()
      navigate('/connections')
    } catch (error) {
      console.error('Failed to create connection:', error)
      toast.error('Failed to create connection. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Add Connection</CardTitle>
            <CardDescription>
              Configure a new SQL Server database connection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Connection Name *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="My SQL Server"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="server">Server *</Label>
                  <Input
                    id="server"
                    name="server"
                    placeholder="localhost, localhost:1433, 192.168.1.1:8000"
                    required
                  />
                  <p className="text-sm text-gray-500">
                    Server name or IP with optional port (default port is 1433)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="database">Database *</Label>
                  <Input
                    id="database"
                    name="database"
                    placeholder="MyDatabase"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    placeholder="sa (optional for Windows Auth)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="trust-cert"
                  name="trust-cert"
                  defaultChecked
                  className="h-4 w-4 border border-gray-300 rounded"
                />
                <Label htmlFor="trust-cert" className="text-sm">
                  Trust Server Certificate
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="financial-year">Financial Year *</Label>
                <div>
                  <Combobox
                    options={financialYears.length === 0 ? [{ value: "none", label: "None" }] : financialYears.map(fy => ({ value: fy, label: fy }))}
                    value={selectedFinancialYear}
                    onValueChange={setSelectedFinancialYear}
                    placeholder="Select Financial Year"
                  />
                  {/* hidden input so FormData picks up value */}
                  <input type="hidden" name="financial-year" value={selectedFinancialYear} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-select">Store</Label>
                <div>
                  <Combobox
                    options={stores.length === 0 ? [{ value: "none", label: "No stores configured" }] : stores.map(store => ({ value: store.shortName, label: `${store.shortName} - ${store.name}` }))}
                    value={selectedStore}
                    onValueChange={setSelectedStore}
                    placeholder="Select Store (Optional)"
                  />
                  <input type="hidden" name="store-select" value={selectedStore} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Group *</Label>
                <div className="flex gap-6">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="group"
                      value="self"
                      id="self"
                      checked={group === "self"}
                      onChange={(e) => setGroup(e.target.value)}
                      className="h-4 w-4 border border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor="self">Self</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="group"
                      value="partner"
                      id="partner"
                      checked={group === "partner"}
                      onChange={(e) => setGroup(e.target.value)}
                      className="h-4 w-4 border border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor="partner">Partner</Label>
                  </div>
                </div>
              </div>

              {group === "partner" && (
                <div className="space-y-2">
                  <Label htmlFor="partner-select">Partner *</Label>
                  <div>
                    <Combobox
                      options={partners.length === 0 ? [{ value: "none", label: "None" }] : partners.map(p => ({ value: p, label: p }))}
                      value={selectedPartner}
                      onValueChange={setSelectedPartner}
                      placeholder="Select Partner"
                    />
                    <input type="hidden" name="partner-select" value={selectedPartner} />
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/connections')}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                >
                  Test Connection
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}