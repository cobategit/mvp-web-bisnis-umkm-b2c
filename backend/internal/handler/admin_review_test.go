package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCreateReviewValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := &App{}

	r := gin.New()
	r.POST("/api/v1/admin/reviews", app.CreateReview)

	tests := []struct {
		name       string
		payload    string
		wantStatus int
	}{
		{
			name:       "empty body",
			payload:    `{}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing customer name",
			payload:    `{"rating": 5, "message": "Bagus sekali"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "blank customer name",
			payload:    `{"customer_name": "   ", "rating": 5, "message": "Bagus sekali"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "rating below 1",
			payload:    `{"customer_name": "Budi", "rating": 0, "message": "Bagus sekali"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "rating above 5",
			payload:    `{"customer_name": "Budi", "rating": 6, "message": "Bagus sekali"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "blank message",
			payload:    `{"customer_name": "Budi", "rating": 5, "message": "   "}`,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/reviews", bytes.NewBufferString(tt.payload))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d. Body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

func TestUpdateReviewValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := &App{}

	r := gin.New()
	r.PATCH("/api/v1/admin/reviews/:id", app.UpdateReview)

	tests := []struct {
		name       string
		payload    string
		wantStatus int
	}{
		{
			name:       "invalid rating",
			payload:    `{"rating": 10}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "empty customer name",
			payload:    `{"customer_name": "   "}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "empty message",
			payload:    `{"message": "   "}`,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodPatch, "/api/v1/admin/reviews/123", bytes.NewBufferString(tt.payload))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d. Body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}
