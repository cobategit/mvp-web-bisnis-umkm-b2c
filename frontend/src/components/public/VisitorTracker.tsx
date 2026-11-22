import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { API_URL } from '../../api/client'

export function VisitorTracker() {
  const location = useLocation()
  const lastRecordedRef = useRef<string>('')

  useEffect(() => {
    const fullPath = location.pathname + location.search

    // Jangan rekam kunjungan pada area CMS/admin
    if (location.pathname.startsWith('/cms')) {
      return
    }

    // Hindari duplikasi jika path sama persis (misal re-render component)
    if (lastRecordedRef.current === fullPath) {
      return
    }
    lastRecordedRef.current = fullPath

    // Cek sessionStorage: jika halaman ini sudah dikunjungi pada hari ini oleh browser ini,
    // tidak perlu mengirim request lagi untuk menghemat bandwidth
    const today = new Date().toISOString().slice(0, 10)
    const storageKey = `visited_${today}_${fullPath}`

    try {
      if (sessionStorage.getItem(storageKey)) {
        return
      }
    } catch {
      // Abaikan jika browser memblokir sessionStorage (misal mode private ketat)
    }

    try {
      fetch(`${API_URL}/public/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: fullPath,
          referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
        }),
        keepalive: true,
      })
        .then((res) => {
          if (res.ok) {
            try {
              sessionStorage.setItem(storageKey, '1')
            } catch {
              // Silently ignore
            }
          }
        })
        .catch(() => {
          // Abaikan error jaringan saat offline/gangguan agar tidak mengganggu browsing user
        })
    } catch {
      // Silently ignore
    }
  }, [location.pathname, location.search])

  return null
}
