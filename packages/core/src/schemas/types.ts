// Simple shared types for the local-first task navigation platform

// Simple field constraints
export const CONSTRAINTS = {
  TITLE: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 200,
  },
  DESCRIPTION: {
    MAX_LENGTH: 2000,
  },
} as const;
