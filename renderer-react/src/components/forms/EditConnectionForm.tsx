import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface EditConnectionFormProps {
  onConnectionUpdated?: () => void
}

export function EditConnectionForm({ onConnectionUpdated }: EditConnectionFormProps) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [group, setGroup] = useState("self")
  const [connection, setConnection] = useState<any>(null)
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [partners, setPartners] = useState<string[]>([])
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<string>("")
  const [selectedPartner, setSelectedPartner] = useState<string>("")

  useEffect(() => {
    loadConnection()
  }, [id])

  const loadConnection = async () => {
    if (!id) return

    try {
      const connections = await ipcRenderer.invoke('get-connections')
      const foundConnection = connections.find((c: any) => c.id === id)
      if (foundConnection) {
        setConnection(foundConnection)
        setGroup(foundConnection.group || "self")
        setSelectedFinancialYear(foundConnection.financialYear || "")
        setSelectedPartner(foundConnection.partner || "")
      }
    } catch (error) {
      console.error('Failed to load connection:', error)
      alert('Failed to load connection data')
    } finally {
      setIsLoadingData(false)
    }
  }

  // load financial years and partners for selects
  useEffect(() => {
    (async () => {
      try {
        const fys = await ipcRenderer.invoke('get-financial-years')
        setFinancialYears((fys || []).map((f: any) => f.year || f))
        const parts = await ipcRenderer.invoke('get-partners')
        setPartners((parts || []).map((p: any) => p.name || p))
      } catch (err) {
        console.error('Failed to load settings for edit connection', err)
      }
    })()
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!connection) return

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
    
    const updatedConnection = {
      ...connection,
      name: formData.get('name'),
      server: server,
      port: port,
      database: formData.get('database'),
      user: formData.get('username') || undefined,
      password: formData.get('password') || undefined,
      financialYear: formData.get('financial-year'),
      group: group,
      partner: group === 'partner' ? formData.get('partner-select') : undefined,
      options: {
        trustServerCertificate: formData.get('trust-cert') === 'on',
      }
    }

    try {
      await ipcRenderer.invoke('update-connection', id, updatedConnection)
      toast.success('Connection updated successfully!')
      onConnectionUpdated?.()
      navigate('/connections')
    } catch (error) {
      console.error('Failed to update connection:', error)
      toast.error('Failed to update connection. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!id) return

    try {
      const result = await ipcRenderer.invoke('test-connection', id)
      if (result && result.success) {
        toast.success('Connection test successful!')
        // Refresh parent data to show updated status
        if (onConnectionUpdated) {
          onConnectionUpdated()
        }
      } else {
        toast.error(`Connection test failed: ${result?.error || 'Unknown error'}`)
        // Refresh parent data to show updated status even on failure
        if (onConnectionUpdated) {
          onConnectionUpdated()
        }
      }
    } catch (error) {
      console.error('Failed to test connection:', error)
      toast.error('Failed to test connection. Please try again.')
    }
  }

  if (isLoadingData) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="w-full mx-auto">
          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Loading connection...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!connection) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="w-full mx-auto">
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-red-600">
                Connection not found
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="w-full mx-auto">
        <Card className="border-0">
          <CardHeader>
            <CardTitle>Edit Connection</CardTitle>
            <CardDescription>
              Update your SQL Server database connection settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Connection Name *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={connection.name}
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
                    defaultValue={connection.port ? `${connection.server}:${connection.port}` : connection.server}
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
                    defaultValue={connection.database}
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
                    defaultValue={connection.user || ''}
                    placeholder="sa (optional for Windows Auth)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    defaultValue={connection.password || ''}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="trust-cert"
                  name="trust-cert"
                  defaultChecked={connection.options?.trustServerCertificate !== false}
                  className="h-4 w-4 border border-gray-300 rounded"
                />
                <Label htmlFor="trust-cert" className="text-sm">
                  Trust Server Certificate
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="financial-year">Financial Year *</Label>
                <div>
                  <Select defaultValue={connection.financialYear} onValueChange={(v: string) => setSelectedFinancialYear(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Financial Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {financialYears.length === 0 ? (
                        <SelectItem value="none">None</SelectItem>
                      ) : (
                        financialYears.map((fy) => (
                          <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="financial-year" value={selectedFinancialYear || connection.financialYear} />
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
                    <Select defaultValue={connection.partner} onValueChange={(v: string) => setSelectedPartner(v)} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Partner" />
                      </SelectTrigger>
                      <SelectContent>
                        {partners.length === 0 ? (
                          <SelectItem value="none">None</SelectItem>
                        ) : (
                          partners.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="partner-select" value={selectedPartner || connection.partner} />
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
                  onClick={handleTestConnection}
                  className="flex-1"
                >
                  Test Connection
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? "Updating..." : "Update"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}