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
**Output:** `response`

## Outputs

- status_code: number | null - HTTP status code (null if request failed)
- response_time_ms: number - Time taken for the request
- error: string | null - Error message if request failed
- checked_at: string - ISO timestamp of when check was performed
