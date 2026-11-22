package handler

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type RecordVisitPayload struct {
	Path     string `json:"path" binding:"required"`
	Referrer string `json:"referrer"`
}

func (a *App) RecordVisit(c *gin.Context) {
	var payload RecordVisitPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	path := strings.TrimSpace(payload.Path)
	if path == "" || !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// Jangan record halaman CMS atau request internal API
	if strings.HasPrefix(path, "/cms") || strings.HasPrefix(path, "/api") {
		c.Status(http.StatusNoContent)
		return
	}

	if len(path) > 255 {
		path = path[:255]
	}

	referrer := strings.TrimSpace(payload.Referrer)
	if len(referrer) > 500 {
		referrer = referrer[:500]
	}

	ua := c.Request.UserAgent()
	uaLower := strings.ToLower(ua)

	// Filter out common automated bots and crawlers
	botKeywords := []string{"bot", "crawler", "spider", "slurp", "headless", "lighthouse", "facebookexternalhit"}
	for _, kw := range botKeywords {
		if strings.Contains(uaLower, kw) {
			c.Status(http.StatusNoContent)
			return
		}
	}

	// Deteksi device type
	deviceType := "desktop"
	if strings.Contains(uaLower, "ipad") || strings.Contains(uaLower, "tablet") {
		deviceType = "tablet"
	} else if strings.Contains(uaLower, "mobile") || strings.Contains(uaLower, "android") || strings.Contains(uaLower, "iphone") {
		deviceType = "mobile"
	}

	// Hash IP dengan secret untuk menjaga privasi sekaligus konsistensi identifikasi unik
	ip := c.ClientIP()
	h := sha256.New()
	h.Write([]byte(ip + ":" + a.Cfg.JWTSecret))
	ipHash := hex.EncodeToString(h.Sum(nil))

	// Jalankan insert ke database di goroutine terpisah agar respons ke visitor instan.
	// Menggunakan ON CONFLICT (visit_date, ip_hash, path) DO NOTHING:
	// Jika user dengan IP yang sama mengakses halaman yang sama pada hari yang sama,
	// database tidak akan mencatat duplikasi (hanya tercatat 1 kali per hari).
	db := a.DB
	if db != nil {
		go func(p, r, hash, agent, device string) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_, _ = db.Exec(ctx, `
				INSERT INTO visitor_logs (visit_date, path, referrer, ip_hash, user_agent, device_type) 
				VALUES (CURRENT_DATE, $1, $2, $3, $4, $5)
				ON CONFLICT (visit_date, ip_hash, path) DO NOTHING
			`, p, r, hash, agent, device)
		}(path, referrer, ipHash, ua, deviceType)
	}

	c.Status(http.StatusNoContent)
}

func (a *App) getVisitorStats(c *gin.Context) gin.H {
	var todayViews, todayUniques int
	_ = a.DB.QueryRow(c, `
		SELECT COUNT(*), COUNT(DISTINCT ip_hash) 
		FROM visitor_logs 
		WHERE visit_date = CURRENT_DATE
	`).Scan(&todayViews, &todayUniques)

	var totalViews7d, totalUniques7d int
	_ = a.DB.QueryRow(c, `
		SELECT COUNT(*), COUNT(DISTINCT ip_hash) 
		FROM visitor_logs 
		WHERE visit_date >= CURRENT_DATE - INTERVAL '6 days'
	`).Scan(&totalViews7d, &totalUniques7d)

	// 1. Daily trend (7 hari terakhir)
	dailyTrend := []gin.H{}
	rowsTrend, err := a.DB.Query(c, `
		SELECT 
			TO_CHAR(d.day, 'YYYY-MM-DD') AS date_val,
			TO_CHAR(d.day, 'Dy, DD Mon') AS label,
			COALESCE(COUNT(v.id), 0) AS views,
			COALESCE(COUNT(DISTINCT v.ip_hash), 0) AS uniques
		FROM (
			SELECT GENERATE_SERIES(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval)::date AS day
		) d
		LEFT JOIN visitor_logs v ON v.visit_date = d.day
		GROUP BY d.day
		ORDER BY d.day ASC
	`)
	if err == nil {
		defer rowsTrend.Close()
		for rowsTrend.Next() {
			var dateVal, label string
			var views, uniques int
			if rowsTrend.Scan(&dateVal, &label, &views, &uniques) == nil {
				dailyTrend = append(dailyTrend, gin.H{
					"date":    dateVal,
					"label":   label,
					"views":   views,
					"uniques": uniques,
				})
			}
		}
	}

	// 2. Top pages (7 hari terakhir)
	topPages := []gin.H{}
	rowsPages, err := a.DB.Query(c, `
		SELECT path, COUNT(*) as views
		FROM visitor_logs
		WHERE visit_date >= CURRENT_DATE - INTERVAL '6 days'
		GROUP BY path
		ORDER BY views DESC
		LIMIT 5
	`)
	if err == nil {
		defer rowsPages.Close()
		for rowsPages.Next() {
			var p string
			var v int
			if rowsPages.Scan(&p, &v) == nil {
				topPages = append(topPages, gin.H{
					"path":  p,
					"views": v,
				})
			}
		}
	}

	// 3. Devices breakdown (7 hari terakhir)
	devices := []gin.H{}
	rowsDevices, err := a.DB.Query(c, `
		SELECT device_type, COUNT(*) as count
		FROM visitor_logs
		WHERE visit_date >= CURRENT_DATE - INTERVAL '6 days'
		GROUP BY device_type
		ORDER BY count DESC
	`)
	if err == nil {
		defer rowsDevices.Close()
		for rowsDevices.Next() {
			var dev string
			var count int
			if rowsDevices.Scan(&dev, &count) == nil {
				devices = append(devices, gin.H{
					"device": dev,
					"count":  count,
				})
			}
		}
	}

	// 4. Top Referrers (7 hari terakhir)
	topReferrers := []gin.H{}
	rowsRef, err := a.DB.Query(c, `
		SELECT 
			CASE 
				WHEN referrer ILIKE '%google%' THEN 'Google'
				WHEN referrer ILIKE '%instagram%' THEN 'Instagram'
				WHEN referrer ILIKE '%facebook%' THEN 'Facebook'
				WHEN referrer ILIKE '%tiktok%' THEN 'TikTok'
				WHEN referrer ILIKE '%whatsapp%' THEN 'WhatsApp'
				WHEN referrer = '' OR referrer IS NULL THEN 'Langsung (Direct)'
				ELSE 'Lainnya / Eksternal'
			END AS source,
			COUNT(*) AS count
		FROM visitor_logs
		WHERE visit_date >= CURRENT_DATE - INTERVAL '6 days'
		GROUP BY source
		ORDER BY count DESC
		LIMIT 5
	`)
	if err == nil {
		defer rowsRef.Close()
		for rowsRef.Next() {
			var src string
			var cnt int
			if rowsRef.Scan(&src, &cnt) == nil {
				topReferrers = append(topReferrers, gin.H{
					"source": src,
					"count":  cnt,
				})
			}
		}
	}

	return gin.H{
		"today_views":      todayViews,
		"today_uniques":    todayUniques,
		"total_views_7d":   totalViews7d,
		"total_uniques_7d": totalUniques7d,
		"daily_trend":      dailyTrend,
		"top_pages":        topPages,
		"devices":          devices,
		"top_referrers":    topReferrers,
	}
}

type VisitorLogItem struct {
	ID         int64     `json:"id"`
	VisitDate  string    `json:"visit_date"`
	Path       string    `json:"path"`
	Referrer   string    `json:"referrer"`
	IPHash     string    `json:"ip_hash"`
	UserAgent  string    `json:"user_agent"`
	DeviceType string    `json:"device_type"`
	CreatedAt  time.Time `json:"created_at"`
}

func (a *App) AdminVisitorLogs(c *gin.Context) {
	if a.DB == nil {
		c.JSON(http.StatusOK, gin.H{
			"data":        []VisitorLogItem{},
			"page":        1,
			"limit":       15,
			"total":       0,
			"total_pages": 1,
		})
		return
	}

	pageStr := c.Query("page")
	limitStr := c.Query("limit")
	device := strings.TrimSpace(c.Query("device"))
	search := strings.TrimSpace(c.Query("search"))
	date := strings.TrimSpace(c.Query("date"))

	countQuery := `SELECT COUNT(*) FROM visitor_logs WHERE 1=1`
	query := `SELECT id, TO_CHAR(visit_date, 'YYYY-MM-DD') AS visit_date, path, referrer, ip_hash, user_agent, device_type, created_at FROM visitor_logs WHERE 1=1`

	args := []any{}
	argIdx := 1

	if device != "" && device != "all" {
		clause := fmt.Sprintf(` AND device_type = $%d`, argIdx)
		countQuery += clause
		query += clause
		args = append(args, device)
		argIdx++
	}

	if search != "" {
		clause := fmt.Sprintf(` AND (path ILIKE $%d OR referrer ILIKE $%d OR user_agent ILIKE $%d)`, argIdx, argIdx, argIdx)
		countQuery += clause
		query += clause
		args = append(args, "%"+search+"%")
		argIdx++
	}

	if date != "" {
		clause := fmt.Sprintf(` AND visit_date = $%d`, argIdx)
		countQuery += clause
		query += clause
		args = append(args, date)
		argIdx++
	}

	var total int
	if err := a.DB.QueryRow(c, countQuery, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to count visitor logs"})
		return
	}

	query += ` ORDER BY created_at DESC, id DESC`

	page := 1
	limit := 15
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	offset := (page - 1) * limit
	query += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := a.DB.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to query visitor logs"})
		return
	}
	defer rows.Close()

	items := []VisitorLogItem{}
	for rows.Next() {
		var item VisitorLogItem
		if err := rows.Scan(&item.ID, &item.VisitDate, &item.Path, &item.Referrer, &item.IPHash, &item.UserAgent, &item.DeviceType, &item.CreatedAt); err == nil {
			items = append(items, item)
		}
	}

	totalPages := (total + limit - 1) / limit
	if totalPages == 0 {
		totalPages = 1
	}

	c.JSON(http.StatusOK, gin.H{
		"data":        items,
		"page":        page,
		"limit":       limit,
		"total":       total,
		"total_pages": totalPages,
	})
}

func (a *App) ExportVisitorLogsCSV(c *gin.Context) {
	if a.DB == nil {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=visitor_logs_%s.csv", time.Now().Format("2006-01-02_150405")))
		c.Header("Content-Type", "text/csv; charset=utf-8")
		_, _ = c.Writer.Write([]byte("\xef\xbb\xbf"))
		writer := csv.NewWriter(c.Writer)
		_ = writer.Write([]string{
			"ID",
			"Tanggal Kunjungan",
			"Waktu Tepat (WIB)",
			"Halaman (Path)",
			"Tipe Perangkat",
			"Sumber (Referrer)",
			"ID Pengunjung (IP Hash)",
			"User Agent",
		})
		writer.Flush()
		return
	}

	device := strings.TrimSpace(c.Query("device"))
	search := strings.TrimSpace(c.Query("search"))
	date := strings.TrimSpace(c.Query("date"))

	query := `SELECT id, TO_CHAR(visit_date, 'YYYY-MM-DD') AS visit_date, created_at, path, device_type, referrer, ip_hash, user_agent 
		FROM visitor_logs WHERE 1=1`
	args := []any{}
	argIdx := 1

	if device != "" && device != "all" {
		query += fmt.Sprintf(` AND device_type = $%d`, argIdx)
		args = append(args, device)
		argIdx++
	}

	if search != "" {
		query += fmt.Sprintf(` AND (path ILIKE $%d OR referrer ILIKE $%d OR user_agent ILIKE $%d)`, argIdx, argIdx, argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}

	if date != "" {
		query += fmt.Sprintf(` AND visit_date = $%d`, argIdx)
		args = append(args, date)
		argIdx++
	}

	query += ` ORDER BY created_at DESC, id DESC LIMIT 5000`

	rows, err := a.DB.Query(c, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to export visitor logs"})
		return
	}
	defer rows.Close()

	filename := fmt.Sprintf("visitor_logs_%s.csv", time.Now().Format("2006-01-02_150405"))
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Type", "text/csv; charset=utf-8")

	// UTF-8 BOM
	_, _ = c.Writer.Write([]byte("\xef\xbb\xbf"))

	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{
		"ID",
		"Tanggal Kunjungan",
		"Waktu Tepat (WIB)",
		"Halaman (Path)",
		"Tipe Perangkat",
		"Sumber (Referrer)",
		"ID Pengunjung (IP Hash)",
		"User Agent",
	})

	loc := time.FixedZone("WIB", 7*3600)

	for rows.Next() {
		var id int64
		var visitDate, path, deviceType, referrer, ipHash, userAgent string
		var createdAt time.Time
		if err := rows.Scan(&id, &visitDate, &createdAt, &path, &deviceType, &referrer, &ipHash, &userAgent); err == nil {
			timeStr := createdAt.In(loc).Format("2006-01-02 15:04:05")
			_ = writer.Write([]string{
				strconv.FormatInt(id, 10),
				visitDate,
				timeStr,
				path,
				deviceType,
				referrer,
				ipHash,
				userAgent,
			})
		}
	}
	writer.Flush()
}
