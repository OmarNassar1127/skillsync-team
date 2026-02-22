export class SkillSyncError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'SkillSyncError';
    this.hint = hint;
  }
}

export class NotInitializedError extends SkillSyncError {
  constructor() {
    super(
      'SkillSync is not initialized.',
      'Run: skillsync init <repo-url>'
    );
  }
}

export class SkillNotFoundError extends SkillSyncError {
  constructor(name, location = 'local') {
    const where = location === 'local' ? '~/.claude/skills/' : 'the shared repo';
    super(
      `Skill "${name}" not found in ${where}`,
      'Run: skillsync list  to see available skills'
    );
  }
}

export class GitAuthError extends SkillSyncError {
  constructor() {
    super(
      'Git authentication failed.',
      'Ensure your SSH key or credentials are configured for the repo.'
    );
  }
}

export class RepoNotFoundError extends SkillSyncError {
  constructor(url) {
    super(
      `Repository not found: ${url}`,
      'Create the repository first on GitHub/GitLab, then run skillsync init again.'
    );
  }
}

export class MergeConflictError extends SkillSyncError {
  constructor(files) {
    const fileList = files.map(f => `    ${f}`).join('\n');
    super(
      `Merge conflict detected.\n\n  Conflicting files:\n${fileList}`,
      'Options:\n  1. Pull their version:  skillsync pull --theirs\n  2. Keep your version:   skillsync push <skill> --force\n  3. Manual merge:        cd ~/.skillsync/repo && git merge'
    );
  }
}
