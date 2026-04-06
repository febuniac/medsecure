const fs = require('fs');
const path = require('path');

describe('API Versioning', () => {
  let indexSource;
  let v1RouterSource;

  beforeAll(() => {
    indexSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'index.js'),
      'utf8'
    );
    v1RouterSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'api', 'v1Router.js'),
      'utf8'
    );
  });

  describe('v1Router module', () => {
    test('v1Router.js file exists', () => {
      const routerPath = path.join(__dirname, '..', 'src', 'api', 'v1Router.js');
      expect(fs.existsSync(routerPath)).toBe(true);
    });

    test('v1Router creates an Express Router', () => {
      expect(v1RouterSource).toContain("express.Router()");
    });

    test('v1Router registers all expected route groups', () => {
      const expectedRoutes = [
        { path: '/patients', module: './patients' },
        { path: '/records', module: './records' },
        { path: '/appointments', module: './appointments' },
        { path: '/prescriptions', module: './prescriptions' },
        { path: '/consent', module: './consent' },
        { path: '/provider-assignments', module: './providerAssignments' },
        { path: '/breach-notifications', module: './breachNotification' },
        { path: '/baa-agreements', module: './baaAgreements' },
        { path: '/backup-verification', module: './backupVerification' },
        { path: '/auth', module: './auth' }
      ];

      expectedRoutes.forEach(({ path: routePath, module }) => {
        expect(v1RouterSource).toContain(`'${routePath}'`);
        expect(v1RouterSource).toContain(`require('${module}')`);
      });
    });

    test('v1Router applies auth middleware to protected routes', () => {
      // Auth route should NOT have authMiddleware
      const authLine = v1RouterSource.split('\n').find(line => line.includes("'/auth'"));
      expect(authLine).not.toContain('authMiddleware');

      // Other routes should have authMiddleware
      const protectedRoutes = ['/patients', '/records', '/appointments', '/prescriptions'];
      protectedRoutes.forEach(route => {
        const line = v1RouterSource.split('\n').find(l => l.includes(`'${route}'`));
        expect(line).toContain('authMiddleware');
      });
    });

    test('v1Router does not reference non-existent providers or fhir modules', () => {
      expect(v1RouterSource).not.toContain("require('./providers')");
      expect(v1RouterSource).not.toContain("require('./fhir')");
    });
  });

  describe('index.js route mounting', () => {
    test('mounts v1Router at /api/v1', () => {
      expect(indexSource).toContain("app.use('/api/v1', v1Router)");
    });

    test('imports v1Router module', () => {
      expect(indexSource).toContain("require('./api/v1Router')");
    });

    test('does not have hardcoded /api/v1/ individual route registrations', () => {
      const hardcodedV1Routes = indexSource.match(/app\.use\('\/api\/v1\//g);
      expect(hardcodedV1Routes).toBeNull();
    });

    test('does not mount unversioned /fhir routes', () => {
      expect(indexSource).not.toMatch(/app\.use\('\/fhir/);
    });

    test('health endpoint remains unversioned', () => {
      expect(indexSource).toContain("app.get('/health'");
    });

    test('does not import authMiddleware directly (delegated to v1Router)', () => {
      expect(indexSource).not.toContain("require('./middleware/auth')");
    });
  });
});
