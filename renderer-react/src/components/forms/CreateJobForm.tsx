import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { AdvancedScheduleSelector, generateCron, parseCronToConfig, type ScheduleConfig } from "@/components/AdvancedScheduleSelector"

interface Destination {
  type: string
  url?: string
  method?: string
  headers?: Record<string, string>
  spreadsheetId?: string
  sheetName?: string
  mode?: string
  keyColumn?: string
  credentialsJson?: string
  filePath?: string
  delimiter?: string
  includeHeaders?: boolean
}

interface CreateJobFormProps {
  job?: any; // optional job to edit
  onJobCreated?: () => void;
  onJobUpdated?: () => void;
}

interface DestinationItemProps {
  destination: Destination
  onUpdate: (updatedDestination: Destination) => void
  onRemove: () => void
}

function DestinationItem({ destination, onUpdate, onRemove }: DestinationItemProps) {
  const handleTypeChange = (type: string) => {
    onUpdate({ type })
  }

  const handleFieldChange = (field: string, value: any) => {
    onUpdate({ ...destination, [field]: value })
  }

  return (
    <div className="border rounded-lg p-4 mb-4 bg-gray-50">
      <div className="flex justify-between items-start mb-4">
        <Select value={destination.type} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="-- Select Type --" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="google_sheets">Google Sheets</SelectItem>
            <SelectItem value="custom_api">Custom API</SelectItem>
            <SelectItem value="excel">Excel File</SelectItem>
            <SelectItem value="csv">CSV File</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>

      {destination.type === "webhook" && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="webhook-url">URL *</Label>
            <Input
              id="webhook-url"
              type="url"
              value={destination.url || ""}
              onChange={(e) => handleFieldChange("url", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="webhook-method">Method</Label>
            <Select
              value={destination.method || "POST"}
              onValueChange={(value) => handleFieldChange("method", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="webhook-headers">Headers (JSON)</Label>
            <Textarea
              id="webhook-headers"
              rows={2}
              placeholder='{"Authorization": "Bearer token"}'
              value={destination.headers ? JSON.stringify(destination.headers) : ""}
              onChange={(e) => {
                try {
                  const headers = e.target.value ? JSON.parse(e.target.value) : undefined
                  handleFieldChange("headers", headers)
                } catch {
                  // Invalid JSON, keep as string for now
                }
              }}
            />
          </div>
        </div>
      )}

      {destination.type === "google_sheets" && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="gs-spreadsheet-id">Spreadsheet ID *</Label>
            <Input
              id="gs-spreadsheet-id"
              value={destination.spreadsheetId || ""}
              onChange={(e) => handleFieldChange("spreadsheetId", e.target.value)}
              required
            />
            <p className="text-sm text-gray-500">From URL: docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</p>
          </div>
          <div>
            <Label htmlFor="gs-sheet-name">Sheet Name *</Label>
            <Input
              id="gs-sheet-name"
              placeholder="Sheet1"
              value={destination.sheetName || "Sheet1"}
              onChange={(e) => handleFieldChange("sheetName", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="gs-mode">Mode *</Label>
            <Select
              value={destination.mode || "append"}
              onValueChange={(value) => handleFieldChange("mode", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="append">Append (add new rows)</SelectItem>
                <SelectItem value="replace">Replace (clear & write)</SelectItem>
                <SelectItem value="update">Update (by key column)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {destination.mode === "update" && (
            <div>
              <Label htmlFor="gs-key-column">Key Column (for update mode)</Label>
              <Input
                id="gs-key-column"
                placeholder="id"
                value={destination.keyColumn || ""}
                onChange={(e) => handleFieldChange("keyColumn", e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="gs-credentials">Google Service Account Credentials (JSON) *</Label>
            <Textarea
              id="gs-credentials"
              rows={6}
              placeholder="Paste your complete service account JSON here..."
              value={destination.credentialsJson || ""}
              onChange={(e) => handleFieldChange("credentialsJson", e.target.value)}
              required
            />
          </div>
        </div>
      )}

      {destination.type === "custom_api" && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="api-url">API URL *</Label>
            <Input
              id="api-url"
              type="url"
              value={destination.url || ""}
              onChange={(e) => handleFieldChange("url", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="api-method">Method</Label>
            <Select
              value={destination.method || "POST"}
              onValueChange={(value) => handleFieldChange("method", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="api-headers">Headers (JSON)</Label>
            <Textarea
              id="api-headers"
              rows={2}
              placeholder='{"Authorization": "Bearer token"}'
              value={destination.headers ? JSON.stringify(destination.headers) : ""}
              onChange={(e) => {
                try {
                  const headers = e.target.value ? JSON.parse(e.target.value) : undefined
                  handleFieldChange("headers", headers)
                } catch {
                  // Invalid JSON, keep as string for now
                }
              }}
            />
          </div>
        </div>
      )}

      {destination.type === "excel" && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="excel-file-path">File Path *</Label>
            <Input
              id="excel-file-path"
              placeholder="C:/exports/data.xlsx"
              value={destination.filePath || ""}
              onChange={(e) => handleFieldChange("filePath", e.target.value)}
              required
            />
            <p className="text-sm text-gray-500">Full path where Excel file will be saved</p>
          </div>
          <div>
            <Label htmlFor="excel-sheet-name">Sheet Name</Label>
            <Input
              id="excel-sheet-name"
              placeholder="Sheet1"
              value={destination.sheetName || "Sheet1"}
              onChange={(e) => handleFieldChange("sheetName", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="excel-mode">Mode</Label>
            <Select
              value={destination.mode || "replace"}
              onValueChange={(value) => handleFieldChange("mode", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="replace">Replace (overwrite file)</SelectItem>
                <SelectItem value="append">Append (add to existing)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {destination.type === "csv" && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="csv-file-path">File Path *</Label>
            <Input
              id="csv-file-path"
              placeholder="C:/exports/data.csv"
              value={destination.filePath || ""}
              onChange={(e) => handleFieldChange("filePath", e.target.value)}
              required
            />
            <p className="text-sm text-gray-500">Full path where CSV file will be saved</p>
          </div>
          <div>
            <Label htmlFor="csv-delimiter">Delimiter</Label>
            <Input
              id="csv-delimiter"
              maxLength={1}
              placeholder=","
              value={destination.delimiter || ","}
              onChange={(e) => handleFieldChange("delimiter", e.target.value)}
            />
            <p className="text-sm text-gray-500">Character to separate values (default: comma)</p>
          </div>
          <div>
            <Label htmlFor="csv-mode">Mode</Label>
            <Select
              value={destination.mode || "replace"}
              onValueChange={(value) => handleFieldChange("mode", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="replace">Replace (overwrite file)</SelectItem>
                <SelectItem value="append">Append (add to existing)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="csv-include-headers"
              checked={destination.includeHeaders !== false}
              onChange={(e) => handleFieldChange("includeHeaders", e.target.checked)}
            />
            <Label htmlFor="csv-include-headers">Include Headers</Label>
          </div>
        </div>
      )}
    </div>
  )
}

export function CreateJobForm({ job, onJobCreated, onJobUpdated }: CreateJobFormProps) {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [connections, setConnections] = useState<any[]>([])
  
  // Convert job schedule (cron string) to ScheduleConfig
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(() => {
    if (job && job.schedule && job.schedule !== "manual") {
      return parseCronToConfig(job.schedule)
    }
    // Default: every 2 minutes
    return { type: 'repeated', mode: 'every', everyUnit: 'minutes', everyValue: 2 }
  })
  const [isManualSchedule, setIsManualSchedule] = useState(() => job ? job.schedule === "manual" : false)
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [partners, setPartners] = useState<string[]>([])
  const [jobGroups, setJobGroups] = useState<string[]>([])
  const [fyFilter, setFyFilter] = useState<string>("all")
  const [groupFilter, setGroupFilter] = useState<string>("all")
  const [partnerFilter, setPartnerFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [selectedConnections, setSelectedConnections] = useState(() => job ? (job.connectionIds || (job.connectionId ? [job.connectionId] : [])) : [])
  const [destinations, setDestinations] = useState(() => job ? job.destinations || [] : [])
  const [name, setName] = useState(() => job ? job.name || "" : "")
  const [group, setGroup] = useState(() => job ? job.group || "" : "")
  const [query, setQuery] = useState(() => job ? job.query || "" : "")
  const [trigger, setTrigger] = useState(() => job ? job.trigger || "always" : "always")
  // destinations handled elsewhere in the original UI — keep placeholder here

  // @ts-ignore - Electron types
  const { ipcRenderer } = window.require('electron')

  // load settings and connections
  useEffect(() => {
    (async () => {
      try {
        const fys = await ipcRenderer.invoke('get-financial-years')
        setFinancialYears((fys || []).map((f: any) => f.year || f))
        const parts = await ipcRenderer.invoke('get-partners')
        setPartners((parts || []).map((p: any) => p.name || p))
        const jgs = await ipcRenderer.invoke('get-job-groups')
        setJobGroups(jgs || [])
        const conns = await ipcRenderer.invoke('get-connections')
        setConnections(conns || [])
      } catch (err) {
        console.error('Failed to load data for create job form', err)
      }
    })()
  }, [])

  // populate form if editing
  useEffect(() => {
    if (job) {
      setName(job.name || "")
      setGroup(job.group || "")
      setQuery(job.query || "")
      setTrigger(job.trigger || "always")
      // Handle both connectionIds (new) and connectionId (legacy) for backward compatibility
      // Filter out connections that no longer exist
      const jobConnectionIds = job.connectionIds || (job.connectionId ? [job.connectionId] : [])
      const existingConnectionIds = jobConnectionIds.filter((id: string) => connections.some(c => c.id === id))
      setSelectedConnections(existingConnectionIds)
      setDestinations(job.destinations || [])
      
      // Parse schedule from job
      if (job.schedule === "manual") {
        setIsManualSchedule(true)
      } else if (job.schedule) {
        setIsManualSchedule(false)
        setScheduleConfig(parseCronToConfig(job.schedule))
      }
    }
  }, [job, connections])

  const filteredConnections = connections.filter((c) => {
    // Search filter - check name, server, database
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesSearch = 
        c.name?.toLowerCase().includes(search) ||
        c.server?.toLowerCase().includes(search) ||
        c.database?.toLowerCase().includes(search)
      if (!matchesSearch) return false
    }
    
    // FY, Group, Partner, Status filters
    if (fyFilter !== 'all' && c.financialYear !== fyFilter) return false
    if (groupFilter !== 'all' && c.group !== groupFilter) return false
    if (partnerFilter !== 'all' && c.partner !== partnerFilter) return false
    if (statusFilter !== 'all' && (c as any).testStatus !== statusFilter) return false
    return true
  })

  const handleConnectionToggle = (connectionId: string) => {
    setSelectedConnections((prev: string[]) =>
      prev.includes(connectionId) ? prev.filter((id: string) => id !== connectionId) : [...prev, connectionId]
    )
  }

  const selectAllRef = useRef<HTMLInputElement | null>(null)

  const handleSelectAll = (checked: boolean) => {
    setSelectedConnections(checked ? filteredConnections.map((c) => c.id) : [])
  }

  // manage indeterminate state for select all
  useEffect(() => {
  const el = selectAllRef.current
  if (!el) return
    if (selectedConnections.length > 0 && selectedConnections.length < filteredConnections.length) {
      el.indeterminate = true
      el.checked = false
    } else {
      el.indeterminate = false
      el.checked = selectedConnections.length === filteredConnections.length && filteredConnections.length > 0
    }
  }, [selectedConnections, filteredConnections])

  const addDestination = () => {
    setDestinations([...destinations, { type: "" }])
  }

  const updateDestination = (index: number, updatedDestination: Destination) => {
    const newDestinations = [...destinations]
    newDestinations[index] = updatedDestination
    setDestinations(newDestinations)
  }

  const removeDestination = (index: number) => {
    setDestinations(destinations.filter((_: any, i: number) => i !== index))
  }


  const handleSubmitJob = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    // Validate destinations
    if (destinations.length === 0) {
      toast.error("Please add at least one destination!")
      setIsLoading(false)
      return
    }

    // Validate destination configurations
    for (const dest of destinations) {
      if (!dest.type) {
        toast.error("Please select a type for all destinations!")
        setIsLoading(false)
        return
      }

      if ((dest.type === "webhook" || dest.type === "custom_api") && !dest.url) {
        toast.error("Please provide a URL for webhook/custom API destinations!")
        setIsLoading(false)
        return
      }

      if (dest.type === "google_sheets" && (!dest.spreadsheetId || !dest.credentialsJson)) {
        toast.error("Please provide spreadsheet ID and credentials for Google Sheets destinations!")
        setIsLoading(false)
        return
      }

      if ((dest.type === "excel" || dest.type === "csv") && !dest.filePath) {
        toast.error("Please provide a file path for file destinations!")
        setIsLoading(false)
        return
      }
    }

    // Generate schedule cron from config
    const scheduleCron = isManualSchedule ? "manual" : generateCron(scheduleConfig);
    
    const jobData = {
      id: job?.id || `job_${Date.now()}`,
      name: name,
      group: group || undefined,
      query: query,
      schedule: scheduleCron,
      trigger: trigger,
      connectionIds: selectedConnections,
      destinations: destinations,
      createdAt: job?.createdAt || new Date(),
    }

    try {
      if (job) {
        await ipcRenderer.invoke('update-job', jobData.id, jobData)
        toast.success('Job updated')
        onJobUpdated?.()
      } else {
        await ipcRenderer.invoke('add-job', jobData)
        toast.success('Job created')
        onJobCreated?.()
      }
      navigate('/jobs')
    } catch (err: any) {
      console.error('Failed to save job', err)
      toast.error(`Failed to ${job ? 'update' : 'create'} job`)
    }

    setIsLoading(false)
  }

  // Render
  return (
    <div className="p-4">
      <div className="w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>{job ? 'Edit Job' : 'Create Job'}</CardTitle>
            <CardDescription>{job ? 'Update the scheduled SQL job' : 'Create a scheduled SQL job'}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitJob}>
              {/* Name */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Job name *</Label>
                  <Input id="name" name="name" placeholder="My Job" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>

                <div>
                  <Label htmlFor="group">Job Group</Label>
                  <Select value={group || "none"} onValueChange={(v) => setGroup(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select group (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Group</SelectItem>
                      {jobGroups.map((jg) => (
                        <SelectItem key={jg} value={jg}>{jg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filters */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold">Filters</h4>
                  {/* Search Box */}
                  <div className="mb-4">
                    <Label htmlFor="connection-search" className="text-sm">Search Connections</Label>
                    <Input
                      id="connection-search"
                      type="text"
                      placeholder="Search by name, server, or database..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Financial Year</Label>
                      <Select value={fyFilter} onValueChange={(v) => setFyFilter(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Financial Years</SelectItem>
                          {financialYears.map((fy) => (
                            <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Group</Label>
                      <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="self">Self</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Partner</Label>
                      <Select value={partnerFilter} onValueChange={(v) => setPartnerFilter(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Partners" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Partners</SelectItem>
                          {partners.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    <div className="space-y-2">
                      <Label className="text-sm">Connection Status</Label>
                      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="connected">Connected</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="not-tested">Not Tested</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { /* noop - filters apply live */ }}>
                      Filter
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setSearchTerm(''); setFyFilter('all'); setGroupFilter('all'); setPartnerFilter('all'); setStatusFilter('all'); }}>
                      Clear Filter
                    </Button>
                  </div>
                </div>

                {/* Connections */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Connections * <span className="text-sm text-gray-500">({selectedConnections.length} selected)</span></Label>
                    <div className="flex items-center space-x-2">
                      <input ref={selectAllRef} type="checkbox" id="select-all" onChange={(e) => handleSelectAll(e.target.checked)} className="h-4 w-4 border border-gray-300 rounded" />
                      <Label htmlFor="select-all" className="text-sm">Select All</Label>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
                    <div className="space-y-2">
                      {filteredConnections.length === 0 ? (
                        <div className="text-sm text-gray-500">No connections match the filters</div>
                      ) : (
                        filteredConnections.map((connection) => (
                          <div key={connection.id} className="flex items-center space-x-2">
                            <input type="checkbox" id={`conn-${connection.id}`} checked={selectedConnections.includes(connection.id)} onChange={() => handleConnectionToggle(connection.id)} className="h-4 w-4 border border-gray-300 rounded" />
                            <Label htmlFor={`conn-${connection.id}`} className="text-sm">
                              {connection.name}
                              {connection.store && <span className="text-gray-500 ml-1">({connection.store})</span>}
                            </Label>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-500">Select one or more connections to run this job in parallel</p>
                </div>

                {/* SQL Query */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold">SQL Query</h4>
                  <div className="space-y-2">
                    <Label htmlFor="query">Query *</Label>
                    <Textarea id="query" name="query" rows={5} placeholder="SELECT * FROM TableName" value={query} onChange={(e) => setQuery(e.target.value)} required />
                    <p className="text-sm text-gray-500">💡 Tip: Use WHERE clauses to filter data efficiently</p>
                  </div>
                </div>

                {/* Schedule & Trigger */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold">Schedule & Trigger</h4>
                  
                  {/* Manual/Scheduled Toggle */}
                  <div className="space-y-2">
                    <Label>Schedule Mode</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="scheduleMode"
                          checked={!isManualSchedule}
                          onChange={() => setIsManualSchedule(false)}
                        />
                        <span>Scheduled (Automatic)</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="scheduleMode"
                          checked={isManualSchedule}
                          onChange={() => setIsManualSchedule(true)}
                        />
                        <span>Manual (On Demand Only)</span>
                      </label>
                    </div>
                  </div>

                  {/* Advanced Schedule Selector */}
                  {!isManualSchedule && (
                    <div className="space-y-2">
                      <AdvancedScheduleSelector
                        value={scheduleConfig}
                        onChange={setScheduleConfig}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="trigger">Trigger</Label>
                    <Select value={trigger} onValueChange={(value) => setTrigger(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Always (every run)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">Always (every run)</SelectItem>
                        <SelectItem value="onChange">On Change (data changed)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-gray-500">onChange only sends when data differs from last run</p>
                  </div>
                </div>

                {/* Destinations */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-lg font-semibold">Destinations</h4>
                    <Button type="button" variant="outline" size="sm" onClick={addDestination}>
                      Add Destination
                    </Button>
                  </div>
                  <div className="border rounded-lg p-4 min-h-32">
                    {destinations.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-8">
                        No destinations added yet. Click "Add Destination" to get started.
                      </div>
                    ) : (
                      destinations.map((destination: any, index: number) => (
                        <DestinationItem
                          key={index}
                          destination={destination}
                          onUpdate={(updatedDestination) => updateDestination(index, updatedDestination)}
                          onRemove={() => removeDestination(index)}
                        />
                      ))
                    )}
                  </div>
                  <p className="text-sm text-gray-500">Select one or more destinations to send your data to</p>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => navigate('/jobs')}>Cancel</Button>
                  <Button type="submit" disabled={isLoading}>{isLoading ? (job ? 'Updating...' : 'Creating...') : (job ? 'Update Job' : 'Create Job')}</Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}