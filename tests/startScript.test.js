const { execSync } = require('child_process');
const path = require('path');

describe('npm start script', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('should have a start script defined in package.json', () => {
    const pkg = require('../package.json');
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.start).toBeDefined();
  });

  it('should set start script to "node src/index.js"', () => {
    const pkg = require('../package.json');
    expect(pkg.scripts.start).toBe('node src/index.js');
  });

  it('should have main entry point matching start script target', () => {
    const pkg = require('../package.json');
    expect(pkg.main).toBe('src/index.js');
  });

  it('should have src/index.js entry point file', () => {
    const fs = require('fs');
    const entryPoint = path.join(rootDir, 'src', 'index.js');
    expect(fs.existsSync(entryPoint)).toBe(true);
  });

  it('should resolve start script entry point via npm', () => {
    const output = execSync('npm run env -- echo ok', {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(output).toContain('ok');
  });
});
