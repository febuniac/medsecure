const fs = require('fs');
const path = require('path');

describe('Dockerfile', () => {
  let dockerfileContent;

  beforeAll(() => {
    const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
    dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
  });

  describe('file existence', () => {
    it('should exist in the project root', () => {
      const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);
    });
  });

  describe('multi-stage build', () => {
    it('should use multi-stage build with at least 3 stages', () => {
      const fromStatements = dockerfileContent.match(/^FROM\s+/gm);
      expect(fromStatements.length).toBeGreaterThanOrEqual(3);
    });

    it('should have a deps stage for dependency installation', () => {
      expect(dockerfileContent).toMatch(/FROM\s+node:\d+-alpine\s+AS\s+deps/);
    });

    it('should have a build stage', () => {
      expect(dockerfileContent).toMatch(/FROM\s+node:\d+-alpine\s+AS\s+build/);
    });

    it('should have a production stage', () => {
      expect(dockerfileContent).toMatch(/FROM\s+node:\d+-alpine\s+AS\s+production/);
    });
  });

  describe('base image', () => {
    it('should use Node.js 20 Alpine as base image', () => {
      expect(dockerfileContent).toMatch(/FROM\s+node:20-alpine/);
    });

    it('should use Alpine variant for smaller image size', () => {
      const fromStatements = dockerfileContent.match(/^FROM\s+.+$/gm);
      fromStatements.forEach((stmt) => {
        expect(stmt).toContain('alpine');
      });
    });
  });

  describe('security', () => {
    it('should create a non-root user', () => {
      expect(dockerfileContent).toMatch(/adduser|useradd/);
    });

    it('should switch to non-root user with USER directive', () => {
      expect(dockerfileContent).toMatch(/^USER\s+medsecure/m);
    });

    it('should set NODE_ENV to production', () => {
      expect(dockerfileContent).toMatch(/ENV\s+NODE_ENV=production/);
    });
  });

  describe('health check', () => {
    it('should include a HEALTHCHECK directive', () => {
      expect(dockerfileContent).toMatch(/^HEALTHCHECK/m);
    });

    it('should check the /health endpoint', () => {
      expect(dockerfileContent).toMatch(/\/health/);
    });
  });

  describe('port configuration', () => {
    it('should expose port 3000', () => {
      expect(dockerfileContent).toMatch(/^EXPOSE\s+3000/m);
    });
  });

  describe('dependency optimization', () => {
    it('should use npm ci for reproducible installs when lockfile exists', () => {
      expect(dockerfileContent).toMatch(/npm ci/);
    });

    it('should fall back to npm install when no lockfile exists', () => {
      expect(dockerfileContent).toMatch(/npm install/);
    });

    it('should install only production dependencies in deps stage', () => {
      expect(dockerfileContent).toMatch(/--omit=dev/);
    });
  });

  describe('start command', () => {
    it('should use node (not npm) to start the application', () => {
      expect(dockerfileContent).toMatch(/CMD\s+\["node"/);
    });

    it('should start src/index.js', () => {
      expect(dockerfileContent).toMatch(/src\/index\.js/);
    });
  });
});

describe('.dockerignore', () => {
  let dockerignoreContent;

  beforeAll(() => {
    const dockerignorePath = path.join(__dirname, '..', '.dockerignore');
    dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf8');
  });

  it('should exist in the project root', () => {
    const dockerignorePath = path.join(__dirname, '..', '.dockerignore');
    expect(fs.existsSync(dockerignorePath)).toBe(true);
  });

  it('should exclude node_modules', () => {
    expect(dockerignoreContent).toMatch(/node_modules/);
  });

  it('should exclude .git directory', () => {
    expect(dockerignoreContent).toMatch(/\.git/);
  });

  it('should exclude .env files', () => {
    expect(dockerignoreContent).toMatch(/\.env/);
  });

  it('should exclude test files', () => {
    expect(dockerignoreContent).toMatch(/tests/);
  });

  it('should exclude coverage directory', () => {
    expect(dockerignoreContent).toMatch(/coverage/);
  });
});
