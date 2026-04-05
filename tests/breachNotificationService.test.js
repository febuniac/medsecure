// Must prefix with 'mock' so jest.mock factory can reference it
const mockTableChains = {};

function mockMakeChain() {
  return {
    where: jest.fn().mockReturnThis(),
    whereNotIn: jest.fn().mockReturnThis(),
    whereBetween: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{}]) }),
    update: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{}]) })
  };
}

jest.mock('../src/models/db', () => {
  return jest.fn((tableName) => {
    if (!mockTableChains[tableName]) {
      mockTableChains[tableName] = mockMakeChain();
    }
    return mockTableChains[tableName];
  });
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

// Import AFTER mocks
const BreachNotificationService = require('../src/services/breachNotificationService');
const {
  BREACH_STATUSES,
  BREACH_SEVERITY,
  HIPAA_NOTIFICATION_DEADLINE_DAYS,
  LARGE_BREACH_THRESHOLD
} = require('../src/services/breachNotificationService');

const mockUser = { id: 'user-1', provider_id: 'provider-1' };

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockTableChains)) {
    delete mockTableChains[key];
  }
});

describe('BreachNotificationService', () => {
  describe('Constants', () => {
    test('HIPAA notification deadline is 60 days', () => {
      expect(HIPAA_NOTIFICATION_DEADLINE_DAYS).toBe(60);
    });

    test('Large breach threshold is 500 individuals', () => {
      expect(LARGE_BREACH_THRESHOLD).toBe(500);
    });

    test('BREACH_STATUSES contains all required statuses', () => {
      expect(BREACH_STATUSES).toEqual([
        'detected', 'investigating', 'confirmed', 'notifying', 'reported', 'closed'
      ]);
    });

    test('BREACH_SEVERITY contains all severity levels', () => {
      expect(BREACH_SEVERITY).toEqual(['low', 'medium', 'high', 'critical']);
    });
  });

  describe('reportBreach', () => {
    test('creates a breach with 60-day notification deadline', async () => {
      const breachData = {
        title: 'Test Breach',
        description: 'A test breach incident',
        breach_type: 'unauthorized_access',
        severity: 'high',
        individuals_affected_count: 10
      };

      const insertedBreach = {
        id: 'breach-1',
        ...breachData,
        status: 'detected',
        individuals_affected_count: 10
      };

      const chain = mockMakeChain();
      chain.insert.mockReturnValue({
        returning: jest.fn().mockResolvedValue([insertedBreach])
      });
      mockTableChains['breach_incidents'] = chain;

      const result = await BreachNotificationService.reportBreach(breachData, mockUser);

      expect(result).toEqual(insertedBreach);
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Breach',
          status: 'detected',
          reported_by: 'user-1',
          provider_id: 'provider-1'
        })
      );
    });

    test('sets notification_deadline 60 days from now', async () => {
      const breachData = {
        title: 'Deadline Test',
        description: 'Testing deadline calculation',
        breach_type: 'theft',
        severity: 'medium',
        individuals_affected_count: 5
      };

      const chain = mockMakeChain();
      let capturedInsert;
      chain.insert.mockImplementation((data) => {
        capturedInsert = data;
        return { returning: jest.fn().mockResolvedValue([{ id: 'b-1', ...data, individuals_affected_count: 5 }]) };
      });
      mockTableChains['breach_incidents'] = chain;

      await BreachNotificationService.reportBreach(breachData, mockUser);

      const deadline = new Date(capturedInsert.notification_deadline);
      const discovery = new Date(capturedInsert.discovery_date);
      const diffDays = Math.round((deadline - discovery) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(HIPAA_NOTIFICATION_DEADLINE_DAYS);
    });

    test('auto-schedules HHS and media notifications for large breaches (>= 500)', async () => {
      const breachData = {
        title: 'Large Breach',
        description: 'A large breach affecting many people',
        breach_type: 'hacking',
        severity: 'critical',
        individuals_affected_count: 600
      };

      const insertedBreach = {
        id: 'breach-large',
        title: 'Large Breach',
        individuals_affected_count: 600,
        status: 'detected'
      };

      const incidentsChain = mockMakeChain();
      incidentsChain.insert.mockReturnValue({
        returning: jest.fn().mockResolvedValue([insertedBreach])
      });
      mockTableChains['breach_incidents'] = incidentsChain;

      const notifChain = mockMakeChain();
      mockTableChains['breach_notifications'] = notifChain;

      await BreachNotificationService.reportBreach(breachData, mockUser);

      expect(notifChain.insert).toHaveBeenCalled();
      const insertedNotifs = notifChain.insert.mock.calls[0][0];
      expect(insertedNotifs).toHaveLength(2);
      expect(insertedNotifs[0].notification_type).toBe('hhs');
      expect(insertedNotifs[1].notification_type).toBe('media');
    });

    test('does NOT auto-schedule notifications for small breaches (< 500)', async () => {
      const breachData = {
        title: 'Small Breach',
        description: 'A small breach',
        breach_type: 'loss',
        severity: 'low',
        individuals_affected_count: 50
      };

      const insertedBreach = {
        id: 'breach-small',
        individuals_affected_count: 50,
        status: 'detected'
      };

      const incidentsChain = mockMakeChain();
      incidentsChain.insert.mockReturnValue({
        returning: jest.fn().mockResolvedValue([insertedBreach])
      });
      mockTableChains['breach_incidents'] = incidentsChain;

      await BreachNotificationService.reportBreach(breachData, mockUser);
      // breach_notifications table should NOT have been accessed
      expect(mockTableChains['breach_notifications']).toBeUndefined();
    });
  });

  describe('getById', () => {
    test('returns breach by id scoped to provider', async () => {
      const breach = {
        id: 'breach-1',
        title: 'Test',
        provider_id: 'provider-1',
        phi_types_involved: '["ssn","dob"]'
      };

      const chain = mockMakeChain();
      chain.first.mockResolvedValue(breach);
      mockTableChains['breach_incidents'] = chain;

      const result = await BreachNotificationService.getById('breach-1', mockUser);

      expect(result.phi_types_involved).toEqual(['ssn', 'dob']);
      expect(chain.where).toHaveBeenCalledWith({ id: 'breach-1', provider_id: 'provider-1' });
    });

    test('returns null when breach not found', async () => {
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(undefined);
      mockTableChains['breach_incidents'] = chain;

      const result = await BreachNotificationService.getById('nonexistent', mockUser);
      expect(result).toBeNull();
    });
  });

  describe('updateBreach', () => {
    test('rejects backward status transitions', async () => {
      const existing = { id: 'breach-1', status: 'confirmed', provider_id: 'provider-1' };
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(existing);
      mockTableChains['breach_incidents'] = chain;

      await expect(
        BreachNotificationService.updateBreach('breach-1', { status: 'detected' }, mockUser)
      ).rejects.toThrow("Invalid status transition from 'confirmed' to 'detected'");
    });

    test('allows forward status transitions', async () => {
      const existing = { id: 'breach-1', status: 'detected', provider_id: 'provider-1' };
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(existing);
      chain.update.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...existing, status: 'investigating' }])
      });
      mockTableChains['breach_incidents'] = chain;

      const result = await BreachNotificationService.updateBreach(
        'breach-1', { status: 'investigating' }, mockUser
      );

      expect(result.status).toBe('investigating');
    });

    test('returns null when breach not found', async () => {
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(undefined);
      mockTableChains['breach_incidents'] = chain;

      const result = await BreachNotificationService.updateBreach('nonexistent', { title: 'x' }, mockUser);
      expect(result).toBeNull();
    });
  });

  describe('performRiskAssessment', () => {
    test('creates risk assessment and updates breach status', async () => {
      const breach = { id: 'breach-1', status: 'detected', provider_id: 'provider-1' };
      const assessment = {
        phi_nature_extent: 'moderate',
        unauthorized_recipient: 'known_external',
        phi_acquired_or_viewed: 'viewed_only',
        mitigation_extent: 'substantially_mitigated'
      };

      const incidentsChain = mockMakeChain();
      incidentsChain.first.mockResolvedValue(breach);
      incidentsChain.update.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...breach, status: 'investigating' }])
      });
      mockTableChains['breach_incidents'] = incidentsChain;

      const raChain = mockMakeChain();
      raChain.insert.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{
          id: 'ra-1',
          breach_id: 'breach-1',
          ...assessment,
          overall_risk_level: 'medium'
        }])
      });
      mockTableChains['breach_risk_assessments'] = raChain;

      const result = await BreachNotificationService.performRiskAssessment('breach-1', assessment, mockUser);
      expect(result.breach_id).toBe('breach-1');
      expect(result.overall_risk_level).toBe('medium');
    });

    test('returns null for non-existent breach', async () => {
      const chain = mockMakeChain();
      chain.first.mockResolvedValue(undefined);
      mockTableChains['breach_incidents'] = chain;

      const result = await BreachNotificationService.performRiskAssessment('nonexistent', {}, mockUser);
      expect(result).toBeNull();
    });
  });

  describe('_calculateRiskLevel', () => {
    test('returns low for minimal risk factors', () => {
      const result = BreachNotificationService._calculateRiskLevel({
        phi_nature_extent: 'minimal',
        unauthorized_recipient: 'known_internal',
        phi_acquired_or_viewed: 'not_accessed',
        mitigation_extent: 'fully_mitigated'
      });
      expect(result).toBe('low');
    });

    test('returns critical for maximum risk factors', () => {
      const result = BreachNotificationService._calculateRiskLevel({
        phi_nature_extent: 'comprehensive',
        unauthorized_recipient: 'malicious_actor',
        phi_acquired_or_viewed: 'exfiltrated',
        mitigation_extent: 'not_mitigated'
      });
      expect(result).toBe('critical');
    });

    test('returns medium for moderate risk factors', () => {
      const result = BreachNotificationService._calculateRiskLevel({
        phi_nature_extent: 'moderate',
        unauthorized_recipient: 'known_external',
        phi_acquired_or_viewed: 'viewed_only',
        mitigation_extent: 'substantially_mitigated'
      });
      expect(result).toBe('medium');
    });

    test('returns high for elevated risk factors', () => {
      const result = BreachNotificationService._calculateRiskLevel({
        phi_nature_extent: 'extensive',
        unauthorized_recipient: 'unknown',
        phi_acquired_or_viewed: 'acquired',
        mitigation_extent: 'partially_mitigated'
      });
      expect(result).toBe('high');
    });
  });

  describe('sendNotification', () => {
    test('creates notification and updates breach status', async () => {
      const breach = { id: 'breach-1', status: 'confirmed', provider_id: 'provider-1' };
      const notifData = {
        notification_type: 'individual',
        recipient_type: 'patient',
        recipient_identifier: 'patient@email.com',
        subject: 'Breach Notice',
        message_body: 'Your data may have been affected.',
        delivery_method: 'email'
      };

      const incidentsChain = mockMakeChain();
      incidentsChain.first.mockResolvedValue(breach);
      incidentsChain.update.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...breach, status: 'notifying' }])
      });
      mockTableChains['breach_incidents'] = incidentsChain;

      const notifChain = mockMakeChain();
      notifChain.insert.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{
          id: 'notif-1',
          breach_id: 'breach-1',
          status: 'pending',
          ...notifData
        }])
      });
      mockTableChains['breach_notifications'] = notifChain;

      const result = await BreachNotificationService.sendNotification('breach-1', notifData, mockUser);
      expect(result.status).toBe('pending');
      expect(result.notification_type).toBe('individual');
    });
  });

  describe('markAsReported', () => {
    test('marks breach as reported to HHS', async () => {
      const breach = { id: 'breach-1', status: 'notifying', provider_id: 'provider-1' };
      const reportDetails = {
        report_date: '2026-04-01T00:00:00.000Z',
        reference_number: 'HHS-2026-001'
      };

      const chain = mockMakeChain();
      chain.first.mockResolvedValue(breach);
      chain.update.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{
          ...breach,
          status: 'reported',
          hhs_report_date: reportDetails.report_date,
          hhs_report_reference: reportDetails.reference_number
        }])
      });
      mockTableChains['breach_incidents'] = chain;

      const result = await BreachNotificationService.markAsReported('breach-1', reportDetails, mockUser);
      expect(result.status).toBe('reported');
      expect(result.hhs_report_reference).toBe('HHS-2026-001');
    });
  });

  describe('getAnnualSummary', () => {
    test('returns structured annual summary with breakdowns', async () => {
      const breaches = [
        { id: '1', severity: 'high', status: 'reported', individuals_affected_count: 100, discovery_date: '2026-03-01' },
        { id: '2', severity: 'low', status: 'closed', individuals_affected_count: 5, discovery_date: '2026-06-15' },
        { id: '3', severity: 'critical', status: 'reported', individuals_affected_count: 600, discovery_date: '2026-09-01' }
      ];

      const chain = mockMakeChain();
      chain.orderBy.mockResolvedValue(breaches);
      mockTableChains['breach_incidents'] = chain;

      const result = await BreachNotificationService.getAnnualSummary(2026, mockUser);

      expect(result.year).toBe(2026);
      expect(result.total_breaches).toBe(3);
      expect(result.total_individuals_affected).toBe(705);
      expect(result.large_breaches).toBe(1);
      expect(result.small_breaches).toBe(2);
      expect(result.by_severity.critical).toBe(1);
      expect(result.by_severity.high).toBe(1);
      expect(result.by_severity.low).toBe(1);
    });
  });
});
