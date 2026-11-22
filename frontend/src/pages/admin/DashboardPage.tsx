import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, type ApiResult } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import type { VisitorLogsResponse } from '../../types'

type DailyStat = {
  date: string
  label: string
  views: number
  uniques: number
}

type TopPage = {
  path: string
  views: number
}

type DeviceStat = {
  device: string
  count: number
}

type ReferrerStat = {
  source: string
  count: number
}

type VisitorStats = {
  today_views: number
  today_uniques: number
  total_views_7d: number
  total_uniques_7d: number
  daily_trend: DailyStat[]
  top_pages: TopPage[]
  devices: DeviceStat[]
  top_referrers: ReferrerStat[]
}

type Stats = {
  products: number
  articles: number
  pending_reviews: number
  active_users: number
  visitor_stats?: VisitorStats
}

export function DashboardPage() {
  const { accessToken, user } = useAuth()
  const q = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiFetch<ApiResult<Stats>>('/admin/dashboard', {}, accessToken),
    enabled: !!accessToken,
  })

  const latestVisitsQ = useQuery<VisitorLogsResponse>({
    queryKey: ['admin-latest-visitors'],
    queryFn: () => apiFetch<VisitorLogsResponse>('/admin/visitors?limit=6', {}, accessToken),
    enabled: !!accessToken,
  })

  const s = q.data?.data
  const vs = s?.visitor_stats
  const latestLogs = latestVisitsQ.data?.data || []

  // Hitung nilai maksimum untuk scaling bar chart
  const maxViews = Math.max(...(vs?.daily_trend?.map((d) => d.views) || [0]), 5)

  // Hitung total device & referrer untuk persentase
  const totalDeviceCount = vs?.devices?.reduce((acc, curr) => acc + curr.count, 0) || 0
  const maxTopPageView = Math.max(...(vs?.top_pages?.map((p) => p.views) || [0]), 1)

  return (
    <div className="admin-page">
      <div className="admin-title">
        <div>
          <span className="eyebrow">CMS</span>
          <h1>Dashboard</h1>
          <p>Selamat datang, {user?.name}.</p>
        </div>
      </div>

      {/* Ringkasan Konten & Toko */}
      <div className="stats-grid">
        <div>
          <span>Produk</span>
          <strong>{s?.products ?? '—'}</strong>
        </div>
        <div>
          <span>Artikel</span>
          <strong>{s?.articles ?? '—'}</strong>
        </div>
        <div>
          <span>Review Menunggu</span>
          <strong>{s?.pending_reviews ?? '—'}</strong>
        </div>
        <div>
          <span>User Aktif</span>
          <strong>{s?.active_users ?? '—'}</strong>
        </div>
      </div>

      {/* Statistik Pengunjung Website */}
      <div className="analytics-section">
        <div className="analytics-header">
          <h2>Statistik Pengunjung Website</h2>
          <span className="live-badge">
            <span className="live-dot" /> Pencatat Kunjungan Aktif
          </span>
        </div>

        {/* 4 Kartu Metrik Pengunjung */}
        <div className="stats-grid">
          <div>
            <span>Kunjungan Hari Ini</span>
            <strong>{vs?.today_views ?? 0}</strong>
          </div>
          <div>
            <span>Pengunjung Unik Hari Ini</span>
            <strong>{vs?.today_uniques ?? 0}</strong>
          </div>
          <div>
            <span>Total Kunjungan (7 Hari)</span>
            <strong>{vs?.total_views_7d ?? 0}</strong>
          </div>
          <div>
            <span>Pengunjung Unik (7 Hari)</span>
            <strong>{vs?.total_uniques_7d ?? 0}</strong>
          </div>
        </div>

        {/* Grafik Tren 7 Hari */}
        <div className="chart-panel">
          <div className="chart-title-wrap">
            <h3>Tren Kunjungan 7 Hari Terakhir</h3>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-color legend-views" />
                Total Kunjungan (Pageviews)
              </span>
              <span className="legend-item">
                <span className="legend-color legend-uniques" />
                Pengunjung Unik (Unique Visitors)
              </span>
            </div>
          </div>

          {vs?.daily_trend && vs.daily_trend.length > 0 ? (
            <div className="bar-chart">
              {vs.daily_trend.map((day) => {
                const viewHeight = Math.max((day.views / maxViews) * 100, day.views > 0 ? 8 : 2)
                const uniqueHeight = Math.max((day.uniques / maxViews) * 100, day.uniques > 0 ? 8 : 2)

                return (
                  <div key={day.date} className="bar-col">
                    <div className="bar-pair">
                      <div
                        className="bar views-bar"
                        style={{ height: `${viewHeight}%` }}
                        title={`${day.label}: ${day.views} kunjungan`}
                      >
                        {day.views > 0 && <span className="bar-val">{day.views}</span>}
                      </div>
                      <div
                        className="bar uniques-bar"
                        style={{ height: `${uniqueHeight}%` }}
                        title={`${day.label}: ${day.uniques} pengunjung unik`}
                      >
                        {day.uniques > 0 && <span className="bar-val">{day.uniques}</span>}
                      </div>
                    </div>
                    <span className="bar-day-label">{day.label.split(',')[0]}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty-analytics-note">Belum ada data kunjungan dalam 7 hari terakhir.</div>
          )}
        </div>

        {/* Grid 2 Kolom: Top Halaman & Breakdown Traffic */}
        <div className="analytics-grid-2">
          {/* Top 5 Halaman */}
          <div className="analytics-card">
            <h3>Halaman Terpopuler (7 Hari Terakhir)</h3>
            {vs?.top_pages && vs.top_pages.length > 0 ? (
              <div>
                {vs.top_pages.map((item) => {
                  const percent = Math.round((item.views / maxTopPageView) * 100)
                  return (
                    <div key={item.path} className="top-page-row">
                      <div className="top-page-meta">
                        <span className="top-page-path">{item.path}</span>
                        <span className="top-page-views">{item.views} views</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="empty-analytics-note">Belum ada riwayat halaman yang diakses.</div>
            )}
          </div>

          {/* Perangkat & Sumber Pengunjung */}
          <div className="analytics-card">
            <h3>Perangkat & Sumber Pengunjung</h3>

            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                PERANGKAT PENGUNJUNG
              </span>
              {vs?.devices && vs.devices.length > 0 ? (
                <div className="device-badge-list">
                  {vs.devices.map((d) => {
                    const pct = totalDeviceCount > 0 ? Math.round((d.count / totalDeviceCount) * 100) : 0
                    const label = d.device === 'mobile' ? '📱 Smartphone / Mobile' : d.device === 'tablet' ? '📟 Tablet' : '💻 Komputer / Desktop'
                    return (
                      <div key={d.device} className="device-badge-row">
                        <span>{label}</span>
                        <strong>
                          {d.count} ({pct}%)
                        </strong>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="empty-analytics-note">Belum ada data perangkat.</div>
              )}
            </div>

            <div style={{ marginTop: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                SUMBER TRAFFIC TERATAS
              </span>
              {vs?.top_referrers && vs.top_referrers.length > 0 ? (
                <div className="device-badge-list">
                  {vs.top_referrers.map((r) => (
                    <div key={r.source} className="device-badge-row">
                      <span>{r.source}</span>
                      <strong>{r.count}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-analytics-note">Belum ada data traffic referal.</div>
              )}
            </div>
          </div>
        </div>

        {/* Tabel Kunjungan Terbaru */}
        <div className="panel" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--navy)' }}>Kunjungan Terbaru</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Daftar aktivitas kunjungan pengguna terbaru di website publik.
              </p>
            </div>
            <Link to="/cms/pengunjung" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              Lihat Semua Log Pengunjung ({latestVisitsQ.data?.total ?? 0}) →
            </Link>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Halaman (Path)</th>
                  <th>Perangkat</th>
                  <th>Sumber</th>
                  <th>ID Pengunjung</th>
                </tr>
              </thead>
              <tbody>
                {latestVisitsQ.isLoading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>
                      Memuat kunjungan terbaru...
                    </td>
                  </tr>
                ) : latestLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                      Belum ada data kunjungan tercatat hari ini.
                    </td>
                  </tr>
                ) : (
                  latestLogs.map((log) => {
                    const shortHash = log.ip_hash.substring(0, 8)
                    const timeFormatted = new Date(log.created_at).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    }) + ' WIB'

                    const devLabel =
                      log.device_type === 'mobile'
                        ? '📱 Mobile'
                        : log.device_type === 'tablet'
                        ? '📟 Tablet'
                        : '💻 Desktop'

                    const refLabel = !log.referrer
                      ? 'Langsung (Direct)'
                      : log.referrer.toLowerCase().includes('google')
                      ? 'Google'
                      : log.referrer.toLowerCase().includes('instagram')
                      ? 'Instagram'
                      : log.referrer.toLowerCase().includes('facebook')
                      ? 'Facebook'
                      : log.referrer.toLowerCase().includes('whatsapp')
                      ? 'WhatsApp'
                      : 'Lainnya'

                    return (
                      <tr key={log.id}>
                        <td>
                          <strong>{log.visit_date}</strong>
                          <small>{timeFormatted}</small>
                        </td>
                        <td>
                          <a
                            href={log.path}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--navy)', fontWeight: 600, textDecoration: 'none' }}
                          >
                            {log.path}
                          </a>
                        </td>
                        <td>
                          <span style={{ fontSize: '13px' }}>{devLabel}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{refLabel}</span>
                        </td>
                        <td>
                          <span className="hash-pill">#{shortHash}</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Alur Kerja CMS */}
      <div className="panel" style={{ marginTop: '24px' }}>
        <h2>Alur Kerja CMS & Aturan Statistik</h2>
        <p>
          Produk dan artikel dapat disimpan sebagai draft/published. Review dari website masuk sebagai pending dan baru tampil setelah disetujui admin.
          Statistik pengunjung mencatat 1 kunjungan per IP per halaman setiap hari (akses berulang atau refresh pada halaman yang sama di hari yang sama tidak dihitung ganda; kunjungan akan dihitung kembali jika sudah berganti hari).
        </p>
      </div>
    </div>
  )
}
