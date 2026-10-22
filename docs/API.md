# ModelFit API Specification

## Conventions
- Base Path: `/api/v1`
- JSON format: snake_case
- Primary Keys: UUID
- Timestamps: UTC ISO-8601 `timestamptz`
- Error Envelope:
  ```json
  {
    "error": {
      "code": "STRING_ERROR_CODE",
      "message": "Human-readable explanation",
      "details": {},
      "request_id": "uuid-string"
    }
  }
  ```

## Endpoints (Phase 1 Baseline)

### Liveness Check
- **Route**: `GET /api/v1/health/live`
- **Response**: `200 OK`
  ```json
  {
    "status": "live"
  }
  ```

### Readiness Check
- **Route**: `GET /api/v1/health/ready`
- **Behavior**: Executes `SELECT 1` on the database within 2 seconds.
- **Success**: `200 OK`
  ```json
  {
    "status": "ready",
    "database": "connected"
  }
  ```
- **Failure**: `503 Service Unavailable` with standard error envelope (`DATABASE_UNAVAILABLE`).

### Metadata
- **Route**: `GET /api/v1/meta`
- **Response**: `200 OK`
  ```json
  {
    "version": "1.0.0",
    "git_sha": "development",
    "environment": "development"
  }
  ```
