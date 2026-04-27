/**
 * Compliance Engine
 * © 2026 Athena Core Technologies
 *
 * Server-side HIPAA compliance scoring
 * Evaluates organization compliance posture
 * NOT exposed to frontend - calculation logic is proprietary
 */

class ComplianceEngine {
  constructor() {
    this.weights = {
      accessControls: 0.25,
      encryption: 0.20,
      auditLogging: 0.20,
      training: 0.15,
      policyEnforcement: 0.20
    };
  }

  /**
   * Calculate overall compliance score for an organization
   * Scores range from 0-100 representing compliance percentage
   * Score < 70: Non-compliant, 70-90: Needs attention, > 90: Compliant
   */
  calculateComplianceScore(orgData) {
    const scores = {
      accessControls: this.scoreAccessControls(orgData),
      encryption: this.scoreEncryption(orgData),
      auditLogging: this.scoreAuditLogging(orgData),
      training: this.scoreTraining(orgData),
      policyEnforcement: this.scorePolicyEnforcement(orgData)
    };

    let totalScore = 0;
    const breakdown = {};

    for (const [key, weight] of Object.entries(this.weights)) {
      const weighted = scores[key] * weight;
      totalScore += weighted;
      breakdown[key] = {
        raw: Math.round(scores[key] * 100),
        weight,
        weighted: Math.round(weighted * 100) / 100
      };
    }

    const finalScore = Math.round(totalScore * 100);

    return {
      overallScore: finalScore,
      breakdown,
      status:
        finalScore >= 90
          ? 'COMPLIANT'
          : finalScore >= 70
            ? 'NEEDS_ATTENTION'
            : 'NON_COMPLIANT',
      recommendations: this.generateRecommendations(scores),
      timestamp: new Date().toISOString(),
      nextReviewDate: this.getNextReviewDate(finalScore)
    };
  }

  /**
   * Access Controls Score
   * Evaluates MFA, RBAC, password policies
   */
  scoreAccessControls(org) {
    let score = 0.5; // Base score

    // MFA enforcement
    if (org?.mfaEnforced) {
      score += 0.2;
    }

    // RBAC configured
    if (org?.rbacConfigured) {
      score += 0.15;
    }

    // Password policy (min 12 chars, complexity, rotation)
    if (org?.passwordPolicyEnforced) {
      score += 0.1;
    }

    // Session timeout configured
    if (org?.sessionTimeoutMinutes && org.sessionTimeoutMinutes <= 30) {
      score += 0.05;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Encryption Score
   * Evaluates TLS 1.3, AES-256, key rotation
   */
  scoreEncryption(org) {
    let score = 0.9; // Assume infrastructure is encrypted

    // TLS 1.3 enforced
    if (org?.tls13Enforced) {
      score += 0.05;
    }

    // Key rotation schedule
    if (org?.keyRotationMonths && org.keyRotationMonths <= 12) {
      score += 0.05;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Audit Logging Score
   * Evaluates logging enablement, retention, monitoring
   */
  scoreAuditLogging(org) {
    let score = 0.4;

    // Audit logging enabled
    if (org?.auditEnabled) {
      score += 0.3;
    }

    // Retention meets 6 years requirement
    if (org?.auditRetentionYears && org.auditRetentionYears >= 6) {
      score += 0.2;
    }

    // Log monitoring/alerting configured
    if (org?.logMonitoringEnabled) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Training Score
   * Evaluates HIPAA training completion and recency
   */
  scoreTraining(org) {
    if (!org?.lastTrainingDate) {
      return 0.3;
    }

    const trainingDate = new Date(org.lastTrainingDate);
    const monthsSinceTraining = this.getMonthsDifference(trainingDate, new Date());

    if (monthsSinceTraining <= 12) {
      return 0.95; // Current training
    }
    if (monthsSinceTraining <= 24) {
      return 0.7; // Overdue but recent
    }
    return 0.3; // Significantly overdue
  }

  /**
   * Policy Enforcement Score
   * Evaluates policies, documentation, incident response
   */
  scorePolicyEnforcement(org) {
    let score = 0.6;

    // Privacy policy documented
    if (org?.policyDocumented) {
      score += 0.15;
    }

    // Incident response plan
    if (org?.incidentResponsePlan) {
      score += 0.15;
    }

    // Business associate agreements
    if (org?.baaCount && org.baaCount > 0) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate compliance recommendations
   */
  generateRecommendations(scores) {
    const recommendations = [];

    if (scores.accessControls < 0.8) {
      recommendations.push({
        area: 'Access Controls',
        priority: 'HIGH',
        action: 'Enable multi-factor authentication (MFA) and configure role-based access control (RBAC)',
        estimatedImpact: '+15 points'
      });
    }

    if (scores.encryption < 0.8) {
      recommendations.push({
        area: 'Encryption',
        priority: 'HIGH',
        action: 'Enforce TLS 1.3 and implement key rotation schedule',
        estimatedImpact: '+10 points'
      });
    }

    if (scores.auditLogging < 0.8) {
      recommendations.push({
        area: 'Audit Logging',
        priority: 'CRITICAL',
        action: 'Enable comprehensive audit logging with 6+ year retention',
        estimatedImpact: '+20 points'
      });
    }

    if (scores.training < 0.8) {
      recommendations.push({
        area: 'Training',
        priority: 'MEDIUM',
        action: 'Complete annual HIPAA compliance training for all staff',
        estimatedImpact: '+25 points'
      });
    }

    if (scores.policyEnforcement < 0.8) {
      recommendations.push({
        area: 'Policy Enforcement',
        priority: 'MEDIUM',
        action: 'Document privacy policies and establish incident response procedures',
        estimatedImpact: '+20 points'
      });
    }

    return recommendations;
  }

  /**
   * Determine next review date based on compliance level
   */
  getNextReviewDate(score) {
    const today = new Date();
    if (score >= 90) {
      // Compliant - quarterly review
      const nextReview = new Date(today);
      nextReview.setMonth(nextReview.getMonth() + 3);
      return nextReview.toISOString().split('T')[0];
    }
    if (score >= 70) {
      // Needs attention - monthly review
      const nextReview = new Date(today);
      nextReview.setMonth(nextReview.getMonth() + 1);
      return nextReview.toISOString().split('T')[0];
    }
    // Non-compliant - weekly review
    const nextReview = new Date(today);
    nextReview.setDate(nextReview.getDate() + 7);
    return nextReview.toISOString().split('T')[0];
  }

  /**
   * Calculate months between two dates
   */
  getMonthsDifference(date1, date2) {
    return (
      (date2.getFullYear() - date1.getFullYear()) * 12 +
      (date2.getMonth() - date1.getMonth())
    );
  }

  /**
   * Generate compliance report for audit purposes
   */
  generateReport(orgData) {
    const score = this.calculateComplianceScore(orgData);

    return {
      organizationId: orgData?.id,
      reportDate: new Date().toISOString(),
      complianceScore: score.overallScore,
      status: score.status,
      breakdown: score.breakdown,
      recommendations: score.recommendations,
      nextReviewDate: score.nextReviewDate,
      auditTrail: {
        generatedBy: 'ComplianceEngine',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = new ComplianceEngine();
