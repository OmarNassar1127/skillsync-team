import chalk from 'chalk';
import ora from 'ora';

export const log = {
  info: (msg) => console.log(chalk.blue('  ' + msg)),
  success: (msg) => console.log(chalk.green('  ' + msg)),
  warn: (msg) => console.log(chalk.yellow('  ' + msg)),
  error: (msg) => console.error(chalk.red('  ' + msg)),
  dim: (msg) => console.log(chalk.dim('  ' + msg)),
  plain: (msg) => console.log('  ' + msg),

  skill: (name, detail) => {
    console.log(`    ${chalk.cyan(name.padEnd(28))} ${detail}`);
  },

  header: (msg) => {
    console.log('');
    console.log(chalk.bold('  ' + msg));
  },

  newline: () => console.log(''),
};

export function spinner(text) {
  return ora({ text: '  ' + text, indent: 0 }).start();
}
