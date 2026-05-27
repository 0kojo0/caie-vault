import { useState, useEffect, useRef, useCallback } from 'react'
import { saveQuestions, getAllQuestions, clearQuestions, getQuestionCount, saveMeta, getMeta } from './db.js'
import { searchOffline } from './search.js'

const API = import.meta.env.VITE_API_URL || ''

// ─────────────────────────────────────────────────────────────────────────────
// Tiny shared components
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ size = 20, color = '#e8c547' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `2px solid #1e2235`, borderTop: `2px solid ${color}`,
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0
    }} />
  )
}

function Badge({ children, color = '#e8c547' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
      background: color + '22', color, border: `1px solid ${color}44`,
      fontFamily: 'Syne, sans-serif', textTransform: 'uppercase', whiteSpace: 'nowrap'
    }}>{children}</span>
  )
}

function Btn({ children, onClick, color = '#e8c547', textColor = '#07080f', disabled, style = {}, small }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '8px 14px' : '12px 22px',
        borderRadius: 10, fontWeight: 700,
        fontSize: small ? 13 : 15,
        background: disabled ? '#1e2235' : color,
        color: disabled ? '#7a7d99' : textColor,
        fontFamily: 'Syne, sans-serif',
        transition: 'opacity 0.15s, transform 0.1s',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
        ...style
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.85' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)' }}
      onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject color map
// ─────────────────────────────────────────────────────────────────────────────
const SUBJECT_COLOR = {
  'Physics':          '#4f8ef7',
  'Chemistry':        '#f97316',
  'Mathematics':      '#a855f7',
  'Computer Science': '#22d3ee',
  'Biology':          '#4ade80',
  'Accounting':       '#fbbf24',
  'Economics':        '#fb7185',
  'History':          '#f43f5e',
  'Islamiyat':        '#34d399',
}
const subjectColor = s => SUBJECT_COLOR[s] || '#e8c547'

const LEVEL_COLOR = { 'A Level': '#e8c547', 'AS Level': '#f97316', 'A2 Level': '#e8c547', 'O Level': '#4ade80', 'IGCSE': '#4f8ef7' }

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 1 — Welcome / Setup
// ─────────────────────────────────────────────────────────────────────────────
function SetupScreen({ onComplete }) {
  const [catalog, setCatalog]           = useState([])
  const [mathsComponents, setMathsComps] = useState([])
  const [selectedLevel, setLevel]       = useState(null)
  const [selectedSubs, setSubs]         = useState([])
  const [selectedComps, setComps]       = useState([]) // maths components
  const [step, setStep]                 = useState(1) // 1=level, 2=subjects, 3=maths components, 4=downloading
  const [downloading, setDownloading]   = useState(false)
  const [progress, setProgress]         = useState('')
  const [error, setError]               = useState('')
  const [showAdmin, setShowAdmin]       = useState(false)

  useEffect(() => {
    fetch(`${API}/api/catalog`)
      .then(r => r.json())
      .then(d => {
        setCatalog(d.catalog || [])
        setMathsComps(d.maths_components || [])
      })
      .catch(() => setError('Cannot reach server. Check your internet connection.'))
  }, [])

  const levels   = [...new Set(catalog.map(c => c.level))].sort()
  const subjects = catalog.filter(c => c.level === selectedLevel).map(c => c.subject)

  const toggleSub = s => setSubs(prev =>
    prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
  )

  const hasMaths = selectedSubs.includes('Mathematics')

  const goToStep3OrDownload = () => {
    if (hasMaths && mathsComponents.length > 0) {
      setStep(3)
    } else {
      startDownload([])
    }
  }

  const startDownload = async (comps) => {
    setStep(4)
    setDownloading(true)
    setError('')
    try {
      setProgress('Connecting to server...')
      let url = `${API}/api/download?level=${encodeURIComponent(selectedLevel)}&subjects=${encodeURIComponent(selectedSubs.join(','))}`
      if (comps.length > 0) url += `&components=${encodeURIComponent(comps.join(','))}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Server error')
      const data = await res.json()
      setProgress(`Saving ${data.count} questions to your device...`)
      await clearQuestions()
      await saveQuestions(data.questions)
      await saveMeta('setup', { level: selectedLevel, subjects: selectedSubs, components: comps, downloadedAt: Date.now() })
      setProgress(`Done! ${data.count} questions saved.`)
      setTimeout(() => onComplete({ level: selectedLevel, subjects: selectedSubs, components: comps }), 800)
    } catch (e) {
      setError('Download failed: ' + e.message)
      setDownloading(false)
      setStep(hasMaths && mathsComponents.length > 0 ? 3 : 2)
    }
  }

  const download = goToStep3OrDownload

  const s = {
    screen: {
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px', background: '#07080f',
      animation: 'fadeIn 0.4s ease'
    },
    card: {
      width: '100%', maxWidth: 480,
      background: '#0e1020', borderRadius: 20,
      border: '1px solid #1e2235', overflow: 'hidden',
      animation: 'fadeUp 0.4s ease'
    },
    header: {
      padding: '28px 28px 20px',
      borderBottom: '1px solid #1e2235',
      background: 'linear-gradient(135deg, #0e1020 0%, #131626 100%)'
    },
    logo: {
      fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26,
      color: '#f0f0f8', letterSpacing: -0.5, marginBottom: 4
    },
    body: { padding: '24px 28px 28px' },
    stepLabel: {
      fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
      color: '#e8c547', textTransform: 'uppercase',
      fontFamily: 'Syne, sans-serif', marginBottom: 8
    },
    title: {
      fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18,
      color: '#f0f0f8', marginBottom: 20
    },
    grid: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
      gap: 10, marginBottom: 24
    },
    chip: (active, color = '#e8c547') => ({
      padding: '12px 10px', borderRadius: 10, cursor: 'pointer',
      border: `1.5px solid ${active ? color : '#1e2235'}`,
      background: active ? color + '18' : '#07080f',
      color: active ? color : '#7a7d99',
      fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13,
      textAlign: 'center', transition: 'all 0.15s ease',
      userSelect: 'none'
    }),
  }

  return (
    <div style={s.screen}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.logo}>CAIE <span style={{ color: "#e8c547" }}>Vault</span></div>
          <p style={{ color: '#7a7d99', fontSize: 13 }}>
            Search past paper questions — offline, anytime.
          </p>
        </div>
        <div style={s.body}>

          {step === 1 && (
            <>
              <div style={s.stepLabel}>Step 1 of 2</div>
              <div style={s.title}>What are you studying?</div>
              <div style={s.grid}>
                {levels.length === 0 ? (
                  <p style={{ color: '#7a7d99', fontSize: 13, gridColumn: '1/-1' }}>
                    {error || 'Loading available levels...'}
                    {!error && <Spinner size={14} style={{ marginLeft: 8 }} />}
                  </p>
                ) : levels.map(level => (
                  <div
                    key={level}
                    style={s.chip(selectedLevel === level, LEVEL_COLOR[level])}
                    onClick={() => { setLevel(level); setSubs([]) }}
                  >
                    {level}
                  </div>
                ))}
              </div>
              <Btn
                onClick={() => setStep(2)}
                disabled={!selectedLevel}
                style={{ width: '100%' }}
              >
                Continue →
              </Btn>
            </>
          )}

          {step === 2 && (
            <>
              <div style={s.stepLabel}>Step 2 of 2</div>
              <div style={s.title}>Pick your subjects</div>
              <p style={{ fontSize: 13, color: '#7a7d99', marginBottom: 16, marginTop: -12 }}>
                Only these papers will be downloaded to save space.
              </p>
              <div style={s.grid}>
                {subjects.map(sub => (
                  <div
                    key={sub}
                    style={s.chip(selectedSubs.includes(sub), subjectColor(sub))}
                    onClick={() => toggleSub(sub)}
                  >
                    {sub}
                  </div>
                ))}
              </div>
              {error && (
                <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn
                  onClick={() => setStep(1)}
                  color='#1e2235' textColor='#a0a0c0'
                  style={{ flex: 1 }} small
                >
                  ← Back
                </Btn>
                <Btn
                  onClick={download}
                  disabled={selectedSubs.length === 0 || downloading}
                  style={{ flex: 2 }}
                >
                  {downloading ? <Spinner size={16} /> : `Download ${selectedSubs.length > 0 ? `(${selectedSubs.length} subject${selectedSubs.length > 1 ? 's' : ''})` : ''}`}
                </Btn>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={s.stepLabel}>Step 3 of 3</div>
              <div style={s.title}>Which Maths papers?</div>
              <p style={{ fontSize: 13, color: '#7a7d99', marginBottom: 16, marginTop: -12 }}>
                Pick the components you study. Others will download all Maths papers.
              </p>
              <div style={s.grid}>
                {mathsComponents.map(comp => (
                  <div
                    key={comp}
                    style={s.chip(selectedComps.includes(comp), '#a855f7')}
                    onClick={() => setComps(prev => prev.includes(comp) ? prev.filter(x => x !== comp) : [...prev, comp])}
                  >
                    {comp}
                  </div>
                ))}
              </div>
              {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn onClick={() => setStep(2)} color='#1e2235' textColor='#a0a0c0' style={{ flex: 1 }} small>← Back</Btn>
                <Btn onClick={() => startDownload(selectedComps)} style={{ flex: 2 }}>
                  Download {selectedComps.length > 0 ? `(${selectedComps.length} component${selectedComps.length > 1 ? 's' : ''})` : '(all Maths)'}
                </Btn>
              </div>
            </>
          )}

          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Spinner size={36} />
              <p style={{ marginTop: 20, color: '#a0a0c0', fontSize: 14 }}>{progress}</p>
              {error && (
                <p style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>{error}</p>
              )}
            </div>
          )}

        </div>
      </div>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      <p style={{ marginTop: 20, fontSize: 12, color: "#2e3350", textAlign: "center" }}>
        CAIE Vault · Questions sourced from official past papers
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Result card
// ─────────────────────────────────────────────────────────────────────────────
function ResultCard({ result, isSelected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '13px 14px', borderRadius: 10, cursor: 'pointer',
        background: isSelected ? '#131626' : 'transparent',
        border: `1px solid ${isSelected ? '#e8c547' : '#1e2235'}`,
        marginBottom: 6, transition: 'border-color 0.15s, background 0.15s',
        animation: 'fadeUp 0.25s ease both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 14, color: '#e8c547' }}>
          Q{result.q_num}
        </span>
        <Badge color={subjectColor(result.subject)}>{result.subject}</Badge>
        <Badge color={LEVEL_COLOR[result.level] || '#7a7d99'}>{result.level}</Badge>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#7a7d99', fontFamily: 'Syne, sans-serif' }}>
          {result.score}%
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#7a7d99', display: 'flex', gap: 10, marginBottom: 6 }}>
        <span>📅 {result.session} {result.year}</span>
        <span>Paper {result.paper_num}</span>
      </div>
      <p style={{
        fontSize: 13, color: '#b0b0c8', lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden'
      }}>
        {result.text?.slice(0, 160)}…
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail panel (full question view)
// ─────────────────────────────────────────────────────────────────────────────
function DetailPanel({ result, onClose }) {
  if (!result) return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#2e3350', padding: 40, gap: 10
    }}>
      <div style={{ fontSize: 44 }}>📖</div>
      <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 15 }}>
        Tap a result to read the question
      </p>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeUp 0.2s ease' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e2235', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <Badge color={subjectColor(result.subject)}>{result.subject}</Badge>
              <Badge color={LEVEL_COLOR[result.level] || '#7a7d99'}>{result.level}</Badge>
            </div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: '#f0f0f8', marginBottom: 4 }}>
              Question {result.q_num}
            </div>
            <div style={{ fontSize: 12, color: '#7a7d99' }}>
              {result.session} {result.year} · Paper {result.paper_num} · {result.filename}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: '#161929', color: '#7a7d99',
            border: '1px solid #1e2235', borderRadius: 7,
            padding: '6px 10px', fontSize: 15, flexShrink: 0
          }}>✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <pre style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: 'DM Sans, sans-serif', fontSize: 14,
          lineHeight: 1.9, color: '#d8d8f0'
        }}>
          {result.text || '[No text extracted]'}
        </pre>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Panel
// ─────────────────────────────────────────────────────────────────────────────
function AdminPanel({ onClose }) {
  const [password, setPassword]   = useState('caievault2024')
  const [authed, setAuthed]       = useState(false)
  const [papers, setPapers]       = useState([])
  const [uploadLog, setUploadLog] = useState([])
  const [loading, setLoading]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  useEffect(() => { login() }, [])

  const login = async () => {
    try {
      const res = await fetch(`${API}/api/admin/papers`, {
        headers: { 'x-admin-password': password }
      })
      if (res.ok) { setAuthed(true); loadPapers(password) }
      else alert('Wrong password')
    } catch { alert('Cannot reach server') }
  }

  const loadPapers = async (pw = password) => {
    setLoading(true)
    const res  = await fetch(`${API}/api/admin/papers`, { headers: { 'x-admin-password': pw } })
    const data = await res.json()
    setPapers(data.papers || [])
    setLoading(false)
  }

  const uploadFiles = async (files) => {
    setUploading(true)
    setUploadLog([])
    for (const file of files) {
      setUploadLog(l => [...l, `Uploading ${file.name}...`])
      try {
        const form = new FormData()
        form.append('file', file)
        const res  = await fetch(`${API}/api/admin/upload`, {
          method: 'POST', headers: { 'x-admin-password': password }, body: form
        })
        const data = await res.json()
        const msg = data.status === 'ok'
          ? `✅ ${file.name} → ${data.subject} ${data.year} (${data.questions_found} Qs)`
          : `⏭ ${file.name}: ${data.message}`
        setUploadLog(l => [...l.slice(0, -1), msg])
      } catch (e) {
        setUploadLog(l => [...l.slice(0, -1), `❌ ${file.name}: ${e.message}`])
      }
    }
    setUploading(false)
    loadPapers()
  }

  const deletePaper = async (id, name) => {
    if (!confirm(`Remove ${name} from database?`)) return
    await fetch(`${API}/api/admin/papers/${id}`, {
      method: 'DELETE', headers: { 'x-admin-password': password }
    })
    loadPapers()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000000bb', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      animation: 'fadeIn 0.2s ease'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0e1020', border: '1px solid #1e2235', borderRadius: 18,
        width: '100%', maxWidth: 640, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'fadeUp 0.25s ease'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #1e2235',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 17, color: '#e8c547' }}>
            ⚙ Admin Panel
          </span>
          <button onClick={onClose} style={{
            background: '#161929', color: '#7a7d99',
            border: '1px solid #1e2235', borderRadius: 7, padding: '6px 10px'
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 22 }}>
          {!authed ? (
            <>
              <p style={{ color: '#7a7d99', marginBottom: 14, fontSize: 14 }}>
                Enter your admin password to manage papers.
              </p>
              <input
                type="password" placeholder="Admin password"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && login()}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 9,
                  background: '#161929', color: '#f0f0f8',
                  border: '1px solid #1e2235', fontSize: 14, marginBottom: 12
                }}
              />
              <Btn onClick={login} style={{ width: '100%' }}>Login</Btn>
            </>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#e8c547' }}
                onDragLeave={e => e.currentTarget.style.borderColor = '#1e2235'}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor = '#1e2235'
                  uploadFiles([...e.dataTransfer.files].filter(f => f.name.endsWith('.pdf')))
                }}
                style={{
                  border: '2px dashed #1e2235', borderRadius: 12,
                  padding: '28px 20px', textAlign: 'center',
                  cursor: 'pointer', marginBottom: 18, transition: 'border-color 0.2s'
                }}
              >
                <div style={{ fontSize: 30, marginBottom: 6 }}>📂</div>
                <p style={{ color: '#7a7d99', fontSize: 14 }}>
                  Drag & drop PDFs, or <span style={{ color: '#e8c547' }}>click to browse</span>
                </p>
                <p style={{ color: '#2e3350', fontSize: 11, marginTop: 4 }}>
                  CAIE naming: 9702_s23_qp_12.pdf → Physics · Summer 2023 · Paper 12
                </p>
                <input ref={fileRef} type="file" multiple accept=".pdf" style={{ display: 'none' }}
                  onChange={e => uploadFiles([...e.target.files])} />
              </div>

              {/* Upload log */}
              {uploadLog.length > 0 && (
                <div style={{
                  background: '#07080f', borderRadius: 8, padding: '10px 14px',
                  marginBottom: 18, maxHeight: 140, overflow: 'auto'
                }}>
                  {uploadLog.map((l, i) => (
                    <p key={i} style={{ fontSize: 12, color: '#9090b0', lineHeight: 1.8 }}>{l}</p>
                  ))}
                  {uploading && <div style={{ marginTop: 6 }}><Spinner size={14} /></div>}
                </div>
              )}

              {/* Papers list */}
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                Indexed Papers ({papers.length})
              </p>
              {loading ? <Spinner /> : papers.length === 0 ? (
                <p style={{ color: '#2e3350', fontSize: 13 }}>No papers yet. Upload some above.</p>
              ) : papers.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderRadius: 8,
                  background: '#07080f', border: '1px solid #1e2235',
                  marginBottom: 6, fontSize: 13
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: '#b0b0c8', fontSize: 12 }}>{p.filename}</span>
                    <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                      <Badge color={subjectColor(p.subject)}>{p.subject}</Badge>
                      <Badge color={LEVEL_COLOR[p.level] || '#7a7d99'}>{p.level}</Badge>
                      <span style={{ color: '#7a7d99', fontSize: 11 }}>{p.session} {p.year}</span>
                    </div>
                  </div>
                  <button onClick={() => deletePaper(p.id, p.filename)} style={{
                    background: 'transparent', color: '#f87171',
                    border: '1px solid #f8717133', borderRadius: 5,
                    padding: '3px 8px', fontSize: 11, cursor: 'pointer', flexShrink: 0
                  }}>Remove</button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Install prompt banner
// ─────────────────────────────────────────────────────────────────────────────
function InstallBanner({ onDismiss }) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#0e1020', borderTop: '1px solid #1e2235',
      padding: '14px 18px', zIndex: 100,
      animation: 'slideUp 0.3s ease',
      paddingBottom: `calc(14px + env(safe-area-inset-bottom, 0px))`
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 26, flexShrink: 0 }}>📲</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
            Add to Home Screen
          </p>
          {isIOS ? (
            <p style={{ fontSize: 12, color: '#7a7d99', lineHeight: 1.5 }}>
              Tap the <strong style={{ color: '#a0a0c0' }}>Share</strong> button (□↑) at the bottom of Safari, then tap <strong style={{ color: '#a0a0c0' }}>"Add to Home Screen"</strong>. Works offline after that!
            </p>
          ) : (
            <p style={{ fontSize: 12, color: '#7a7d99', lineHeight: 1.5 }}>
              Tap <strong style={{ color: '#a0a0c0' }}>Install</strong> to add CAIE Vault to your home screen and use it offline.
            </p>
          )}
        </div>
        <button onClick={onDismiss} style={{
          background: 'transparent', color: '#7a7d99', fontSize: 18,
          border: 'none', cursor: 'pointer', flexShrink: 0, paddingTop: 2
        }}>✕</button>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// AI Chat Screen
// ─────────────────────────────────────────────────────────────────────────────
function AIChatScreen({ profile }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: `Hi! I'm your CAIE study assistant. Ask me anything about ${profile.subjects.join(', ')} — definitions, explanations, worked examples, anything!` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef()

  const scrollDown = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  useEffect(() => { scrollDown() }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const newMessages = [...messages, { role: 'user', text }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages
            .filter((m, i) => !(m.role === 'assistant' && i === 0))
            .map(m => ({ role: m.role, content: m.text })),
          subjects: profile.subjects,
          level: profile.level
        })
      })
      const data = await res.json()
      const reply = data.reply || 'Sorry, I could not get a response. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error: Could not connect. Check your internet connection.' }])
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#07080f' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 0' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 12, animation: 'fadeUp 0.2s ease'
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: '#e8c547',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 4
              }}>✦</div>
            )}
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 12,
              background: msg.role === 'user' ? '#e8c547' : '#161929',
              color: msg.role === 'user' ? '#07080f' : '#e0e0f0',
              fontSize: 14, lineHeight: 1.6,
              borderBottomRightRadius: msg.role === 'user' ? 4 : 12,
              borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 12,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word'
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: '#e8c547',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
            }}>✦</div>
            <div style={{ background: '#161929', borderRadius: 12, borderBottomLeftRadius: 4, padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#7a7d99',
                    animation: `pulse 1.2s ease ${i * 0.2}s infinite`
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1e2235', background: '#0e1020' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask anything — definitions, examples, calculations..."
            style={{
              flex: 1, padding: '11px 14px', borderRadius: 10,
              background: '#161929', color: '#f0f0f8',
              border: '1px solid #1e2235', fontSize: 14,
            }}
            onFocus={e => e.target.style.borderColor = '#e8c547'}
            onBlur={e => e.target.style.borderColor = '#1e2235'}
          />
          <button onClick={send} disabled={loading || !input.trim()} style={{
            padding: '11px 16px', borderRadius: 10, border: 'none',
            background: loading || !input.trim() ? '#1e2235' : '#e8c547',
            color: loading || !input.trim() ? '#7a7d99' : '#07080f',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: 18, fontWeight: 700, transition: 'all 0.15s'
          }}>↑</button>
        </div>
        <p style={{ fontSize: 11, color: '#2e3350', marginTop: 6, textAlign: 'center' }}>
          Requires internet · Powered by Claude AI
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 2 — Main Search
// ─────────────────────────────────────────────────────────────────────────────
function SearchScreen({ profile, onResetSetup }) {
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState([])
  const [selected, setSelected]     = useState(null)
  const [searched, setSearched]     = useState(false)
  const [questions, setQuestions]   = useState([])
  const [qCount, setQCount]         = useState(0)
  const [showAdmin, setShowAdmin]   = useState(false)
  const [showInstall, setShowInstall] = useState(false)
  const [deferredPrompt, setDeferred] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const [activeTab, setActiveTab]   = useState('search') // 'search' or 'ai'
  const inputRef = useRef()

  // Load questions from IndexedDB on mount
  useEffect(() => {
    getAllQuestions().then(qs => {
      setQuestions(qs)
      setQCount(qs.length)
    })
  }, [])

  // PWA install prompt
  useEffect(() => {
    const handler = e => { e.preventDefault(); setDeferred(e); setShowInstall(true) }
    window.addEventListener('beforeinstallprompt', handler)
    // Show iOS hint after 3s if not already installed
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    if (isIOS && !isStandalone) {
      setTimeout(() => setShowInstall(true), 3000)
    }
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const doInstall = () => {
    if (deferredPrompt) { deferredPrompt.prompt(); setDeferred(null) }
    setShowInstall(false)
  }

  const doSearch = () => {
    if (!query.trim()) return
    setSearched(true)
    setSelected(null)
    setShowDetail(false)
    const res = searchOffline(query, questions, {
      subjects: profile.subjects,
      level: profile.level,
    })
    setResults(res)
  }

  const selectResult = r => {
    setSelected(r)
    setShowDetail(true)
  }

  const isMobile = window.innerWidth < 768

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#07080f' }}>

      {/* Header */}
      <header style={{
        padding: '14px 18px',
        borderBottom: '1px solid #0e1020',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#07080fee', backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 10,
        paddingTop: `calc(14px + env(safe-area-inset-top, 0px))`
      }}>
        <div>
          <span style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18,
            color: '#f0f0f8', letterSpacing: -0.5
          }}>
            CAIE <span style={{ color: '#e8c547' }}>Vault</span>
          </span>
          <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
            <Badge color={LEVEL_COLOR[profile.level] || '#e8c547'}>{profile.level}</Badge>
            {profile.subjects.slice(0, 3).map(s => (
              <Badge key={s} color={subjectColor(s)}>{s}</Badge>
            ))}
            {profile.subjects.length > 3 && (
              <Badge color='#7a7d99'>+{profile.subjects.length - 3}</Badge>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onResetSetup} style={{
            background: '#0e1020', color: '#7a7d99', border: '1px solid #1e2235',
            borderRadius: 7, padding: '6px 10px', fontSize: 11,
            fontFamily: 'Syne, sans-serif', cursor: 'pointer'
          }}>Change</button>
          <button onClick={() => setShowAdmin(true)} style={{
            background: '#0e1020', color: '#e8c547', border: '1px solid #e8c54733',
            borderRadius: 7, padding: '6px 10px', fontSize: 11,
            fontFamily: 'Syne, sans-serif', cursor: 'pointer', fontWeight: 700
          }}>Admin</button>
        </div>
      </header>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid #1e2235',
        background: '#07080f', padding: '0 18px'
      }}>
        {[{ id: 'search', label: '🔍 Search', }, { id: 'ai', label: '✦ Ask AI' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '12px 16px', background: 'transparent', border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid #e8c547' : '2px solid transparent',
            color: activeTab === tab.id ? '#e8c547' : '#7a7d99',
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', transition: 'all 0.15s', marginBottom: -1
          }}>{tab.label}</button>
        ))}
      </div>

      {/* AI Chat Tab */}
      {activeTab === 'ai' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AIChatScreen profile={profile} />
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* Search bar */}
      <div style={{
        padding: '16px 18px',
        background: searched ? '#07080fee' : 'transparent',
        position: searched ? 'sticky' : 'relative',
        top: searched ? 70 : 'auto', zIndex: 9,
        backdropFilter: searched ? 'blur(10px)' : 'none',
        borderBottom: searched ? '1px solid #0e1020' : 'none',
      }}>
        {!searched && (
          <div style={{ marginBottom: 20, marginTop: 16 }}>
            <h1 style={{
              fontFamily: 'Syne, sans-serif', fontWeight: 800,
              fontSize: isMobile ? 26 : 36, lineHeight: 1.2,
              color: '#f0f0f8', letterSpacing: -0.5, marginBottom: 8
            }}>
              Find any question,<br />
              <span style={{ color: '#e8c547' }}>instantly.</span>
            </h1>
            <p style={{ color: '#7a7d99', fontSize: 13, lineHeight: 1.6 }}>
              {qCount.toLocaleString()} questions cached offline · Type what you remember
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="e.g. define electric field strength..."
            style={{
              flex: 1, padding: '13px 16px', borderRadius: 10,
              background: '#0e1020', color: '#f0f0f8',
              border: '1px solid #1e2235', fontSize: 15,
              transition: 'border-color 0.2s'
            }}
            onFocus={e => e.target.style.borderColor = '#e8c547'}
            onBlur={e => e.target.style.borderColor = '#1e2235'}
          />
          <Btn onClick={doSearch} style={{ padding: '13px 18px', borderRadius: 10 }}>
            🔍
          </Btn>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div style={{ flex: 1, padding: '12px 18px', paddingBottom: showInstall ? 100 : 20 }}>
          <p style={{ fontSize: 12, color: '#7a7d99', marginBottom: 10 }}>
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>

          {results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#2e3350' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔎</div>
              <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 15 }}>No results found</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>Try different keywords or fewer words</p>
            </div>
          ) : results.map((r, i) => (
            <ResultCard
              key={i} result={r}
              isSelected={selected === r}
              onClick={() => selectResult(r)}
            />
          ))}
        </div>
      )}

      {/* Detail modal (mobile full screen) */}
      {showDetail && selected && (
        <div style={{
          position: 'fixed', inset: 0, background: '#07080f',
          zIndex: 50, display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.25s ease',
          paddingBottom: `env(safe-area-inset-bottom, 0px)`
        }}>
          <DetailPanel result={selected} onClose={() => { setShowDetail(false); setSelected(null) }} />
        </div>
      )}

      </div>} {/* end search tab */}

      {/* Admin */}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      {/* Install banner */}
      {showInstall && (
        <InstallBanner
          onDismiss={() => setShowInstall(false)}
          onInstall={doInstall}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const isAdminRoute = new URLSearchParams(window.location.search).get('admin') === 'vault2024sahil'

  useEffect(() => {
    getMeta('setup').then(saved => {
      if (saved) setProfile(saved)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSetupComplete = async (p) => { setProfile(p) }

  const handleReset = async () => {
    if (confirm('This will clear your downloaded questions and restart setup. Continue?')) {
      await clearQuestions()
      await saveMeta('setup', null)
      setProfile(null)
    }
  }

  if (isAdminRoute) return (
    <div style={{ minHeight: '100vh', background: '#07080f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 700 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: '#e8c547', marginBottom: 20 }}>
          CAIE Vault — Admin
        </div>
        <AdminPanel onClose={() => window.location.href = '/'} />
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07080f' }}>
      <Spinner size={32} />
    </div>
  )

  if (!profile) return <SetupScreen onComplete={handleSetupComplete} />
  return <SearchScreen profile={profile} onResetSetup={handleReset} />
}
