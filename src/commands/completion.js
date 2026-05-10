import { SkillSyncError } from '../lib/errors.js';

const BASH_SCRIPT = `# SkillSync bash completion
# NOTE: We deliberately avoid \`compgen -W "$response"\` because compgen
# performs command-substitution expansion on candidate strings, which
# would be a remote-code-execution sink if a skill name ever contained
# \\$(...). We read line-by-line and prefix-match in pure bash instead.
_skillsync_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local response line
  response=$(skillsync __complete "\${COMP_WORDS[@]:1:COMP_CWORD-1}" "$cur" 2>/dev/null) || return
  COMPREPLY=()
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    if [[ "$line" == "$cur"* ]]; then
      COMPREPLY+=("$line")
    fi
  done <<< "$response"
}
complete -F _skillsync_complete skillsync
`;

const ZSH_SCRIPT = `# SkillSync zsh completion
_skillsync() {
  local -a candidates
  local response
  response=("\${(@f)$(skillsync __complete "\${words[@]:1}" 2>/dev/null)}")
  candidates=("\${response[@]}")
  compadd -- "\${candidates[@]}"
}
compdef _skillsync skillsync
`;

const FISH_SCRIPT = `# SkillSync fish completion
function __skillsync_complete
  set -l args (commandline -opc)
  set -l current (commandline -ct)
  set -l rest $args[2..-1]
  if test (count $rest) -eq 0
    skillsync __complete "$current" 2>/dev/null
  else
    skillsync __complete $rest "$current" 2>/dev/null
  end
end
complete -c skillsync -f -a "(__skillsync_complete)"
`;

const SHELLS = {
  bash: BASH_SCRIPT,
  zsh: ZSH_SCRIPT,
  fish: FISH_SCRIPT,
};

const INSTALL_HINTS = {
  bash: '  Add to your ~/.bashrc:\n    eval "$(skillsync completion bash)"\n  Or save to a file and source it.',
  zsh: '  Add to your ~/.zshrc:\n    eval "$(skillsync completion zsh)"\n  Restart your shell or run: source ~/.zshrc',
  fish: '  Save to ~/.config/fish/completions/skillsync.fish:\n    skillsync completion fish > ~/.config/fish/completions/skillsync.fish',
};

export async function completion(shell) {
  if (!shell) {
    process.stderr.write('Usage: skillsync completion <bash|zsh|fish>\n\n');
    process.stderr.write('Examples:\n');
    for (const s of Object.keys(SHELLS)) {
      process.stderr.write(`\n  ${s}:\n${INSTALL_HINTS[s]}\n`);
    }
    return;
  }

  const script = SHELLS[shell];
  if (!script) {
    throw new SkillSyncError(
      `Unknown shell: ${shell}`,
      `Supported: ${Object.keys(SHELLS).join(', ')}`
    );
  }

  process.stdout.write(script);
}
