import { useState } from 'react'
import './App.css'

interface ScheduledBlock {
  block_id: string
  task_id: string
  department: string
  track_section: string
  location_km: string
  scheduled_start: string
  scheduled_end: string
  duration_minutes: number
  priority: string
  criticality_score: number
  window_id: string
  status: string
  shadow_block_group: string | null
  conflict_reason: string | null
  // Approval workflow state (in-memory for prototype)
  approvalStatus?: 'Pending' | 'Approved' | 'Rejected'
  rejectionReason?: string
}

interface ApprovalState {
  [blockId: string]: {
    status: 'Pending' | 'Approved' | 'Rejected'
    rejectionReason?: string
  }
}

interface OptimizationResult {
  total_tasks: number
  scheduled_tasks: number
  shadow_blocks: number
  conflicts_detected: number
  asset_availability_gain: number
  schedule: ScheduledBlock[]
}

const API_BASE = 'http://localhost:5053/api'

const DEPT_COLORS: Record<string, string> = {
  'Engineering': '#22d3ee',
  'Signal & Telecommunication': '#a78bfa',
  'Traction Distribution': '#34d399'
}

const PRIORITY_COLORS: Record<string, string> = {
  'Critical': '#ef4444',
  'High': '#f97316',
  'Medium': '#eab308',
  'Low': '#22c55e'
}

function App() {
  const [schedule, setSchedule] = useState<OptimizationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDept, setSelectedDept] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline')
  // Approval workflow state (in-memory for prototype)
  const [approvalState, setApprovalState] = useState<ApprovalState>({})
  const [rejectingBlock, setRejectingBlock] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string>('')

  const generateSchedule = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/optimization/generate`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to generate schedule')
      const data = await response.json()
      setSchedule(data)
      // Reset approval state when generating new schedule
      setApprovalState({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Approval workflow handlers (in-memory for prototype)
  const handleApprove = (blockId: string) => {
    setApprovalState(prev => ({
      ...prev,
      [blockId]: { status: 'Approved' }
    }))
  }

  const handleReject = (blockId: string, reason: string) => {
    if (!reason.trim()) {
      alert('Rejection reason is required')
      return
    }
    setApprovalState(prev => ({
      ...prev,
      [blockId]: { status: 'Rejected', rejectionReason: reason }
    }))
    setRejectingBlock(null)
    setRejectionReason('')
  }

  const filteredSchedule = schedule?.schedule.filter(block => 
    selectedDept === 'all' || block.department === selectedDept
  ) || []

  // Get time range for timeline
  const getTimeRange = () => {
    if (!filteredSchedule.length) return { start: 0, end: 24 }
    const times = filteredSchedule.flatMap(b => [
      new Date(b.scheduled_start).getTime(),
      new Date(b.scheduled_end).getTime()
    ]).filter(t => t > 0)
    if (!times.length) return { start: 0, end: 24 }
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    return { 
      start: new Date(minTime).getHours(), 
      end: new Date(maxTime).getHours() + 1 
    }
  }

  const timeRange = getTimeRange()
  const hours = Array.from({ length: timeRange.end - timeRange.start }, (_, i) => timeRange.start + i)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
              <span className="text-xl font-bold">R</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">RailBlock AI</h1>
              <p className="text-xs text-slate-400">Intelligent Block Planning System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={generateSchedule}
              disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-emerald-600 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {loading ? 'Optimizing...' : '🚀 Generate Plan'}
            </button>
            <button
              onClick={() => { setViewMode('list'); generateSchedule(); }}
              disabled={loading}
              className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50 transition-all"
              title="Generate and show list view for approval workflow demo"
            >
              ⚡ Demo Mode
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {schedule && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard label="Total Tasks" value={schedule.total_tasks} color="cyan" />
            <StatCard label="Scheduled" value={schedule.scheduled_tasks} color="emerald" />
            <StatCard label="Shadow Blocks" value={schedule.shadow_blocks} color="violet" />
            <StatCard label="Conflicts" value={schedule.conflicts_detected} color="red" />
            <StatCard label="Availability Gain" value={`+${schedule.asset_availability_gain}%`} color="amber" />
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-4 mb-6">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm"
          >
            <option value="all">All Departments</option>
            <option value="Engineering">Engineering</option>
            <option value="Signal & Telecommunication">Signal & Telecom</option>
            <option value="Traction Distribution">Traction Distribution</option>
          </select>
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-4 py-1.5 rounded-md text-sm transition-all ${viewMode === 'timeline' ? 'bg-slate-700' : ''}`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-1.5 rounded-md text-sm transition-all ${viewMode === 'list' ? 'bg-slate-700' : ''}`}
            >
              List
            </button>
          </div>
        </div>

        {/* Timeline View */}
        {viewMode === 'timeline' && schedule && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            {/* Time header */}
            <div className="flex border-b border-slate-800">
              <div className="w-48 p-3 text-xs font-medium text-slate-400">Department</div>
              <div className="flex-1 flex">
                {hours.map(hour => (
                  <div key={hour} className="flex-1 p-3 text-xs font-medium text-slate-400 border-l border-slate-800">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                ))}
              </div>
            </div>

            {/* Schedule rows */}
            <div className="divide-y divide-slate-800">
              {filteredSchedule.map((block) => {
                const startHour = new Date(block.scheduled_start).getHours()
                const endHour = new Date(block.scheduled_end).getHours()
                const startOffset = startHour - timeRange.start
                const duration = endHour - startHour
                
                return (
                  <div key={block.block_id} className="flex hover:bg-slate-800/50 transition-colors">
                    <div className="w-48 p-3">
                      <div className="text-sm font-medium" style={{ color: DEPT_COLORS[block.department] || '#fff' }}>
                        {block.department.split(' ')[0]}
                      </div>
                      <div className="text-xs text-slate-500">{block.location_km}</div>
                    </div>
                    <div className="flex-1 relative h-12">
                      {block.status !== 'Deferred' ? (
                        <div
                          className="absolute top-2 bottom-2 rounded-md px-2 flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity"
                          style={{
                            left: `${(startOffset / hours.length) * 100}%`,
                            width: `${(duration / hours.length) * 100}%`,
                            backgroundColor: DEPT_COLORS[block.department] || '#64748b',
                            opacity: block.status === 'Shadow Block' ? 0.8 : 1,
                            boxShadow: block.status === 'Shadow Block' ? '0 0 0 2px #a78bfa' : 'none'
                          }}
                          title={`${block.task_id}\n${block.scheduled_start} - ${block.scheduled_end}\n${block.status}`}
                        >
                          <span className="text-xs font-medium truncate text-slate-900">
                            {block.duration_minutes}m
                          </span>
                          {block.status === 'Shadow Block' && (
                            <span className="text-[10px] bg-violet-500/30 px-1 rounded">SHADOW</span>
                          )}
                        </div>
                      ) : (
                        <div className="absolute inset-y-2 left-4 right-4 bg-red-500/20 border border-red-500/30 rounded-md flex items-center px-3 text-xs text-red-400">
                          Deferred: {block.conflict_reason}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && schedule && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-slate-400">Task ID</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-400">Department</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-400">Priority</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-400">Start</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-400">Duration</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-400">Status</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-400">Approval</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredSchedule.map(block => {
                  const approval = approvalState[block.block_id]
                  const isRejecting = rejectingBlock === block.block_id
                  
                  return (
                    <tr key={block.block_id} className="hover:bg-slate-800/50">
                      <td className="p-3 text-sm font-mono">{block.task_id}</td>
                      <td className="p-3 text-sm" style={{ color: DEPT_COLORS[block.department] }}>
                        {block.department}
                      </td>
                      <td className="p-3">
                        <span
                          className="px-2 py-1 rounded text-xs pointer-events-none"
                          style={{ backgroundColor: PRIORITY_COLORS[block.priority] + '20', color: PRIORITY_COLORS[block.priority], whiteSpace: 'nowrap' }}
                          title={`Department: ${block.department}, Priority: ${block.priority}`}
                        >
                          {block.priority}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-slate-400">
                        {block.status !== 'Deferred' 
                          ? new Date(block.scheduled_start).toLocaleString('en-IN', { 
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                            })
                          : '-'
                        }
                      </td>
                      <td className="p-3 text-sm">{block.duration_minutes}m</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          block.status === 'Scheduled' ? 'bg-emerald-500/20 text-emerald-400' :
                          block.status === 'Shadow Block' ? 'bg-violet-500/20 text-violet-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {block.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {approval?.status === 'Approved' ? (
                          <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">
                            ✓ Approved
                          </span>
                        ) : approval?.status === 'Rejected' ? (
                          <div className="text-xs">
                            <span className="px-2 py-1 rounded bg-red-500/20 text-red-400">✗ Rejected</span>
                            <div className="text-red-300 mt-1 text-[10px] max-w-[150px] truncate" title={approval.rejectionReason}>
                              Reason: {approval.rejectionReason}
                            </div>
                          </div>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-400">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {block.status === 'Deferred' ? (
                          <span className="text-xs text-slate-500">N/A (Deferred)</span>
                        ) : approval?.status ? (
                          <span className="text-xs text-slate-500">Completed</span>
                        ) : isRejecting ? (
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              placeholder="Enter rejection reason..."
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              className="w-48 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded focus:outline-none focus:border-red-500"
                              autoFocus
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleReject(block.block_id, rejectionReason)}
                                disabled={!rejectionReason.trim()}
                                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Confirm Reject
                              </button>
                              <button
                                onClick={() => { setRejectingBlock(null); setRejectionReason('') }}
                                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleApprove(block.block_id)}
                              className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 rounded"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectingBlock(block.block_id)}
                              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!schedule && !loading && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🚂</div>
            <h2 className="text-xl font-semibold mb-2">No Schedule Generated Yet</h2>
            <p className="text-slate-400 mb-6">Click the button above to generate an optimized block plan</p>
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    cyan: 'from-cyan-500 to-cyan-600',
    emerald: 'from-emerald-500 to-emerald-600',
    violet: 'from-violet-500 to-violet-600',
    red: 'from-red-500 to-red-600',
    amber: 'from-amber-500 to-amber-600'
  }
  
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className={`text-2xl font-bold bg-gradient-to-r ${colors[color]} bg-clip-text text-transparent`}>
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}

export default App
