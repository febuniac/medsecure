const fs = require('fs');
const path = require('path');

describe('npm start script', () => {
  const rootDir = path.resolve(__dirname, '..');
  const pkg = require('../package.json');

  it('should have a start script defined in package.json', () => {
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.start).toBeDefined();
  });

  it('should set start script to "node src/index.js"', () => {
    expect(pkg.scripts.start).toBe('node src/index.js');
  });

  it('should have main entry point matching start script target', () => {
    expect(pkg.main).toBe('src/index.js');
  });

  it('should have src/index.js entry point file', () => {
    const entryPoint = path.join(rootDir, 'src', 'index.js');
    expect(fs.existsSync(entryPoint)).toBe(true);
  });
});
