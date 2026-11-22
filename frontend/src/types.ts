export type SiteSettings = {
  business_name: string
  tagline: string
  hero_title: string
  hero_subtitle: string
  whatsapp: string
  email: string
  address: string
  instagram: string
  maps_url?: string
  maps_embed_url?: string
}

export type Product = {
  id: string
  name: string
  slug: string
  category: string
  short_description: string
  description: string
  price_start: number
  image_url: string
  min_order: number
  production_time: string
  materials: string[]
  sizes: string[]
  finishing: string[]
  features: string[]
  gallery_urls: string[]
  order_note: string
  is_featured: boolean
  is_published?: boolean
  sort_order?: number
}

export type Article = {
  id: string
  title: string
  slug: string
  excerpt: string
  content?: string
  cover_image_url: string
  status?: 'draft' | 'published'
  published_at?: string | null
}

export type Review = {
  id: string
  customer_name: string
  rating: number
  message: string
  is_approved?: boolean
  is_featured: boolean
  created_at?: string
}

export type VisitorLog = {
  id: number
  visit_date: string
  path: string
  referrer: string
  ip_hash: string
  user_agent: string
  device_type: 'desktop' | 'mobile' | 'tablet' | string
  created_at: string
}

export type VisitorLogsResponse = {
  data: VisitorLog[]
  page: number
  limit: number
  total: number
  total_pages: number
}
