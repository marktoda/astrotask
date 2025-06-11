# Acceptance Criteria System Guide

This guide explains how to use Astrotask's acceptance criteria system to define clear completion conditions for tasks.

## Overview

Acceptance criteria in Astrotask are stored as special context slices with the contextType `acceptance`. They define the specific conditions that must be met for a task to be considered complete.

## Basic Usage

### Adding Acceptance Criteria

Use the `addTaskContext` function with `contextType: "acceptance"`:

```typescript
await addTaskContext({
  taskId: "AUTH-001",
  title: "User can login with valid credentials",
  description: "POST /auth/login with correct email/password returns 200 status and JWT token",
  contextType: "acceptance"
});
```

### Retrieving Acceptance Criteria

Use the utility functions to filter context slices:

```typescript
import { filterAcceptanceCriteria, summarizeAcceptanceCriteria } from '@astrotask/core';

// Get all context slices for a task
const contextSlices = await astrotask.store.listContextSlices(taskId);

// Filter to only acceptance criteria
const acceptanceCriteria = filterAcceptanceCriteria(contextSlices);

// Generate a summary
const summary = summarizeAcceptanceCriteria(acceptanceCriteria);
console.log(summary);
```

## Real-World Examples

### API Development Task

```typescript
// Task: Implement user authentication API
const taskId = "AUTH-001";

// Acceptance criteria
await addTaskContext({
  taskId,
  title: "Valid login returns JWT token",
  description: "POST /auth/login with correct credentials returns 200 status with JWT token in response body. Token should expire in 24 hours.",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Invalid credentials return 401",
  description: "POST /auth/login with wrong password returns 401 status with error message 'Invalid credentials'",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Rate limiting prevents brute force",
  description: "After 5 failed login attempts within 15 minutes, IP is blocked for 30 minutes",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Passwords are securely hashed",
  description: "User passwords are hashed using bcrypt with salt rounds >= 12 before storage",
  contextType: "acceptance"
});
```

### Frontend Component Task

```typescript
// Task: Build responsive navigation component
const taskId = "UI-005";

await addTaskContext({
  taskId,
  title: "Navigation works on mobile devices",
  description: "Component displays hamburger menu on screens < 768px and expands/collapses properly",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Keyboard navigation is supported",
  description: "All menu items can be reached using Tab key, Enter/Space activate links",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Active page is highlighted",
  description: "Current page link has distinct visual styling (bold text, different background color)",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Screen reader accessible",
  description: "Navigation has proper ARIA labels, roles, and announces current page to screen readers",
  contextType: "acceptance"
});
```

### Database Migration Task

```typescript
// Task: Add user preferences table
const taskId = "DB-012";

await addTaskContext({
  taskId,
  title: "Migration runs without data loss",
  description: "All existing user data remains intact and accessible after migration completes",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Migration is reversible",
  description: "Down migration removes new table and constraints without affecting existing data",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Foreign key constraints work",
  description: "user_preferences.user_id properly references users.id with ON DELETE CASCADE",
  contextType: "acceptance"
});

await addTaskContext({
  taskId,
  title: "Performance is acceptable",
  description: "Migration completes in < 30 seconds on production database with 1M+ users",
  contextType: "acceptance"
});
```

## Using Utility Functions

### Validation

```typescript
import { validateAcceptanceCriteria } from '@astrotask/core';

const contextSlices = await astrotask.store.listContextSlices(taskId);
const acceptanceCriteria = filterAcceptanceCriteria(contextSlices);

const validation = validateAcceptanceCriteria(acceptanceCriteria);

if (!validation.isValid) {
  console.log('Issues found:', validation.issues);
}

if (validation.suggestions.length > 0) {
  console.log('Suggestions:', validation.suggestions);
}
```

### Completion Assessment

```typescript
import { assessAcceptanceCriteriaCompletion } from '@astrotask/core';

const assessment = assessAcceptanceCriteriaCompletion(acceptanceCriteria);
console.log(assessment.summary);
// Output: "2/4 criteria appear to be met, 2 need review"
```

### Generating Suggestions

```typescript
import { suggestAcceptanceCriteria } from '@astrotask/core';

const suggestions = suggestAcceptanceCriteria(
  "Implement user authentication API",
  "Build login/logout endpoints with JWT tokens"
);

// Add suggested criteria to the task
for (const suggestion of suggestions) {
  await addTaskContext({
    taskId,
    title: suggestion.title,
    description: suggestion.description,
    contextType: "acceptance"
  });
}
```

## Best Practices

### Writing Effective Criteria

#### ✅ Good Examples

```typescript
// Specific and measurable
{
  title: "API response time under 200ms",
  description: "Endpoint responds within 200ms for 95% of requests under normal load (< 100 concurrent users)"
}

// Clear pass/fail condition
{
  title: "Form validation prevents empty submissions",
  description: "Submit button is disabled when required fields (name, email) are empty, with clear error messages"
}

// Testable behavior
{
  title: "Password reset email is sent",
  description: "User receives password reset email within 5 minutes, email contains valid reset link that expires in 1 hour"
}
```

#### ❌ Poor Examples

```typescript
// Too vague
{
  title: "System works properly",
  description: "Everything should work as expected"
}

// Not measurable
{
  title: "Good performance",
  description: "The app should be fast enough"
}

// Implementation details instead of behavior
{
  title: "Use bcrypt for passwords",
  description: "Password hashing should use bcrypt library"
}
```

### Organization Tips

1. **Group related criteria** - Use consistent naming for related acceptance criteria
2. **Prioritize criteria** - Add most critical criteria first
3. **Keep criteria atomic** - One specific condition per criterion
4. **Include edge cases** - Don't forget error conditions and boundary cases
5. **Review before completion** - Check all criteria before marking task as done

### Integration with Workflow

```typescript
// Agent workflow example
const nextTask = await getNextTask({ status: "pending" });
if (nextTask) {
  // Start work
  await updateStatus({ taskId: nextTask.id, status: "in-progress" });
  
  // Check if task has acceptance criteria
  const contextSlices = await astrotask.store.listContextSlices(nextTask.id);
  const acceptanceCriteria = filterAcceptanceCriteria(contextSlices);
  
  if (acceptanceCriteria.length === 0) {
    // Consider adding criteria for complex tasks
    const suggestions = suggestAcceptanceCriteria(nextTask.title, nextTask.description);
    console.log(`Consider adding these acceptance criteria:`, suggestions);
  }
  
  // Work on the task...
  
  // Before marking as done, review criteria
  if (acceptanceCriteria.length > 0) {
    const validation = validateAcceptanceCriteria(acceptanceCriteria);
    const assessment = assessAcceptanceCriteriaCompletion(acceptanceCriteria);
    
    console.log('Acceptance criteria status:', assessment.summary);
    
    // Only mark as done if criteria are met
    if (assessment.needsReview === 0) {
      await updateStatus({ taskId: nextTask.id, status: "done" });
    }
  }
}
```

## Advanced Usage

### Custom Validation

You can extend the validation system for specific requirements:

```typescript
function validateCustomAcceptanceCriteria(criteria: ContextSlice[]): boolean {
  // Custom validation logic
  return criteria.every(c => {
    // Example: ensure all API criteria mention status codes
    if (c.title.toLowerCase().includes('api')) {
      return c.description?.includes('200') || c.description?.includes('400') || c.description?.includes('404');
    }
    return true;
  });
}
```

### Template Generation

Create templates for common task types:

```typescript
const apiTaskTemplate = {
  statusCodes: {
    title: "API returns appropriate status codes",
    description: "Endpoint returns 200 for success, 400 for bad input, 404 for not found, 500 for server errors"
  },
  validation: {
    title: "Input validation works correctly",
    description: "API validates required fields and returns descriptive error messages for invalid input"
  },
  authentication: {
    title: "Authentication is enforced",
    description: "Protected endpoints require valid JWT token, return 401 for missing/invalid tokens"
  }
};

// Apply template to a task
for (const [key, criteria] of Object.entries(apiTaskTemplate)) {
  await addTaskContext({
    taskId: apiTaskId,
    ...criteria,
    contextType: "acceptance"
  });
}
```

## Conclusion

The acceptance criteria system provides a simple but powerful way to define clear completion conditions for tasks. By using context slices with the `acceptance` contextType, you can:

- Define specific, testable conditions
- Track progress toward completion
- Ensure quality standards are met
- Facilitate collaboration between humans and AI agents
- Create reusable patterns for common task types

Start by adding acceptance criteria to your most critical tasks, and gradually expand usage as you become comfortable with the system. 