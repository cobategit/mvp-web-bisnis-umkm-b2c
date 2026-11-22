CREATE TABLE IF NOT EXISTS visitor_logs (
    id BIGSERIAL PRIMARY KEY,
    visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    path VARCHAR(255) NOT NULL,
    referrer VARCHAR(500) NOT NULL DEFAULT '',
    ip_hash VARCHAR(64) NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    device_type VARCHAR(20) NOT NULL DEFAULT 'desktop',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pastikan kolom visit_date tersedia jika tabel sudah pernah dibuat sebelumnya
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS visit_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Hapus duplikasi per tanggal, ip, dan path sebelum membuat unique index
DELETE FROM visitor_logs a USING visitor_logs b
WHERE a.id < b.id 
  AND a.visit_date = b.visit_date 
  AND a.ip_hash = b.ip_hash 
  AND a.path = b.path;

-- Unique index per hari (visit_date), IP pengunjung (ip_hash), dan path halaman
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_logs_daily_unique ON visitor_logs (visit_date, ip_hash, path);

CREATE INDEX IF NOT EXISTS idx_visitor_logs_visit_date ON visitor_logs (visit_date);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_created_at ON visitor_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_path ON visitor_logs (path);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_ip_created ON visitor_logs (created_at, ip_hash);
