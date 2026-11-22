import { useState, useMemo, useEffect, useRef } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { apiFetch, type ApiResult } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import type { Review } from '../../types'
import { ReviewCardSkeleton } from '../../components/Skeleton'

type AdminReviewsResponse = ApiResult<Review[]> & {
  next_page?: number | null
  page?: number
  limit?: number
  stats?: {
    total: number
    pending: number
    approved: number
    featured: number
  }
}

type ReviewForm = {
  customer_name: string
  rating: number
  message: string
  is_approved: boolean
  is_featured: boolean
}

const emptyForm: ReviewForm = {
  customer_name: '',
  rating: 5,
  message: '',
  is_approved: true,
  is_featured: false,
}

const ratingDescriptions: Record<number, string> = {
  1: '1 Bintang — Sangat Tidak Puas',
  2: '2 Bintang — Kurang Puas',
  3: '3 Bintang — Cukup',
  4: '4 Bintang — Puas',
  5: '5 Bintang — Sangat Puas',
}

const PAGE_SIZE = 8

export function ReviewsAdminPage() {
  const { accessToken, can } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Review | null>(null)
  const [form, setForm] = useState<ReviewForm>(emptyForm)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [filter, setFilter] = useState<
    'all' | 'pending' | 'approved' | 'featured'
  >('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const observerRef = useRef<HTMLDivElement>(null)

  // Debounce search agar tidak menembak API di setiap ketikan
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Lazy loading query menggunakan useInfiniteQuery
  const q = useInfiniteQuery<AdminReviewsResponse>({
    queryKey: ['admin-reviews', filter, debouncedSearch],
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      params.set('page', String(pageParam))
      params.set('limit', String(PAGE_SIZE))
      if (filter !== 'all') params.set('status', filter)
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())

      return apiFetch<AdminReviewsResponse>(
        `/admin/reviews?${params.toString()}`,
        {},
        accessToken,
      )
    },
    getNextPageParam: (lastPage) => lastPage.next_page ?? undefined,
    initialPageParam: 1,
    enabled: !!accessToken,
  })

  // IntersectionObserver untuk auto-load saat mendekati bagian bawah halaman
  useEffect(() => {
    const el = observerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          q.hasNextPage &&
          !q.isFetchingNextPage
        ) {
          void q.fetchNextPage()
        }
      },
      {
        threshold: 0.1,
        rootMargin: '150px',
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage])

  const save = useMutation({
    mutationFn: () =>
      editing
        ? apiFetch(
            `/admin/reviews/${editing.id}`,
            {
              method: 'PATCH',
              body: JSON.stringify(form),
            },
            accessToken,
          )
        : apiFetch(
            '/admin/reviews',
            {
              method: 'POST',
              body: JSON.stringify(form),
            },
            accessToken,
          ),
    meta: {
      action: editing
        ? 'Menyimpan perubahan review...'
        : 'Menambahkan review baru...',
    },
    onSuccess: () => {
      setError('')
      setSuccessMsg(
        editing
          ? 'Perubahan review berhasil disimpan!'
          : 'Review baru berhasil ditambahkan!',
      )
      setEditing(null)
      setForm(emptyForm)
      setShowForm(false)
      void qc.invalidateQueries({ queryKey: ['admin-reviews'] })
      void qc.invalidateQueries({ queryKey: ['reviews'] })
      setTimeout(() => setSuccessMsg(''), 4000)
    },
    onError: (e) => {
      setError(e.message)
      setSuccessMsg('')
    },
  })

  const toggleStatus = useMutation({
    mutationFn: (r: {
      id: string
      is_approved: boolean
      is_featured: boolean
    }) =>
      apiFetch(
        `/admin/reviews/${r.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            is_approved: r.is_approved,
            is_featured: r.is_featured,
          }),
        },
        accessToken,
      ),
    meta: { action: 'Memperbarui status review...' },
    onSuccess: () => {
      setError('')
      void qc.invalidateQueries({ queryKey: ['admin-reviews'] })
      void qc.invalidateQueries({ queryKey: ['reviews'] })
    },
    onError: (e) => setError(e.message),
  })

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/reviews/${id}`, { method: 'DELETE' }, accessToken),
    meta: { action: 'Menghapus review...' },
    onSuccess: () => {
      setError('')
      void qc.invalidateQueries({ queryKey: ['admin-reviews'] })
      void qc.invalidateQueries({ queryKey: ['reviews'] })
    },
    onError: (e) => setError(e.message),
  })

  function handleEdit(review: Review) {
    setEditing(review)
    setForm({
      customer_name: review.customer_name,
      rating: review.rating,
      message: review.message,
      is_approved: !!review.is_approved,
      is_featured: review.is_featured,
    })
    setShowForm(true)
    setError('')
    setSuccessMsg('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancel() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(false)
    setError('')
  }

  // Gabungkan semua data halaman yang telah di-fetch (lazy load)
  const reviewsList = useMemo(
    () => q.data?.pages.flatMap((page) => page.data ?? []) ?? [],
    [q.data],
  )

  // Statistik lengkap dari database (disediakan oleh backend)
  const stats = useMemo(() => {
    const firstPage = q.data?.pages[0]
    if (firstPage?.stats) {
      return firstPage.stats
    }
    return {
      total: reviewsList.length,
      pending: 0,
      approved: 0,
      featured: 0,
    }
  }, [q.data, reviewsList.length])

  function formatDate(iso?: string) {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return ''
    }
  }

  return (
    <div className='admin-page'>
      <div className='admin-title'>
        <div>
          <span className='eyebrow'>CMS</span>
          <h1>Review</h1>
          <p>
            Kelola, buat review baru, dan moderasi ulasan pelanggan yang tampil
            di website.
          </p>
        </div>
        {can('reviews.write') && (
          <button
            className='btn'
            type='button'
            onClick={() => {
              if (showForm && !editing) {
                handleCancel()
              } else {
                setEditing(null)
                setForm(emptyForm)
                setShowForm(true)
                setError('')
                setSuccessMsg('')
              }
            }}
          >
            {showForm && !editing ? 'Tutup Form' : '+ Tambah Review'}
          </button>
        )}
      </div>

      {/* Ringkasan Statistik */}
      <div className='stats-grid'>
        <div>
          <span>Total Review</span>
          <strong>{stats.total}</strong>
        </div>
        <div>
          <span>Menunggu Persetujuan</span>
          <strong style={{ color: stats.pending > 0 ? '#d97706' : undefined }}>
            {stats.pending}
          </strong>
        </div>
        <div>
          <span>Disetujui (Approved)</span>
          <strong style={{ color: '#059669' }}>{stats.approved}</strong>
        </div>
        <div>
          <span>Unggulan (Featured)</span>
          <strong style={{ color: '#2563eb' }}>{stats.featured}</strong>
        </div>
      </div>

      {/* Alert Notifikasi */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            marginBottom: '16px',
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}
      {successMsg && (
        <div
          style={{
            padding: '12px 16px',
            background: '#f0fdf4',
            color: '#166534',
            border: '1px solid #bbf7d0',
            borderRadius: '10px',
            marginBottom: '16px',
            fontWeight: 500,
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Form Tambah / Edit Review */}
      {showForm && can('reviews.write') && (
        <form
          className='panel form-grid review-form-panel'
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div
            className='span-2'
            style={{
              borderBottom: '1px solid var(--line)',
              paddingBottom: '12px',
              marginBottom: '8px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '20px' }}>
              {editing
                ? `Edit Review: ${editing.customer_name}`
                : 'Buat Review Baru'}
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '13px',
                color: 'var(--muted)',
              }}
            >
              {editing
                ? 'Perbarui data ulasan pelanggan atau sesuaikan status publikasinya.'
                : 'Tambahkan testimoni pelanggan secara langsung ke dalam sistem.'}
            </p>
          </div>

          <label>
            Nama Pelanggan
            <input
              required
              maxLength={120}
              placeholder='Contoh: Budi Santoso / PT Maju Bersama'
              value={form.customer_name}
              onChange={(e) =>
                setForm({ ...form, customer_name: e.target.value })
              }
            />
          </label>

          <label>
            Rating Bintang (1 - 5)
            <div className='star-rating-input'>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type='button'
                  className={`star-btn ${
                    star <= (hoverRating || form.rating) ? 'active' : ''
                  }`}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, rating: star }))
                  }
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  title={`${star} Bintang`}
                >
                  ★
                </button>
              ))}
              <span className='rating-label'>
                {ratingDescriptions[hoverRating || form.rating] ||
                  `${form.rating} Bintang`}
              </span>
            </div>
          </label>

          <label className='span-2'>
            Isi Ulasan / Testimoni
            <textarea
              required
              rows={4}
              maxLength={1000}
              placeholder='Tulis ulasan pengalaman pelanggan mengenai kualitas cetak, kecepatan layanan, atau kepuasan hasil...'
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
            <div className='char-counter'>
              {form.message.length} / 1000 karakter
            </div>
          </label>

          <div
            className='span-2'
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '24px',
              padding: '14px 16px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid var(--line)',
            }}
          >
            <label className='check' style={{ margin: 0 }}>
              <input
                type='checkbox'
                checked={form.is_approved}
                onChange={(e) =>
                  setForm({ ...form, is_approved: e.target.checked })
                }
              />
              <span>
                <strong>Disetujui (Approved)</strong>
                <small
                  style={{
                    display: 'block',
                    color: 'var(--muted)',
                    fontWeight: 400,
                  }}
                >
                  Review langsung ditampilkan di halaman review publik
                </small>
              </span>
            </label>

            <label className='check' style={{ margin: 0 }}>
              <input
                type='checkbox'
                checked={form.is_featured}
                onChange={(e) =>
                  setForm({ ...form, is_featured: e.target.checked })
                }
              />
              <span>
                <strong>Ulasan Unggulan (Featured)</strong>
                <small
                  style={{
                    display: 'block',
                    color: 'var(--muted)',
                    fontWeight: 400,
                  }}
                >
                  Diprioritaskan tampil di slider ulasan Beranda website
                </small>
              </span>
            </label>
          </div>

          <div className='form-actions span-2' style={{ marginTop: '8px' }}>
            <button className='btn' disabled={save.isPending}>
              {save.isPending
                ? 'Menyimpan...'
                : editing
                  ? 'Simpan Perubahan'
                  : 'Tambah Review'}
            </button>
            <button
              className='btn btn-secondary'
              type='button'
              onClick={handleCancel}
              disabled={save.isPending}
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className='review-filter-bar'>
        <div className='review-filter-tabs'>
          <button
            type='button'
            className={`review-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Semua ({stats.total})
          </button>
          <button
            type='button'
            className={`review-filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Menunggu Moderasi ({stats.pending})
          </button>
          <button
            type='button'
            className={`review-filter-btn ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
          >
            Disetujui ({stats.approved})
          </button>
          <button
            type='button'
            className={`review-filter-btn ${filter === 'featured' ? 'active' : ''}`}
            onClick={() => setFilter('featured')}
          >
            Unggulan ({stats.featured})
          </button>
        </div>

        <div className='review-search-wrap'>
          <input
            type='search'
            placeholder='Cari nama pelanggan atau ulasan...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Daftar Kartu Review dengan Lazy Loading */}
      {q.isLoading ? (
        <div className='review-admin-grid'>
          {Array.from({ length: 4 }).map((_, i) => (
            <ReviewCardSkeleton key={i} />
          ))}
        </div>
      ) : reviewsList.length === 0 ? (
        <div className='empty-reviews-state'>
          <h3 style={{ margin: 0, color: 'var(--navy)' }}>
            Tidak ada review ditemukan
          </h3>
          <p>
            {debouncedSearch
              ? `Tidak ada review yang cocok dengan kata kunci "${debouncedSearch}".`
              : filter !== 'all'
                ? 'Tidak ada review pada kategori filter ini.'
                : 'Belum ada review pelanggan tersimpan.'}
          </p>
          {can('reviews.write') && !showForm && (
            <button
              className='btn'
              type='button'
              onClick={() => {
                setEditing(null)
                setForm(emptyForm)
                setShowForm(true)
              }}
            >
              + Buat Review Baru
            </button>
          )}
        </div>
      ) : (
        <>
          <div className='review-admin-grid'>
            {reviewsList.map((r) => (
              <div className='panel review-admin-card' key={r.id}>
                <div>
                  <div className='review-card-top'>
                    <div>
                      <div className='stars' style={{ fontSize: '18px' }}>
                        {'★'.repeat(r.rating)}
                        <span style={{ color: '#cbd5e1' }}>
                          {'☆'.repeat(5 - r.rating)}
                        </span>
                      </div>
                      {r.created_at && (
                        <div className='review-card-date'>
                          {formatDate(r.created_at)}
                        </div>
                      )}
                    </div>
                    <div className='review-card-badges'>
                      {r.is_approved ? (
                        <span className='badge-pill success'>Disetujui</span>
                      ) : (
                        <span className='badge-pill warning'>Menunggu</span>
                      )}
                      {r.is_featured && (
                        <span className='badge-pill info'>Unggulan</span>
                      )}
                    </div>
                  </div>

                  <h3 style={{ margin: '8px 0 4px', fontSize: '18px' }}>
                    {r.customer_name}
                  </h3>
                  <p className='review-card-msg'>“{r.message}”</p>
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--line)',
                    paddingTop: '14px',
                    marginTop: 'auto',
                  }}
                >
                  <div className='review-controls'>
                    <label className='check'>
                      <input
                        disabled={
                          !can('reviews.write') || toggleStatus.isPending
                        }
                        type='checkbox'
                        checked={!!r.is_approved}
                        onChange={(e) =>
                          toggleStatus.mutate({
                            id: r.id,
                            is_approved: e.target.checked,
                            is_featured: r.is_featured,
                          })
                        }
                      />
                      <span>Approved</span>
                    </label>

                    <label className='check'>
                      <input
                        disabled={
                          !can('reviews.write') || toggleStatus.isPending
                        }
                        type='checkbox'
                        checked={r.is_featured}
                        onChange={(e) =>
                          toggleStatus.mutate({
                            id: r.id,
                            is_approved: !!r.is_approved,
                            is_featured: e.target.checked,
                          })
                        }
                      />
                      <span>Featured</span>
                    </label>

                    {can('reviews.write') && (
                      <div
                        style={{
                          marginLeft: 'auto',
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'center',
                        }}
                      >
                        <button
                          type='button'
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--blue)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                          onClick={() => handleEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          type='button'
                          className='danger-link'
                          disabled={del.isPending}
                          onClick={() =>
                            confirm(`Hapus review dari "${r.customer_name}"?`) &&
                            del.mutate(r.id)
                          }
                        >
                          {del.isPending ? 'Menghapus...' : 'Hapus'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Lazy Load Sentinel & Infinite Scroll Controls */}
          <div ref={observerRef} className='review-lazy-load-sentinel'>
            {q.isFetchingNextPage && (
              <div className='review-lazy-loading-box'>
                <div className='review-lazy-spinner' />
                <span>Memuat review berikutnya...</span>
              </div>
            )}

            {q.hasNextPage && !q.isFetchingNextPage && (
              <button
                type='button'
                className='btn btn-secondary review-load-more-btn'
                onClick={() => void q.fetchNextPage()}
              >
                Muat Lebih Banyak Ulasan ↓
              </button>
            )}

            {!q.hasNextPage && reviewsList.length > 0 && (
              <div className='review-lazy-load-end'>
                ✓ Menampilkan seluruh {reviewsList.length} ulasan
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
