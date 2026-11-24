import { useCallback, useEffect, useState } from 'react'
import { Activity, Boxes, Cpu, Database, HardDrive, Layers3, Plus, RefreshCw, Server, Trash2, Zap } from 'lucide-react'

const API = 'http://127.0.0.1:8000'
const hardwareOptions = [
  { value: 'high-cpu', label: 'High CPU', detail: 'CPU-intensive workloads', icon: Cpu },
  { value: 'high-memory', label: 'High Memory', detail: 'Memory-intensive workloads', icon: Database },
  { value: 'standard', label: 'Standard', detail: 'General-purpose workloads', icon: Server },
  { value: 'high-gpu', label: 'High GPU', detail: 'No matching node currently', icon: Zap },
]

function App() {
  const [health, setHealth] = useState(null)
  const [nodes, setNodes] = useState([])
  const [pods, setPods] = useState([])
  const [hardware, setHardware] = useState('high-cpu')
  const [affinity, setAffinity] = useState('required')
  const [replicas, setReplicas] = useState(2)
  const [name, setName] = useState('affinity-demo')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [h, n, p] = await Promise.all([
        fetch(`${API}/api/health`), fetch(`${API}/api/nodes`), fetch(`${API}/api/pods`)
      ])
      if (!h.ok || !n.ok || !p.ok) throw new Error('Backend could not retrieve cluster information.')
      setHealth(await h.json())
      setNodes(await n.json())
      setPods(await p.json())
      setError('')
    } catch (e) {
      setHealth(null)
      setError(e.message || 'Cannot connect to backend. Start FastAPI on port 8000.')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function createWorkload(e) {
    e.preventDefault()
    setBusy(true); setMessage(''); setError('')
    try {
      const response = await fetch(`${API}/api/workloads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hardware, affinity, replicas: Number(replicas) })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not create workload')
      setMessage(data.message)
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function deleteWorkload() {
    setBusy(true); setMessage(''); setError('')
    try {
      const response = await fetch(`${API}/api/workloads/${name}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not delete workload')
      setMessage(data.message)
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const counts = {
    running: pods.filter(p => p.status === 'Running').length,
    pending: pods.filter(p => p.status === 'Pending').length,
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><Layers3 size={21}/></div><div><strong>Node Affinity</strong><span>Kubernetes scheduling lab</span></div></div>
      <div className={`connection ${health ? 'online' : 'offline'}`}><span className="dot"/>{health ? `Connected · ${health.kubernetes_version}` : 'Cluster disconnected'}</div>
    </header>

    <section className="hero">
      <div><div className="eyebrow"><Activity size={14}/> LIVE CLUSTER MONITOR</div><h1>Pod Scheduling Dashboard</h1><p>Create workloads and watch Kubernetes schedule them onto nodes using hardware labels.</p></div>
      <button className="refresh" onClick={refresh}><RefreshCw size={16}/> Refresh</button>
    </section>

    {error && <div className="alert error">{error}</div>}
    {message && <div className="alert success">{message}</div>}

    <section className="stats">
      <Stat icon={Server} label="Worker nodes" value={nodes.filter(n => !n.roles.includes('control-plane')).length}/>
      <Stat icon={Boxes} label="Managed pods" value={pods.length}/>
      <Stat icon={Activity} label="Running" value={counts.running}/>
      <Stat icon={HardDrive} label="Pending" value={counts.pending}/>
    </section>

    <section className="content-grid">
      <div className="panel create-panel">
        <div className="panel-heading"><div><span className="eyebrow">WORKLOAD CONFIGURATION</span><h2>Create a workload</h2></div><span className="step">01</span></div>
        <form onSubmit={createWorkload}>
          <label className="field-label" htmlFor="workload-name">Deployment name</label>
          <input id="workload-name" value={name} onChange={e => setName(e.target.value)} pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?" maxLength="40" required/>
          <div className="field-row"><label className="field-label">Hardware requirement</label><span className="hint">Node label: hardware</span></div>
          <div className="hardware-grid">
            {hardwareOptions.map(opt => { const Icon = opt.icon; return <button type="button" key={opt.value} className={`hardware-option ${hardware === opt.value ? 'selected' : ''}`} onClick={() => setHardware(opt.value)}><Icon size={19}/><strong>{opt.label}</strong><small>{opt.detail}</small></button> })}
          </div>
          <div className="form-two">
            <div><label className="field-label" htmlFor="replicas">Replicas</label><input id="replicas" type="number" min="1" max="10" value={replicas} onChange={e => setReplicas(e.target.value)}/></div>
            <div><label className="field-label" htmlFor="affinity">Affinity type</label><select id="affinity" value={affinity} onChange={e => setAffinity(e.target.value)}><option value="required">Required (strict)</option><option value="preferred">Preferred (soft)</option></select></div>
          </div>
          <div className="rule-preview"><span>Scheduling rule</span><code>hardware In [{hardware}]</code><small>{affinity === 'required' ? 'Pods can only run on matching nodes.' : 'Matching nodes are preferred, but other nodes are allowed.'}</small></div>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Working…' : <><Plus size={17}/> Create / Update Deployment</>}</button>
          <button className="danger-button" type="button" disabled={busy} onClick={deleteWorkload}><Trash2 size={16}/> Delete this Deployment</button>
        </form>
        <p className="footnote">Creates a real Kubernetes Deployment in the <code>default</code> namespace.</p>
      </div>

      <div className="right-column">
        <div className="panel">
          <div className="panel-heading"><div><span className="eyebrow">CLUSTER TOPOLOGY</span><h2>Worker nodes</h2></div><span className="step">02</span></div>
          <div className="node-list">
            {nodes.map(node => <div className="node" key={node.name}><div className="node-symbol"><Server size={18}/></div><div className="node-info"><strong>{node.name}</strong><span>hardware: {node.hardware}</span></div><span className={`status ${node.status === 'Ready' ? 'ready' : 'notready'}`}>{node.status}</span></div>)}
            {!nodes.length && <p className="empty">Node information will appear when connected.</p>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading"><div><span className="eyebrow">LIVE KUBERNETES DATA</span><h2>Managed pods</h2></div><span className="step">03</span></div>
          <div className="table-wrap"><table><thead><tr><th>Pod</th><th>Status</th><th>Node</th></tr></thead><tbody>
            {pods.map(p => <tr key={p.name}><td><strong>{p.name}</strong><small>{p.ip}</small></td><td><span className={`status ${p.status.toLowerCase()}`}>{p.status}</span></td><td>{p.node}</td></tr>)}
          </tbody></table>{!pods.length && <p className="empty">No dashboard-managed Pods yet. Create a workload to begin.</p>}</div>
          <p className="footnote">Pod list refreshes when you use Refresh or create/delete a workload.</p>
        </div>
      </div>
    </section>
    <footer>Node Affinity Lab <span>·</span> React + FastAPI + Kubernetes</footer>
  </main>
}

function Stat({ icon: Icon, label, value }) {
  return <div className="stat"><div className="stat-icon"><Icon size={19}/></div><div><strong>{value}</strong><span>{label}</span></div></div>
}

export default App
