# Outreach Automation Example

**Date:** 2026-01-23
**Purpose:** Reference implementation to validate crayon design

This document describes how to implement the [outreach-automation](../../outreach-automation) project using crayon. This serves as the primary example app to validate that the crayon design works for real-world GTM automation use cases.

## Overview

The outreach-automation project has three main workflows:

1. **Company Research** - Given a company name, gather comprehensive data (LinkedIn, tech stack, employee locations, news) and score for sales fit
2. **Meeting Processing Pipeline** - Download transcripts → extract companies → group → enrich from Salesforce → classify
3. **Outreach Sequence Generation** - Given research data, generate personalized 5-email sales sequences

We'll implement all three as crayon workflows.

---

## Directory Structure

```
example-app/
├── specs/
│   ├── workflows/
│   │   ├── company-research.md
│   │   ├── meeting-pipeline.md
│   │   └── outreach-sequence.md
│   └── agents/
│       ├── linkedin-data-extractor.md
│       ├── employee-location-researcher.md
│       ├── tech-stack-researcher.md
│       ├── business-description-researcher.md
│       ├── company-news-researcher.md
│       ├── icp-scorer.md
│       ├── transcript-company-extractor.md
│       ├── company-grouper.md
│       ├── company-classifier.md
│       └── sequence-generator.md
├── src/
│   ├── nodes/
│   │   └── (empty - all logic is in agents/tools for this example)
│   └── tools/
│       ├── browser/
│       │   ├── navigate.ts
│       │   ├── click.ts
│       │   ├── fillField.ts
│       │   ├── getText.ts
│       │   ├── screenshot.ts
│       │   └── waitForSelector.ts
│       ├── linkedin/
│       │   ├── searchCompany.ts
│       │   ├── getCompanyPage.ts
│       │   └── getEmployeeList.ts
│       ├── s3/
│       │   └── downloadFile.ts
│       ├── salesforce/
│       │   └── getAccountData.ts
│       ├── db/
│       │   ├── saveCompany.ts
│       │   ├── getCompany.ts
│       │   └── saveResearchCache.ts
│       └── embeddings/
│           ├── generate.ts
│           └── similaritySearch.ts
├── generated/
│   └── workflows/
│       ├── company-research.ts
│       ├── meeting-pipeline.ts
│       └── outreach-sequence.ts
└── package.json
```

---

## Workflow 1: Company Research

This is the main workflow from `integrated-research.ts`.

### Spec: `specs/workflows/company-research.md`

```markdown
---
name: company-research
version: 1
---

# Company Research Workflow

Comprehensive company research for sales qualification. Gathers data from multiple sources and scores the company for ICP fit.

## Inputs

- company_name: string (required) - The company name to research
- refresh_cache: boolean (optional, defaults to false) - Force refresh cached data

## Steps

### 1. Extract LinkedIn Company Data

Get basic company information from LinkedIn including size, industry, headquarters, and description.

**Node:** `linkedin-data-extractor` (agent)
**Input:** company_name
**Output:** `linkedin_data`

---

### 2. Research Employee Locations

Analyze LinkedIn employee profiles to determine geographic distribution. Focus on Western Europe and North America coverage.

**Node:** `employee-location-researcher` (agent)
**Input:** company_name, linkedin_data.linkedinUrl
**Output:** `employee_locations`

---

### 3. Research Tech Stack

Explore company website, job postings, and careers pages to identify technologies used.

**Node:** `tech-stack-researcher` (agent)
**Input:** linkedin_data.website
**Output:** `tech_stack`

---

### 4. Research Business Description

Generate detailed business description based on website content and gathered data.

**Node:** `business-description-researcher` (agent)
**Input:** company_name, linkedin_data.website, tech_stack
**Output:** `business_description`

---

### 5. Find Similar Customers

Search existing customer database for similar companies based on industry, tech stack, and use case.

**Node:** `find-similar-customers` (function)
**Input:** business_description.industry_category, business_description.description, tech_stack.technologies
**Output:** `similar_companies`

---

### 6. Research Company News

Find recent news about the company including funding rounds, leadership changes, and partnerships.

**Node:** `company-news-researcher` (agent)
**Input:** company_name
**Output:** `company_news`

---

### 7. Score ICP Fit

Evaluate all gathered data against Ideal Customer Profile criteria and provide sales recommendation.

**Node:** `icp-scorer` (agent)
**Input:** company_name, linkedin_data, employee_locations, tech_stack, business_description, similar_companies, company_news
**Output:** `icp_score`

## Outputs

- company_name: string
- linkedin_data: object
- employee_locations: object
- tech_stack: object
- business_description: object
- similar_companies: array
- company_news: object
- score: number (0-100)
- recommendation: "LOW" | "MEDIUM" | "HIGH"
- reasoning: string
```

---

## Workflow 2: Meeting Processing Pipeline

From `pipeline/*.ts` files.

### Spec: `specs/workflows/meeting-pipeline.md`

```markdown
---
name: meeting-pipeline
version: 1
---

# Meeting Processing Pipeline

Process sales meeting transcripts to extract and enrich company information.

## Inputs

- s3_bucket: string (required) - S3 bucket containing transcripts
- transcript_dir: string (optional, defaults to "./transcripts") - Local directory for downloaded files
- limit: number (optional) - Maximum transcripts to process
- steps: array (optional) - Specific steps to run, defaults to all

## Steps

### 1. Download Transcripts

Download new meeting transcripts from S3 to local storage.

**Node:** `download-transcripts` (function)
**Input:** s3_bucket, transcript_dir, limit
**Output:** `downloaded_files`

---

### 2. Extract Company Names

Parse transcripts and extract company names mentioned in meetings.

**Node:** `transcript-company-extractor` (agent)
**Input:** downloaded_files
**Output:** `extracted_companies`

---

### 3. Group by Company

Deduplicate and group meetings by company using exact matches, domain matching, name variations, and semantic similarity.

**Node:** `company-grouper` (agent)
**Input:** extracted_companies
**Output:** `grouped_companies`

---

### 4. Fetch Salesforce Data

Enrich company records with data from Salesforce.

**Node:** `fetch-salesforce-data` (function)
**Input:** grouped_companies
**Output:** `enriched_companies`

---

### 5. Classify Companies

Extract additional company metadata (industry, use case, size) and generate embeddings.

**Node:** `company-classifier` (agent)
**Input:** enriched_companies
**Output:** `classified_companies`

## Outputs

- processed_count: number
- companies: array
- errors: array
```

---

## Workflow 3: Outreach Sequence Generation

### Spec: `specs/workflows/outreach-sequence.md`

```markdown
---
name: outreach-sequence
version: 1
---

# Outreach Sequence Generation

Generate personalized 5-email sales outreach sequences based on company research.

## Inputs

- company_name: string (required) - The company to generate outreach for
- use_cache: boolean (optional, defaults to true) - Use cached research if available
- update_sections: array (optional) - Specific research sections to refresh

## Steps

### 1. Get or Run Research

Check cache for existing research, run company-research workflow if needed.

**Condition:** `use_cache == true`
**If true:** Load cached research from database
**If false:** Run company-research workflow

**Node:** `company-research` (sub-workflow) or `db.getResearchCache` (function)
**Input:** company_name
**Output:** `research_data`

---

### 2. Find Social Proof

Match prospect with relevant customer case studies based on industry, tech stack, and use case.

**Node:** `find-social-proof` (function)
**Input:** research_data.business_description, research_data.tech_stack
**Output:** `social_proof`

---

### 3. Generate Sequence

Create personalized 5-email outreach sequence using research data and social proof.

**Node:** `sequence-generator` (agent)
**Input:** company_name, research_data, social_proof
**Output:** `email_sequence`

## Outputs

- company_name: string
- emails: array (5 emails with subject, body, timing, CTA)
- social_proof_used: array
- personalization_notes: string
```

---

## Agent Specs

### `specs/agents/linkedin-data-extractor.md`

```markdown
---
name: linkedin-data-extractor
tools:
  - browser_navigate
  - browser_click
  - browser_getText
  - browser_screenshot
  - browser_waitForSelector
  - linkedin_searchCompany
  - linkedin_getCompanyPage
---

# LinkedIn Data Extractor

You are a research assistant that extracts company information from LinkedIn.

## Task

Given a company name:
1. Search for the company on LinkedIn using Google (site:linkedin.com/company)
2. Navigate to the company's LinkedIn page
3. Extract key information from the page

## Data to Extract

- Company name (official)
- Company size (employee count range)
- Industry
- Headquarters location
- Website URL
- Description/About
- Follower count
- LinkedIn URL

## Guidelines

- Use Google search with site:linkedin.com/company filter for reliable results
- Wait for page elements to load before extracting
- If multiple results, prefer exact name matches
- Take screenshots for debugging if extraction fails
- Handle login prompts gracefully

## Output Format

Return a JSON object:
```json
{
  "name": "Company Name",
  "size": "51-200 employees",
  "industry": "Software Development",
  "headquarters": "San Francisco, CA",
  "website": "https://example.com",
  "description": "...",
  "followers": "10,234",
  "linkedinUrl": "https://linkedin.com/company/example"
}
```
```

### `specs/agents/employee-location-researcher.md`

```markdown
---
name: employee-location-researcher
tools:
  - browser_navigate
  - browser_click
  - browser_getText
  - browser_waitForSelector
  - linkedin_getEmployeeList
---

# Employee Location Researcher

You research employee locations to determine a company's geographic distribution.

## Task

Given a company's LinkedIn URL:
1. Navigate to the company's "People" section
2. Sample employee profiles to determine locations
3. Categorize by region (Western Europe, North America, Other)

## Guidelines

- Sample at least 10-20 employee profiles if available
- Focus on current employees, not alumni
- Note the distribution percentages
- Flag if company is primarily outside target regions

## Output Format

```json
{
  "total_sampled": 15,
  "western_europe": 4,
  "north_america": 8,
  "other": 3,
  "western_europe_percentage": 27,
  "north_america_percentage": 53,
  "is_target_region": true,
  "notes": "Primarily US-based with EU presence"
}
```
```

### `specs/agents/tech-stack-researcher.md`

```markdown
---
name: tech-stack-researcher
tools:
  - browser_navigate
  - browser_click
  - browser_getText
  - browser_waitForSelector
---

# Tech Stack Researcher

You research company tech stacks by exploring their website and job postings.

## Task

Given a company website:
1. Find the careers/jobs page
2. Look for engineering job postings
3. Extract mentioned technologies
4. Also check for tech stack indicators on main site

## Technologies to Look For

- Databases: PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch, TimescaleDB, InfluxDB
- Cloud: AWS, GCP, Azure
- Languages: Python, TypeScript, Go, Java, Rust
- Frameworks: React, Node.js, Django, Spring
- Infrastructure: Kubernetes, Docker, Terraform

## Guidelines

- Prioritize job postings as they're most reliable
- Note confidence level based on source
- Distinguish between "definitely uses" and "might use"

## Output Format

```json
{
  "technologies": ["PostgreSQL", "AWS", "Python", "Kubernetes"],
  "confidence": "high",
  "sources": ["job posting: Senior Backend Engineer", "careers page"],
  "notes": "Multiple mentions of PostgreSQL in backend roles"
}
```
```

### `specs/agents/icp-scorer.md`

```markdown
---
name: icp-scorer
tools: []
---

# ICP Scorer

You are a sales qualification expert for TimescaleDB, a time-series database built on PostgreSQL.

## Task

Evaluate company data against the Ideal Customer Profile and provide a sales recommendation.

## ICP Criteria

TimescaleDB is ideal for companies that:
- Handle time-series data (IoT, monitoring, financial data, analytics)
- Need to scale PostgreSQL for high-throughput workloads
- Work with metrics, events, logs, or sensor data
- Industries: DevOps/monitoring, IoT, fintech, energy, manufacturing, logistics
- Use AWS or Azure (GCP is less ideal)
- Have engineering teams that value PostgreSQL compatibility

## Scoring Guidelines

Consider:
1. Tech stack compatibility (PostgreSQL, AWS/Azure, modern infrastructure)
2. Industry alignment (time-series use cases)
3. Company size and growth stage
4. Geographic fit (Western Europe, North America preferred)
5. Technical sophistication

## Score Examples

- Score 10-20: No time-series use case, wrong tech stack (GCP/MySQL)
- Score 40-60: Some fit but obstacles (wrong region, already using competitor)
- Score 70-85: Good fit with minor concerns
- Score 85-100: Excellent fit, high priority

## Output Format

```json
{
  "score": 78,
  "recommendation": "HIGH",
  "reasoning": "Strong time-series use case in IoT monitoring, already using PostgreSQL and AWS. Located in Germany which is in target region. Only concern is relatively small team size."
}
```
```

### `specs/agents/sequence-generator.md`

```markdown
---
name: sequence-generator
tools: []
---

# Outreach Sequence Generator

You generate personalized 5-email sales outreach sequences for TimescaleDB prospects.

## Task

Given company research and social proof, create a compelling email sequence.

## Sequence Structure

1. **Email 1 (Day 0):** Initial outreach - hook with specific pain point
2. **Email 2 (Day 3):** Value add - share relevant content/case study
3. **Email 3 (Day 7):** Social proof - highlight similar customer success
4. **Email 4 (Day 14):** Different angle - address different use case
5. **Email 5 (Day 21):** Break-up - final attempt with clear CTA

## Guidelines

- Personalize based on tech stack findings
- Reference specific use cases from their industry
- Use social proof customers that are genuinely similar
- Keep emails concise (under 150 words)
- Each email should stand alone (don't reference previous emails)
- Include specific CTAs

## Output Format

```json
{
  "emails": [
    {
      "day": 0,
      "subject": "Quick question about [specific tech challenge]",
      "body": "...",
      "cta": "15-minute call this week?"
    },
    ...
  ],
  "personalization_notes": "Focused on their PostgreSQL scaling challenges based on job postings mentioning high-throughput requirements"
}
```
```

---

## User-Defined Tools

### `src/tools/browser/navigate.ts`

```typescript
import { ToolDefinition } from 'runcrayon';
import { getBrowser } from '../lib/browser-factory';

export const navigate: ToolDefinition = {
  name: 'browser_navigate',
  description: 'Navigate to a URL in the browser',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
    },
    required: ['url'],
  },
  execute: async ({ url }: { url: string }) => {
    const page = await getBrowser().getPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    return { success: true, url: page.url() };
  },
};
```

### `src/tools/browser/click.ts`

```typescript
import { ToolDefinition } from 'runcrayon';
import { getBrowser } from '../lib/browser-factory';

export const click: ToolDefinition = {
  name: 'browser_click',
  description: 'Click an element matching the selector',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector for the element' },
    },
    required: ['selector'],
  },
  execute: async ({ selector }: { selector: string }) => {
    const page = await getBrowser().getPage();
    await page.click(selector);
    return { success: true };
  },
};
```

### `src/tools/browser/getText.ts`

```typescript
import { ToolDefinition } from 'runcrayon';
import { getBrowser } from '../lib/browser-factory';

export const getText: ToolDefinition = {
  name: 'browser_getText',
  description: 'Get text content from the current page or a specific selector',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'Optional CSS selector. If omitted, returns full page text.' },
    },
  },
  execute: async ({ selector }: { selector?: string }) => {
    const page = await getBrowser().getPage();
    if (selector) {
      const element = await page.$(selector);
      const text = await element?.evaluate(el => el.textContent);
      return { text: text?.trim() || '' };
    }
    const text = await page.evaluate(() => document.body.innerText);
    return { text };
  },
};
```

### `src/tools/embeddings/similaritySearch.ts`

```typescript
import { ToolDefinition } from 'runcrayon';
import { db } from '../lib/db';

export const similaritySearch: ToolDefinition = {
  name: 'embeddings_similaritySearch',
  description: 'Find similar items using vector similarity',
  parameters: {
    type: 'object',
    properties: {
      query_embedding: { type: 'array', items: { type: 'number' } },
      table: { type: 'string' },
      limit: { type: 'number', default: 5 },
    },
    required: ['query_embedding', 'table'],
  },
  execute: async ({ query_embedding, table, limit = 5 }) => {
    const results = await db.query(`
      SELECT *, embedding <=> $1 as distance
      FROM ${table}
      ORDER BY distance
      LIMIT $2
    `, [JSON.stringify(query_embedding), limit]);
    return { results: results.rows };
  },
};
```

---

## Function Nodes

For steps that don't need agentic behavior, we use function nodes.

### `src/nodes/find-similar-customers.ts`

```typescript
import { NodeDefinition } from 'runcrayon';
import { generateEmbedding } from '../tools/embeddings/generate';
import { db } from '../lib/db';

interface FindSimilarInput {
  industry: string;
  description: string;
  technologies: string[];
}

export const findSimilarCustomers: NodeDefinition<FindSimilarInput> = {
  name: 'find-similar-customers',
  execute: async (input) => {
    const searchText = `${input.industry} ${input.description} ${input.technologies.join(' ')}`;
    const embedding = await generateEmbedding(searchText);

    const results = await db.query(`
      SELECT company_name, industry, use_case, case_study_url,
             embedding <=> $1 as distance
      FROM customer_social_proof
      ORDER BY distance
      LIMIT 3
    `, [JSON.stringify(embedding)]);

    return results.rows.map(row => ({
      name: row.company_name,
      industry: row.industry,
      useCase: row.use_case,
      caseStudyUrl: row.case_study_url,
      similarity: 1 - row.distance,
    }));
  },
};
```

### `src/nodes/download-transcripts.ts`

```typescript
import { NodeDefinition } from 'runcrayon';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface DownloadInput {
  s3_bucket: string;
  transcript_dir: string;
  limit?: number;
}

export const downloadTranscripts: NodeDefinition<DownloadInput> = {
  name: 'download-transcripts',
  execute: async (input) => {
    const s3 = new S3Client({});
    const { s3_bucket, transcript_dir, limit } = input;

    await mkdir(transcript_dir, { recursive: true });

    const listCommand = new ListObjectsV2Command({
      Bucket: s3_bucket,
      MaxKeys: limit,
    });
    const { Contents = [] } = await s3.send(listCommand);

    const downloaded = [];
    for (const obj of Contents) {
      if (!obj.Key) continue;

      const getCommand = new GetObjectCommand({
        Bucket: s3_bucket,
        Key: obj.Key,
      });
      const { Body } = await s3.send(getCommand);
      const content = await Body?.transformToString();

      const localPath = join(transcript_dir, obj.Key);
      await writeFile(localPath, content || '');
      downloaded.push(localPath);
    }

    return { downloaded_files: downloaded, count: downloaded.length };
  },
};
```

---

## Generated Workflow Code

The compiler generates TypeScript from specs. Example for company-research:

### `generated/workflows/company-research.ts`

```typescript
import { Workflow, WorkflowContext } from 'runcrayon';

interface CompanyResearchInputs {
  company_name: string;
  refresh_cache?: boolean;
}

interface CompanyResearchOutputs {
  company_name: string;
  linkedin_data: LinkedInData;
  employee_locations: EmployeeLocations;
  tech_stack: TechStack;
  business_description: BusinessDescription;
  similar_companies: SimilarCompany[];
  company_news: CompanyNews;
  score: number;
  recommendation: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
}

export const companyResearch = Workflow.create({
  name: 'company-research',
  version: 1,

  async run(ctx: WorkflowContext, inputs: CompanyResearchInputs): Promise<CompanyResearchOutputs> {
    ctx.log(`Starting research for: ${inputs.company_name}`);

    // Step 1: Extract LinkedIn Company Data
    ctx.log('Step 1: Extracting LinkedIn data...');
    const linkedin_data = await ctx.runAgent('linkedin-data-extractor', {
      company_name: inputs.company_name,
    });

    // Step 2: Research Employee Locations
    ctx.log('Step 2: Researching employee locations...');
    const employee_locations = await ctx.runAgent('employee-location-researcher', {
      company_name: inputs.company_name,
      linkedin_url: linkedin_data.linkedinUrl,
    });

    // Step 3: Research Tech Stack
    ctx.log('Step 3: Researching tech stack...');
    const tech_stack = await ctx.runAgent('tech-stack-researcher', {
      website: linkedin_data.website,
    });

    // Step 4: Research Business Description
    ctx.log('Step 4: Researching business description...');
    const business_description = await ctx.runAgent('business-description-researcher', {
      company_name: inputs.company_name,
      website: linkedin_data.website,
      tech_stack,
    });

    // Step 5: Find Similar Customers
    ctx.log('Step 5: Finding similar customers...');
    const similar_companies = await ctx.runNode('find-similar-customers', {
      industry: business_description.industry_category,
      description: business_description.description,
      technologies: tech_stack.technologies,
    });

    // Step 6: Research Company News
    ctx.log('Step 6: Researching company news...');
    const company_news = await ctx.runAgent('company-news-researcher', {
      company_name: inputs.company_name,
    });

    // Step 7: Score ICP Fit
    ctx.log('Step 7: Scoring ICP fit...');
    const icp_score = await ctx.runAgent('icp-scorer', {
      company_name: inputs.company_name,
      linkedin_data,
      employee_locations,
      tech_stack,
      business_description,
      similar_companies,
      company_news,
    });

    ctx.log(`Research complete. Score: ${icp_score.score}, Recommendation: ${icp_score.recommendation}`);

    return {
      company_name: inputs.company_name,
      linkedin_data,
      employee_locations,
      tech_stack,
      business_description,
      similar_companies,
      company_news,
      score: icp_score.score,
      recommendation: icp_score.recommendation,
      reasoning: icp_score.reasoning,
    };
  },
});
```

---

## Mapping from Original Code

| Original File | crayon Equivalent |
|---------------|-------------------|
| `integrated-research.ts` | `specs/workflows/company-research.md` |
| `browser-automation/linkedin-company-data-agent.ts` | `specs/agents/linkedin-data-extractor.md` |
| `browser-automation/employee-location-agent.ts` | `specs/agents/employee-location-researcher.md` |
| `browser-automation/tech-stack-agent.ts` | `specs/agents/tech-stack-researcher.md` |
| `browser-automation/business-description-agent.ts` | `specs/agents/business-description-researcher.md` |
| `browser-automation/company-news-agent.ts` | `specs/agents/company-news-researcher.md` |
| `find-similar-companies.ts` | `src/nodes/find-similar-customers.ts` |
| `pipeline/download-transcripts.ts` | `src/nodes/download-transcripts.ts` |
| `pipeline/extract-meeting-info.ts` | `specs/agents/transcript-company-extractor.md` |
| `pipeline/group-meetings.ts` | `specs/agents/company-grouper.md` |
| `pipeline/classify-companies.ts` | `specs/agents/company-classifier.md` |
| `cached-research-agents.ts` | User implements caching in tools |
| `main-slack.ts` | User's app code (calls `crayon.triggerWorkflow`) |

---

## Key Differences from Original

1. **Separation of concerns** - Workflow orchestration (specs) is separate from agent behavior (agent specs) and tooling (src/tools)

2. **Declarative workflows** - Original uses imperative TypeScript; crayon uses markdown specs compiled to TypeScript

3. **Caching** - Original has `cachedResearchTechStack` etc. In crayon, users implement caching in their tool functions

4. **Browser management** - Original manages Puppeteer lifecycle inline; crayon tools handle this via a shared browser factory

5. **LLM provider** - Original uses `@openai/agents`; crayon's pre-packaged agent node uses Vercel AI SDK (provider-agnostic)

6. **Durability** - Original has no durability; crayon workflows are DBOS-backed with automatic recovery

---

## Running the Example

```bash
# Trigger company research
crayon run company-research --input '{"company_name": "Acme Corp"}'

# Trigger via webhook
curl -X POST http://localhost:3000/api/workflows/company-research/trigger \
  -H "Content-Type: application/json" \
  -d '{"company_name": "Acme Corp"}'

# Run meeting pipeline
crayon run meeting-pipeline --input '{"s3_bucket": "my-transcripts"}'

# Generate outreach sequence
crayon run outreach-sequence --input '{"company_name": "Acme Corp"}'
```
