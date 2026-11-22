import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, API_URL } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import type { VisitorLogsResponse, VisitorLog } from '../../types'

function parseUserAgent(ua: string): { browser: string; os: string; engine: string } {
  if (!ua) return { browser: 'Tidak Diketahui', os: 'Tidak Diketahui', engine: 'Standard' }
  const uaLower = ua.toLowerCase()

  let os = 'Lainnya'
  if (uaLower.includes('windows nt 10.0')) os = 'Windows 10/11'
  else if (uaLower.includes('windows')) os = 'Windows'
  else if (uaLower.includes('iphone')) os = 'iOS (iPhone)'
  else if (uaLower.includes('ipad')) os = 'iPadOS'
  else if (uaLower.includes('android')) os = 'Android'
  else if (uaLower.includes('macintosh') || uaLower.includes('mac os x')) os = 'macOS'
  else if (uaLower.includes('linux')) os = 'Linux'

  let browser = 'Browser Lain'
  let engine = 'Blink / WebKit'
  if (uaLower.includes('edg/')) browser = 'Microsoft Edge'
  else if (uaLower.includes('opr/') || uaLower.includes('opera/')) browser = 'Opera'
  else if (uaLower.includes('samsungbrowser/')) browser = 'Samsung Internet'
  else if (uaLower.includes('chrome/') && !uaLower.includes('edg/')) browser = 'Google Chrome'
  else if (uaLower.includes('safari/') && !uaLower.includes('chrome/')) {
    browser = 'Apple Safari'
    engine = 'WebKit'
  } else if (uaLower.includes('firefox/')) {
    browser = 'Mozilla Firefox'
    engine = 'Gecko'
  }

  return { browser, os, engine }
}

function getBrowserIcon(browser: string): string {
  const b = browser.toLowerCase()
  if (b.includes('chrome')) return '🌐'
  if (b.includes('safari')) return '🧭'
  if (b.includes('firefox')) return '🦊'
  if (b.includes('edge')) return '🌀'
  if (b.includes('opera')) return '🔴'
  if (b.includes('samsung')) return '📱'
  return '🌍'
}

function getAvatarColor(hash: string): { bg: string; color: string; gradient: string } {
  const colors = [
    { bg: '#dbeafe', color: '#1e40af', gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' },
    { bg: '#dcfce7', color: '#166534', gradient: 'linear-gradient(135deg, #10b981, #047857)' },
    { bg: '#fef3c7', color: '#92400e', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
    { bg: '#f3e8ff', color: '#6b21a8', gradient: 'linear-gradient(135deg, #a855f7, #7e22ce)' },
    { bg: '#ffe4e6', color: '#9f1239', gradient: 'linear-gradient(135deg, #f43f5e, #be123c)' },
    { bg: '#e0e7ff', color: '#3730a3', gradient: 'linear-gradient(135deg, #6366f1, #4338ca)' },
    { bg: '#ccfbf1', color: '#115e59', gradient: 'linear-gradient(135deg, #14b8a6, #0f766e)' },
    { bg: '#ffedd5', color: '#9a3412', gradient: 'linear-gradient(135deg, #f97316, #c2410c)' },
  ]
  if (!hash) return colors[0]
  let sum = 0
  for (let i = 0; i < hash.length; i++) {
    sum += hash.charCodeAt(i)
  }
  return colors[sum % colors.length]
}

function getPathBadge(path: string): { icon: string; label: string; isHome: boolean } {
  if (path === '/' || path === '') return { icon: '🏠', label: 'Beranda Utama', isHome: true }
  if (path.startsWith('/produk/')) return { icon: '🏷️', label: 'Detail Produk', isHome: false }
  if (path.startsWith('/produk')) return { icon: '🛍️', label: 'Katalog Produk', isHome: false }
  if (path.startsWith('/artikel/')) return { icon: '📖', label: 'Baca Artikel', isHome: false }
  if (path.startsWith('/artikel')) return { icon: '📰', label: 'Daftar Artikel', isHome: false }
  if (path.startsWith('/review')) return { icon: '⭐', label: 'Ulasan Pelanggan', isHome: false }
  if (path.startsWith('/about')) return { icon: '🏢', label: 'Tentang Percetakan', isHome: false }
  return { icon: '📄', label: 'Halaman Publik', isHome: false }
}

function getReferrerBadge(ref: string): {
  type: string
  icon: string
  name: string
  sub: string
  cls: string
  url?: string
} {
  if (!ref || ref.trim() === '') {
    return {
      type: 'direct',
      icon: '⚡',
      name: 'Direct / Langsung',
      sub: 'Ketik URL / Bookmark',
      cls: 'ref-pill-direct',
    }
  }
  const l = ref.toLowerCase()
  if (l.includes('google.')) {
    return {
      type: 'google',
      icon: '🔍',
      name: 'Google Search',
      sub: 'Pencarian Organik',
      cls: 'ref-pill-google',
      url: ref,
    }
  }
  if (l.includes('instagram.')) {
    return {
      type: 'instagram',
      icon: '📸',
      name: 'Instagram',
      sub: 'Media Sosial',
      cls: 'ref-pill-instagram',
      url: ref,
    }
  }
  if (l.includes('whatsapp.') || l.includes('wa.me')) {
    return {
      type: 'whatsapp',
      icon: '💬',
      name: 'WhatsApp',
      sub: 'Chat Rujukan',
      cls: 'ref-pill-whatsapp',
      url: ref,
    }
  }
  if (l.includes('facebook.') || l.includes('fb.')) {
    return {
      type: 'facebook',
      icon: '👥',
      name: 'Facebook',
      sub: 'Media Sosial',
      cls: 'ref-pill-facebook',
      url: ref,
    }
  }
  if (l.includes('tiktok.')) {
    return {
      type: 'tiktok',
      icon: '🎵',
      name: 'TikTok',
      sub: 'Media Sosial',
      cls: 'ref-pill-tiktok',
      url: ref,
    }
  }
  try {
    const u = new URL(ref)
    return {
      type: 'other',
      icon: '🔗',
      name: u.hostname,
      sub: 'Domain Luar',
      cls: 'ref-pill-other',
      url: ref,
    }
  } catch {
    return {
      type: 'other',
      icon: '🔗',
      name: ref.length > 24 ? ref.substring(0, 24) + '...' : ref,
      sub: 'Rujukan Web',
      cls: 'ref-pill-other',
      url: ref,
    }
  }
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 45) return 'Baru saja'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} mnt lalu`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour} jam lalu`
    const diffDays = Math.floor(diffHour / 24)
    if (diffDays === 1) return 'Kemarin'
    if (diffDays < 7) return `${diffDays} hari lalu`
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

function formatWIB(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' WIB'
  } catch {
    return dateStr
  }
}

export function VisitorsAdminPage() {
  const { accessToken } = useAuth()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [device, setDevice] = useState<'all' | 'desktop' | 'mobile' | 'tablet'>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [date, setDate] = useState('')
  const [selectedLog, setSelectedLog] = useState<VisitorLog | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const q = useQuery<VisitorLogsResponse>({
    queryKey: ['admin-visitors', page, limit, device, debouncedSearch, date],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (device !== 'all') params.set('device', device)
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      if (date) params.set('date', date)

      return apiFetch<VisitorLogsResponse>(`/admin/visitors?${params.toString()}`, {}, accessToken)
    },
    enabled: !!accessToken,
  })

  const logs = q.data?.data || []
  const total = q.data?.total || 0
  const totalPages = q.data?.total_pages || 1

  // Hitung ringkasan perangkat dari halaman yang sedang tampil
  const pageStats = useMemo(() => {
    let mobileCount = 0
    let desktopCount = 0
    let tabletCount = 0
    for (const l of logs) {
      if (l.device_type === 'mobile') mobileCount++
      else if (l.device_type === 'tablet') tabletCount++
      else desktopCount++
    }
    return { mobileCount, desktopCount, tabletCount }
  }, [logs])

  const copyToClipboard = (text: string, key: string) => {
    if (navigator?.clipboard) {
      void navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2200)
    }
  }

  const handleExportCSV = async () => {
    try {
      setIsExporting(true)
      const params = new URLSearchParams()
      if (device !== 'all') params.set('device', device)
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      if (date) params.set('date', date)

      const res = await fetch(`${API_URL}/admin/visitors/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      if (!res.ok) throw new Error('Gagal mengekspor data kunjungan')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dateTag = date || new Date().toISOString().slice(0, 10)
      a.download = `daftar_pengunjung_${dateTag}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert((err as Error).message || 'Terjadi kesalahan saat mengunduh CSV')
    } finally {
      setIsExporting(false)
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="admin-page visitors-dashboard">
      {/* Toast Notifikasi Salin */}
      {copiedKey && (
        <div className="visitor-toast">
          ✓ {copiedKey} berhasil disalin!
        </div>
      )}

      {/* Header Utama Modern */}
      <div className="visitor-hero-header">
        <div className="visitor-hero-info">
          <div className="visitor-hero-badge">
            <span className="live-dot-pulse" />
            <span>PENCATAT AKTIF REAL-TIME</span>
          </div>
          <h1>Daftar Pengunjung Website</h1>
          <p>
            Pantau arus kunjungan calon pelanggan, rujukan traffic (Google, Medsos, Direct), jenis perangkat, dan halaman cetak yang paling diminati.
          </p>
        </div>

        <div className="visitor-hero-actions">
          <button
            type="button"
            className="btn btn-export-excel"
            onClick={handleExportCSV}
            disabled={isExporting || total === 0}
            title="Download seluruh hasil filter ke file CSV untuk Excel"
          >
            {isExporting ? (
              <span className="btn-spinner" />
            ) : (
              <span className="btn-icon">📥</span>
            )}
            <span>Export Excel (CSV)</span>
          </button>

          <button
            type="button"
            className="btn btn-refresh-modern"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            title="Perbarui data kunjungan terbaru"
          >
            <span className={`refresh-icon ${q.isFetching ? 'spin' : ''}`}>🔄</span>
            <span>{q.isFetching ? 'Memperbarui...' : 'Segarkan'}</span>
          </button>
        </div>
      </div>

      {/* Kartu Ringkasan Cepat (KPI Summary Cards) */}
      <div className="visitor-kpi-grid">
        <div className="visitor-kpi-card kpi-total">
          <div className="kpi-icon-wrap">
            <span className="kpi-emoji">👥</span>
          </div>
          <div className="kpi-meta">
            <span className="kpi-label">TOTAL LOG KUNJUNGAN</span>
            <strong className="kpi-value">{total.toLocaleString('id-ID')}</strong>
            <span className="kpi-sub">Kunjungan unik per IP/hari</span>
          </div>
        </div>

        <div className="visitor-kpi-card kpi-device">
          <div className="kpi-icon-wrap">
            <span className="kpi-emoji">📱</span>
          </div>
          <div className="kpi-meta">
            <span className="kpi-label">SMARTPHONE / MOBILE</span>
            <strong className="kpi-value">
              {logs.length > 0 ? Math.round((pageStats.mobileCount / logs.length) * 100) : 0}%
            </strong>
            <span className="kpi-sub">{pageStats.mobileCount} dari {logs.length} sesi tampil</span>
          </div>
        </div>

        <div className="visitor-kpi-card kpi-desktop">
          <div className="kpi-icon-wrap">
            <span className="kpi-emoji">💻</span>
          </div>
          <div className="kpi-meta">
            <span className="kpi-label">KOMPUTER / DESKTOP</span>
            <strong className="kpi-value">
              {logs.length > 0 ? Math.round((pageStats.desktopCount / logs.length) * 100) : 0}%
            </strong>
            <span className="kpi-sub">{pageStats.desktopCount} dari {logs.length} sesi tampil</span>
          </div>
        </div>

        <div className="visitor-kpi-card kpi-status">
          <div className="kpi-icon-wrap">
            <span className="kpi-emoji">⚡</span>
          </div>
          <div className="kpi-meta">
            <span className="kpi-label">STATUS PRIVASI</span>
            <strong className="kpi-value" style={{ fontSize: '18px', color: '#047857' }}>
              SHA-256 Masked
            </strong>
            <span className="kpi-sub">Privasi pengunjung terlindungi</span>
          </div>
        </div>
      </div>

      {/* Filter & Toolbar Panel Modern */}
      <div className="visitor-filter-card">
        <div className="visitor-filter-top">
          {/* Search Box dengan icon SVG */}
          <div className="visitor-modern-search">
            <span className="search-svg-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Cari path (/produk, /artikel), rujukan (Google, IG), atau browser..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Pencarian data pengunjung"
            />
            {search && (
              <button
                type="button"
                className="search-clear-icon"
                onClick={() => setSearch('')}
                title="Hapus kata kunci"
              >
                ✕
              </button>
            )}
          </div>

          {/* Device Segmented Control */}
          <div className="visitor-device-segmented">
            <button
              type="button"
              className={`segmented-tab ${device === 'all' ? 'active' : ''}`}
              onClick={() => { setDevice('all'); setPage(1) }}
            >
              <span>Semua</span>
            </button>
            <button
              type="button"
              className={`segmented-tab ${device === 'mobile' ? 'active' : ''}`}
              onClick={() => { setDevice('mobile'); setPage(1) }}
            >
              <span>📱 Mobile</span>
            </button>
            <button
              type="button"
              className={`segmented-tab ${device === 'desktop' ? 'active' : ''}`}
              onClick={() => { setDevice('desktop'); setPage(1) }}
            >
              <span>💻 Desktop</span>
            </button>
            <button
              type="button"
              className={`segmented-tab ${device === 'tablet' ? 'active' : ''}`}
              onClick={() => { setDevice('tablet'); setPage(1) }}
            >
              <span>📟 Tablet</span>
            </button>
          </div>
        </div>

        {/* Baris Bawah Filter: Shortcut Tanggal & Limit */}
        <div className="visitor-filter-bottom">
          <div className="date-quick-chips">
            <span className="filter-label-inline">Tanggal:</span>
            <button
              type="button"
              className={`quick-chip ${date === '' ? 'active' : ''}`}
              onClick={() => { setDate(''); setPage(1) }}
            >
              Semua Waktu
            </button>
            <button
              type="button"
              className={`quick-chip ${date === todayStr ? 'active' : ''}`}
              onClick={() => { setDate(todayStr); setPage(1) }}
            >
              Hari Ini
            </button>
            <div className="custom-date-picker-wrap">
              <input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); setPage(1) }}
                title="Pilih tanggal khusus"
              />
            </div>
          </div>

          <div className="limit-and-count">
            <label htmlFor="limit-rows-select" className="filter-label-inline">
              Baris:
            </label>
            <select
              id="limit-rows-select"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value))
                setPage(1)
              }}
              className="select-custom"
            >
              <option value="10">10 data</option>
              <option value="15">15 data</option>
              <option value="25">25 data</option>
              <option value="50">50 data</option>
              <option value="100">100 data</option>
            </select>
          </div>
        </div>

        {/* Active Filter Chips / Reset */}
        {(debouncedSearch || device !== 'all' || date) && (
          <div className="active-filters-bar">
            <span className="active-filter-title">Filter aktif:</span>
            {debouncedSearch && (
              <span className="filter-tag">
                Kata kunci: "{debouncedSearch}"
                <button type="button" onClick={() => setSearch('')}>✕</button>
              </span>
            )}
            {device !== 'all' && (
              <span className="filter-tag">
                Perangkat: {device}
                <button type="button" onClick={() => setDevice('all')}>✕</button>
              </span>
            )}
            {date && (
              <span className="filter-tag">
                Tanggal: {date}
                <button type="button" onClick={() => setDate('')}>✕</button>
              </span>
            )}
            <button
              type="button"
              className="reset-all-btn"
              onClick={() => {
                setSearch('')
                setDebouncedSearch('')
                setDevice('all')
                setDate('')
                setPage(1)
              }}
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* Tabel Data Pengunjung Modern Card */}
      <div className="visitor-table-card">
        <div className="table-responsive">
          <table className="visitor-modern-table">
            <thead>
              <tr>
                <th style={{ width: '170px' }}>WAKTU KUNJUNGAN</th>
                <th>HALAMAN YANG DIKUNJUNGI</th>
                <th style={{ width: '130px' }}>PERANGKAT</th>
                <th>SUMBER RUJUKAN</th>
                <th style={{ width: '150px' }}>PENGUNJUNG UNIK</th>
                <th>BROWSER & OS</th>
                <th style={{ width: '80px', textAlign: 'center' }}>DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                // Skeleton loading rows
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="skeleton-row">
                    <td>
                      <div className="skeleton-box" style={{ width: '110px', height: '18px', marginBottom: '4px' }} />
                      <div className="skeleton-box" style={{ width: '70px', height: '12px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '160px', height: '26px', borderRadius: '8px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '85px', height: '24px', borderRadius: '999px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '120px', height: '24px', borderRadius: '8px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '90px', height: '24px', borderRadius: '6px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '100px', height: '16px', marginBottom: '4px' }} />
                      <div className="skeleton-box" style={{ width: '60px', height: '12px' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="skeleton-box" style={{ width: '40px', height: '24px', margin: 'auto', borderRadius: '6px' }} />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="visitor-empty-cell">
                    <div className="visitor-empty-content">
                      <div className="empty-bubble-icon">🔍</div>
                      <h3>Tidak Ada Data Kunjungan Ditemukan</h3>
                      <p>
                        {debouncedSearch || device !== 'all' || date
                          ? 'Tidak ada kunjungan yang cocok dengan kombinasi filter saat ini. Coba sesuaikan kata kunci atau reset filter.'
                          : 'Kunjungan pada website toko cetak akan tercatat secara otomatis saat ada pengunjung yang membuka halaman publik.'}
                      </p>
                      {(debouncedSearch || device !== 'all' || date) && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSearch('')
                            setDebouncedSearch('')
                            setDevice('all')
                            setDate('')
                            setPage(1)
                          }}
                        >
                          Hapus Filter
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const ua = parseUserAgent(log.user_agent)
                  const ref = getReferrerBadge(log.referrer)
                  const pathInfo = getPathBadge(log.path)
                  const avatarColor = getAvatarColor(log.ip_hash)
                  const shortHash = log.ip_hash.substring(0, 8)
                  const relTime = formatRelativeTime(log.created_at)

                  return (
                    <tr key={log.id} className="visitor-table-row">
                      {/* Kolom Waktu */}
                      <td>
                        <div className="visitor-time-cell">
                          <div className="time-primary">
                            <span className="time-badge">{relTime}</span>
                          </div>
                          <span className="time-secondary" title={log.created_at}>
                            {formatWIB(log.created_at)}
                          </span>
                        </div>
                      </td>

                      {/* Kolom Path Halaman */}
                      <td>
                        <div className="visitor-path-cell">
                          <a
                            href={log.path}
                            target="_blank"
                            rel="noreferrer"
                            className="path-badge-link"
                            title={`Buka halaman ${log.path} di tab baru`}
                          >
                            <span className="path-icon">{pathInfo.icon}</span>
                            <span className="path-text">{log.path}</span>
                            <span className="external-arrow">↗</span>
                          </a>
                        </div>
                      </td>

                      {/* Kolom Perangkat */}
                      <td>
                        <span className={`device-tag device-tag-${log.device_type}`}>
                          {log.device_type === 'mobile' && '📱 Smartphone'}
                          {log.device_type === 'tablet' && '📟 Tablet'}
                          {log.device_type === 'desktop' && '💻 Komputer'}
                        </span>
                      </td>

                      {/* Kolom Sumber Rujukan */}
                      <td>
                        <div className="visitor-referrer-cell">
                          {ref.url ? (
                            <a
                              href={ref.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`referrer-badge-link ${ref.cls}`}
                              title={`Rujukan URL: ${ref.url}`}
                            >
                              <span className="ref-icon">{ref.icon}</span>
                              <div className="ref-text-wrap">
                                <strong className="ref-name">{ref.name}</strong>
                                <small className="ref-sub">{ref.sub}</small>
                              </div>
                            </a>
                          ) : (
                            <div className={`referrer-badge-static ${ref.cls}`}>
                              <span className="ref-icon">{ref.icon}</span>
                              <div className="ref-text-wrap">
                                <strong className="ref-name">{ref.name}</strong>
                                <small className="ref-sub">{ref.sub}</small>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Kolom Pengunjung Unik (Avatar + ID) */}
                      <td>
                        <div className="visitor-identity-cell">
                          <div
                            className="visitor-avatar"
                            style={{ background: avatarColor.gradient }}
                            title={`Pengunjung unik #${shortHash}`}
                          >
                            {shortHash.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="identity-text">
                            <span className="identity-hash">#{shortHash}</span>
                            <button
                              type="button"
                              className="btn-copy-id"
                              onClick={() => copyToClipboard(log.ip_hash, `ID #${shortHash}`)}
                              title="Salin full IP Hash"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Kolom Browser & OS */}
                      <td>
                        <div className="visitor-browser-cell">
                          <div className="browser-row">
                            <span className="browser-icon">{getBrowserIcon(ua.browser)}</span>
                            <strong>{ua.browser}</strong>
                          </div>
                          <span className="os-label">{ua.os}</span>
                        </div>
                      </td>

                      {/* Kolom Tombol Aksi Detail */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-inspect-log"
                          onClick={() => setSelectedLog(log)}
                          title="Inspeksi detail lengkap kunjungan ini"
                        >
                          👁️ Detail
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Navigasi Paginasi Modern */}
        <div className="visitor-table-footer">
          <div className="footer-count-info">
            Menampilkan <strong>{logs.length > 0 ? (page - 1) * limit + 1 : 0}</strong> -{' '}
            <strong>{Math.min(page * limit, total)}</strong> dari <strong>{total}</strong> log kunjungan
          </div>

          {totalPages > 1 && (
            <div className="modern-pagination-nav">
              <button
                type="button"
                className="page-nav-btn"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="Halaman pertama"
              >
                «
              </button>
              <button
                type="button"
                className="page-nav-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                title="Halaman sebelumnya"
              >
                ‹ Sebelumnya
              </button>

              <div className="page-number-cluster">
                <span className="page-badge-current">{page}</span>
                <span className="page-badge-sep">/</span>
                <span className="page-badge-total">{totalPages}</span>
              </div>

              <button
                type="button"
                className="page-nav-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                title="Halaman selanjutnya"
              >
                Selanjutnya ›
              </button>
              <button
                type="button"
                className="page-nav-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Halaman terakhir"
              >
                »
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Detail Kunjungan Modern */}
      {selectedLog && (
        <div className="modern-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modern-modal-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modern-modal-header">
              <div className="modal-header-left">
                <div
                  className="modal-avatar"
                  style={{ background: getAvatarColor(selectedLog.ip_hash).gradient }}
                >
                  {selectedLog.ip_hash.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3>Detail Sesi Kunjungan #{selectedLog.id}</h3>
                  <p>Dicatat pada {formatWIB(selectedLog.created_at)}</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => setSelectedLog(null)}
                aria-label="Tutup modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="modern-modal-body">
              {/* Highlight Grid */}
              <div className="modal-kpi-grid">
                <div className="modal-kpi-item">
                  <span className="item-label">HALAMAN TUJUAN</span>
                  <div className="item-value">
                    <a
                      href={selectedLog.path}
                      target="_blank"
                      rel="noreferrer"
                      className="modal-path-link"
                    >
                      {selectedLog.path} ↗
                    </a>
                  </div>
                </div>

                <div className="modal-kpi-item">
                  <span className="item-label">TIPE PERANGKAT</span>
                  <div className="item-value" style={{ textTransform: 'capitalize' }}>
                    {selectedLog.device_type === 'mobile' && '📱 Smartphone (Mobile)'}
                    {selectedLog.device_type === 'desktop' && '💻 Komputer (Desktop)'}
                    {selectedLog.device_type === 'tablet' && '📟 Tablet'}
                  </div>
                </div>

                <div className="modal-kpi-item">
                  <span className="item-label">SUMBER RUJUKAN</span>
                  <div className="item-value">
                    {selectedLog.referrer ? (
                      <a
                        href={selectedLog.referrer}
                        target="_blank"
                        rel="noreferrer"
                        className="modal-ref-link"
                      >
                        {selectedLog.referrer} ↗
                      </a>
                    ) : (
                      'Direct / Langsung (Buka URL)'
                    )}
                  </div>
                </div>

                <div className="modal-kpi-item">
                  <span className="item-label">BROWSER & SISTEM</span>
                  <div className="item-value">
                    {parseUserAgent(selectedLog.user_agent).browser} on{' '}
                    {parseUserAgent(selectedLog.user_agent).os}
                  </div>
                </div>
              </div>

              {/* IP Hash Box */}
              <div className="modal-section-card">
                <div className="section-card-header">
                  <span className="section-title">IDENTIFIKASI PENGUNJUNG (ANONYMOUS HASH)</span>
                  <button
                    type="button"
                    className="btn-tiny btn-copy"
                    onClick={() => copyToClipboard(selectedLog.ip_hash, 'IP Hash')}
                  >
                    Salin Hash
                  </button>
                </div>
                <code className="modal-code-block">{selectedLog.ip_hash}</code>
                <small className="section-note">
                  IP pengunjung di-hash dengan standar SHA-256 dan salt rahasia aplikasi agar privasi pengguna tetap aman sesuai kepatuhan regulasi data.
                </small>
              </div>

              {/* User Agent Raw Box */}
              <div className="modal-section-card">
                <div className="section-card-header">
                  <span className="section-title">RAW USER AGENT STRING</span>
                  <button
                    type="button"
                    className="btn-tiny btn-copy"
                    onClick={() => copyToClipboard(selectedLog.user_agent, 'User Agent')}
                  >
                    Salin User Agent
                  </button>
                </div>
                <div className="modal-ua-block">
                  {selectedLog.user_agent || 'Tidak tersedia'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modern-modal-footer">
              <a
                href={selectedLog.path}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                Kunjungi Halaman Ini ↗
              </a>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSelectedLog(null)}
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
