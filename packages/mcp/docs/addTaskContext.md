# addTaskContext

Adds a context slice to an existing task, providing additional information, clarifications, or implementation details.

## Purpose

This tool enables incremental enrichment of tasks with context information. As work progresses or requirements evolve, context slices can capture research findings, implementation notes, complexity assessments, or any other relevant information that helps understand or execute the task.

## Parameters

- **taskId**: ID of the existing task to add context to (required)
- **title**: Brief title for this context slice (required, non-empty)
- **description**: Detailed content of the context slice (required, non-empty) 
- **contextType**: Category of context being added (optional, default: `general`)

## Context Types

While `contextType` is flexible, common patterns include:
- `general`: Miscellaneous notes or updates
- `implementation`: Technical implementation details or approaches
- `research`: Research findings, links, or background information
- `complexity`: Complexity assessments, risks, or considerations
- `requirements`: Additional requirements or clarifications
- `testing`: Testing strategies, test cases, or validation criteria
- `documentation`: Documentation needs or content
- `dependencies`: Dependency notes or coordination requirements
- `acceptance`: Acceptance criteria that must be met for task completion

## Example Calls

### Add implementation notes
```json
{
  "taskId": "task_12345",
  "title": "API Implementation Approach",
  "description": "Use REST endpoints with JSON payloads. Consider rate limiting for public endpoints. Authentication via JWT tokens stored in HTTP-only cookies.",
  "contextType": "implementation"
}
```

### Add research findings
```json
{
  "taskId": "task_67890", 
  "title": "User Authentication Best Practices",
  "description": "Research shows OAuth 2.0 with PKCE is preferred for SPAs. Consider implementing refresh token rotation. See: https://auth0.com/blog/oauth2-spa-best-practices",
  "contextType": "research"
}
```

### Add complexity assessment
```json
{
  "taskId": "task_11111",
  "title": "Database Migration Complexity",
  "description": "This migration affects 3 million+ records. Estimated downtime: 2-4 hours. Consider breaking into smaller chunks or implementing online migration strategy.",
  "contextType": "complexity"
}
```

### Add requirement clarification
```json
{
  "taskId": "task_22222",
  "title": "Updated Requirements from Stakeholder Meeting",
  "description": "Confirmed: Users must be able to export data in CSV and PDF formats. PDF should include company branding. Export should work for up to 10,000 records per request.",
  "contextType": "requirements"
}
```

### Add testing strategy
```json
{
  "taskId": "task_33333",
  "title": "Testing Approach for Payment Integration",
  "description": "Use Stripe test mode with webhook testing via ngrok. Test cases: successful payment, failed payment, webhook retries, partial refunds. Mock external services for unit tests.",
  "contextType": "testing"
}
```

### Add general progress notes
```json
{
  "taskId": "task_44444",
  "title": "Progress Update - Day 2", 
  "description": "Completed basic CRUD operations. Discovered issue with concurrent updates - need to implement optimistic locking. Will research solutions tomorrow.",
  "contextType": "general"
}
```

### Add acceptance criteria
```json
{
  "taskId": "task_auth1",
  "title": "User login returns JWT token",
  "description": "POST /auth/login with valid credentials returns 200 status and JWT token in response body. Token expires in 24 hours.",
  "contextType": "acceptance"
}
```

```json
{
  "taskId": "task_perf1",
  "title": "Dashboard loads in under 2 seconds",
  "description": "Initial dashboard render completes within 2000ms on average network conditions. Measure using Chrome DevTools Performance tab.",
  "contextType": "acceptance"
}
```

## Return Value

Returns the created context slice object with metadata including timestamps and IDs.

## Context Slice Benefits

### For AI Agents
- **Accumulated knowledge**: Context builds up institutional knowledge about tasks
- **Implementation guidance**: Technical details guide how work should be done
- **Avoid rework**: Previous research and decisions prevent redundant effort

### For Human Collaborators  
- **Knowledge transfer**: Context preserves decisions and rationale
- **Onboarding**: New team members can understand task history and context
- **Documentation**: Context serves as lightweight, task-specific documentation

### For Project Management
- **Progress tracking**: Context slices show work evolution and decision points
- **Risk identification**: Complexity and dependency notes highlight potential issues
- **Requirements traceability**: Links requirements changes to specific tasks

## Best Practices

- **Specific titles**: Use descriptive titles that make context easily scannable
- **Rich descriptions**: Include links, code snippets, or detailed explanations
- **Appropriate types**: Use consistent `contextType` values for better organization
- **Timely updates**: Add context when information is fresh and relevant
- **Link external resources**: Include URLs, documentation links, or file references

## Common Use Cases

- **Daily standups**: Progress notes and blockers discovered
- **Code review feedback**: Implementation suggestions and improvements
- **Stakeholder feedback**: Requirements clarifications and change requests
- **Technical research**: Solution investigation and technology evaluation
- **Risk assessment**: Complexity analysis and mitigation strategies
- **Knowledge capture**: Preserving decisions, rationale, and lessons learned 