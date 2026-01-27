---
name: url-check
version: 1
---

# URL Check Workflow

Check if a URL is reachable and return its status code and response time.

## Inputs

- url: string (required) - The URL to check
- timeout_ms: number (optional, defaults to 5000) - Request timeout in milliseconds

## Tasks

### 1. Fetch URL

Make an HTTP HEAD request to the URL and capture the response.

**Node:** `http-head` (function)
**Input:** url, timeout_ms
**Output:** `response: { status_code: number | null, response_time_ms: number, error: string | null, checked_at: string }`
**Return:**
  - status_code: response.status_code
  - response_time_ms: response.response_time_ms
  - error: response.error
  - checked_at: response.checked_at

## Outputs

- status_code: number | null - HTTP status code (null if request failed)
- response_time_ms: number - Time taken for the request
- error: string | null - Error message if request failed
- checked_at: string - ISO timestamp of when check was performed
