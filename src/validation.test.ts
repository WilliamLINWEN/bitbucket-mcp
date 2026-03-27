import { afterEach, describe, it, expect } from 'vitest';
import { validateWorkspace, validateRepoSlug, WorkspaceSchema, RepoSlugSchema, BranchNameSchema, resolveWorkspace } from './validation.js';

const originalWorkspaceEnv = process.env.BITBUCKET_WORKSPACE;

afterEach(() => {
  if (originalWorkspaceEnv === undefined) {
    delete process.env.BITBUCKET_WORKSPACE;
  } else {
    process.env.BITBUCKET_WORKSPACE = originalWorkspaceEnv;
  }
});

describe('Validation', () => {
  describe('validateWorkspace', () => {
    it('should accept valid workspace names', () => {
      const validNames = ['myworkspace', 'my-workspace', 'my_workspace', 'workspace123'];
      
      validNames.forEach(name => {
        expect(validateWorkspace(name)).toBe(true);
      });
    });

    it('should reject invalid workspace names', () => {
      const invalidNames = ['', 'workspace name', 'workspace@name'];
      
      invalidNames.forEach(name => {
        expect(validateWorkspace(name)).toBe(false);
      });
    });

    it('should reject workspace names that are too long', () => {
      const longName = 'a'.repeat(101);
      expect(validateWorkspace(longName)).toBe(false);
    });
  });

  describe('validateRepoSlug', () => {
    it('should accept valid repository slugs', () => {
      const validSlugs = ['my-repo', 'my_repo', 'myrepo', 'repo123', 'my-awesome-repo'];
      
      validSlugs.forEach(slug => {
        expect(validateRepoSlug(slug)).toBe(true);
      });
    });

    it('should reject invalid repository slugs', () => {
      const invalidSlugs = ['', 'repo name', 'repo@name'];
      
      invalidSlugs.forEach(slug => {
        expect(validateRepoSlug(slug)).toBe(false);
      });
    });
  });

  describe('WorkspaceSchema', () => {
    it('should validate workspace names correctly', () => {
      expect(() => WorkspaceSchema.parse('valid-workspace')).not.toThrow();
      expect(() => WorkspaceSchema.parse('')).toThrow();
      expect(() => WorkspaceSchema.parse('invalid workspace')).toThrow();
    });
  });

  describe('RepoSlugSchema', () => {
    it('should validate repository slugs correctly', () => {
      expect(() => RepoSlugSchema.parse('valid-repo')).not.toThrow();
      expect(() => RepoSlugSchema.parse('')).toThrow();
      expect(() => RepoSlugSchema.parse('invalid repo')).toThrow();
    });
  });

  describe('BranchNameSchema', () => {
    it('should validate branch names correctly', () => {
      expect(() => BranchNameSchema.parse('main')).not.toThrow();
      expect(() => BranchNameSchema.parse('feature/my-feature')).not.toThrow();
      expect(() => BranchNameSchema.parse('')).toThrow();
      expect(() => BranchNameSchema.parse('a'.repeat(201))).toThrow();
    });
  });

  describe('resolveWorkspace', () => {
    it('prefers the explicit tool argument over BITBUCKET_WORKSPACE', () => {
      process.env.BITBUCKET_WORKSPACE = 'env-workspace';

      expect(resolveWorkspace('arg-workspace')).toBe('arg-workspace');
    });

    it('falls back to BITBUCKET_WORKSPACE when the tool argument is undefined', () => {
      process.env.BITBUCKET_WORKSPACE = 'env-workspace';

      expect(resolveWorkspace(undefined)).toBe('env-workspace');
    });

    it('throws a clear error when neither the tool argument nor BITBUCKET_WORKSPACE is set', () => {
      delete process.env.BITBUCKET_WORKSPACE;

      expect(() => resolveWorkspace(undefined)).toThrow(
        'workspace parameter is required. Provide it as a tool argument or set the BITBUCKET_WORKSPACE environment variable.'
      );
    });

    it('treats an empty-string tool argument as invalid instead of falling back to BITBUCKET_WORKSPACE', () => {
      process.env.BITBUCKET_WORKSPACE = 'env-workspace';

      expect(() => resolveWorkspace('')).toThrow(/Invalid workspace value:/);
    });
  });
});
