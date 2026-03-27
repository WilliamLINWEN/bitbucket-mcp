import { z } from "zod";

// Input validation schemas
export const WorkspaceSchema = z.string()
  .min(1, "Workspace name cannot be empty")
  .regex(/^[a-zA-Z0-9_-]+$/, "Workspace name can only contain letters, numbers, hyphens, and underscores")
  .max(100, "Workspace name cannot exceed 100 characters");

export const RepoSlugSchema = z.string()
  .min(1, "Repository slug cannot be empty")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Repository slug can only contain letters, numbers, dots, hyphens, and underscores")
  .max(100, "Repository slug cannot exceed 100 characters");

export const BranchNameSchema = z.string()
  .min(1, "Branch name cannot be empty")
  .max(200, "Branch name cannot exceed 200 characters");

// Utility function to validate workspace names
export function validateWorkspace(workspace: string): boolean {
  try {
    WorkspaceSchema.parse(workspace);
    return true;
  } catch {
    return false;
  }
}

// Utility function to validate repository slugs
export function validateRepoSlug(repoSlug: string): boolean {
  try {
    RepoSlugSchema.parse(repoSlug);
    return true;
  } catch {
    return false;
  }
}

// Resolve workspace from tool argument or BITBUCKET_WORKSPACE env var
export function resolveWorkspace(workspace?: string): string {
  const resolved = workspace ?? process.env.BITBUCKET_WORKSPACE;
  if (resolved === undefined) {
    throw new Error(
      "workspace parameter is required. Provide it as a tool argument or set the BITBUCKET_WORKSPACE environment variable."
    );
  }
  try {
    return WorkspaceSchema.parse(resolved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid workspace value: ${formatValidationError(error)}`);
    }
    throw error;
  }
}

// Utility function to format validation errors
export function formatValidationError(error: z.ZodError): string {
  return error.errors
    .map(err => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}
