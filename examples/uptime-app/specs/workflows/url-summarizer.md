---
name: url-summarizer
version: 1
---

# URL Summarizer Workflow

Fetch a URL and either report an error if it doesn't return 200, or return a 1-paragraph summary of the page contents.

## Inputs

- url: string (required) - The URL to fetch and summarize

## Tasks

### 1. Fetch URL

Make an HTTP GET request to fetch the page content.

**Node:** `http_get` (tool)
**Input:** url
**Output:** `response: { status_code: number, body: string | null, error: string | null }`

---

### 2. Check Status

Route based on HTTP response status.

**Condition:** `response.status_code == 200`
**If true:** continue to task 3
**If false:** return:
  - status: "error"
  - status_code: response.status_code
  - error: response.error

---

### 3. Summarize Page

Generate a 1-paragraph summary of the page content.

**Node:** `page-summarizer` (agent)
**Input:** response.body
**Output:** `summary: string`
**Return:**
  - status: "success"
  - status_code: response.status_code
  - summary: summary

## Outputs

- status: "success" | "error" - Whether the fetch and summarization succeeded
- status_code: number - HTTP status code
- summary: string | null - 1-paragraph summary of the page (null if error)
- error: string | null - Error message (only present on error)
