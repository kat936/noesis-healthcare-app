const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Legal document versions (in production: database)
const LEGAL_VERSIONS = {
  terms_of_service: { version: '1.0', effectiveDate: '2026-04-12', path: '/legal/terms' },
  privacy_policy: { version: '1.0', effectiveDate: '2026-04-12', path: '/legal/privacy' },
  healthcare_disclaimer: { version: '1.0', effectiveDate: '2026-04-12', path: '/legal/disclaimer' },
  billing_terms: { version: '1.0', effectiveDate: '2026-04-12', path: '/legal/billing' },
  upload_consent: { version: '1.0', effectiveDate: '2026-04-12', path: '/legal/upload-consent' }
};

// In-memory consent store (in production: database table with userId, timestamp, etc.)
const consentRecords = [];

// Simple validation middleware
const validateConsent = (req, res, next) => {
  const { documentType, accepted, context } = req.body;

  if (!documentType) return res.status(400).json({ error: 'documentType is required' });
  if (typeof accepted !== 'boolean') return res.status(400).json({ error: 'accepted must be boolean' });
  if (!LEGAL_VERSIONS[documentType]) return res.status(400).json({ error: 'Invalid documentType' });
  if (!context || !['signup', 'checkout', 'onboarding', 'upload', 'settings'].includes(context)) {
    return res.status(400).json({ error: 'Invalid context' });
  }

  next();
};

// Mock auth middleware for demo
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // In production: verify JWT token
  // For demo: extract user info from token
  req.user = {
    id: 'user_' + token.substring(0, 8),
    email: 'demo@provider.com'
  };
  next();
};

// POST /api/v1/legal/consent - Record consent acceptance
router.post('/consent', authenticate, validateConsent, (req, res) => {
  const record = {
    id: uuidv4(),
    userId: req.user.id,
    userEmail: req.user.email,
    documentType: req.body.documentType,
    documentVersion: LEGAL_VERSIONS[req.body.documentType].version,
    accepted: req.body.accepted,
    context: req.body.context,
    timestamp: new Date().toISOString(),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'] || 'unknown',
  };

  consentRecords.push(record);

  res.status(201).json({
    success: true,
    consentId: record.id,
    recorded: record.timestamp
  });
});

// GET /api/v1/legal/consent/history - Get user's consent history
router.get('/consent/history', authenticate, (req, res) => {
  const userConsents = consentRecords.filter(r => r.userId === req.user.id);
  res.json({
    consents: userConsents,
    currentVersions: LEGAL_VERSIONS,
    total: userConsents.length
  });
});

// GET /api/v1/legal/consent/status - Check if user has accepted all required documents
router.get('/consent/status', authenticate, (req, res) => {
  const userConsents = consentRecords.filter(r => r.userId === req.user.id && r.accepted);
  const required = ['terms_of_service', 'privacy_policy', 'healthcare_disclaimer'];

  const status = {};
  for (const doc of required) {
    const consent = userConsents.find(
      c => c.documentType === doc && c.documentVersion === LEGAL_VERSIONS[doc].version
    );
    status[doc] = {
      accepted: !!consent,
      version: LEGAL_VERSIONS[doc].version,
      acceptedAt: consent?.timestamp || null
    };
  }

  const allAccepted = required.every(doc => status[doc].accepted);

  res.json({
    allRequiredAccepted: allAccepted,
    documents: status,
    requiredDocuments: required
  });
});

// GET /api/v1/legal/versions - Get current legal document versions
router.get('/versions', (req, res) => {
  res.json({
    versions: LEGAL_VERSIONS,
    lastUpdated: '2026-04-12'
  });
});

// GET /api/v1/legal/documents/:type - Serve legal document content (public)
router.get('/documents/:type', (req, res) => {
  const docInfo = LEGAL_VERSIONS[req.params.type];
  if (!docInfo) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // In production: fetch from database or CMS
  const documentContent = {
    terms_of_service: `TERMS OF SERVICE

Last Updated: April 12, 2026

1. ACCEPTANCE OF TERMS
By accessing and using Noesis.io Health, you agree to be bound by these Terms of Service.

2. USE LICENSE
Permission is granted to temporarily download one copy of the materials for personal, non-commercial transitory viewing only.

3. DISCLAIMER OF WARRANTIES
The materials on Noesis.io Health are provided on an 'as is' basis. Athena Core Technologies makes no warranties, expressed or implied.

4. LIMITATIONS OF LIABILITY
In no event shall Athena Core Technologies or its suppliers be liable for any damages arising out of the use or inability to use the materials.

5. MODIFICATIONS
Athena Core Technologies may revise these terms of service at any time without notice.

6. TERMINATION
These Terms of Service are effective unless and until terminated by either you or Athena Core Technologies.`,

    privacy_policy: `PRIVACY POLICY

Last Updated: April 12, 2026

1. INFORMATION WE COLLECT
We collect information you provide directly, such as when you create an account, submit claims, or contact customer support.

2. HOW WE USE YOUR INFORMATION
We use the information we collect to provide, maintain, and improve our services, process claims, and communicate with you.

3. INFORMATION SHARING
We do not sell your personal information. We may share information with service providers who assist us in operating our website and conducting our business.

4. DATA SECURITY
We implement appropriate technical and organizational measures to protect your personal information against unauthorized access.

5. YOUR RIGHTS
You have the right to access, correct, or delete your personal information by contacting us.

6. CONTACT US
If you have questions about this Privacy Policy, please contact privacy@athena-core.com.`,

    healthcare_disclaimer: `HEALTHCARE DISCLAIMER

Last Updated: April 12, 2026

1. NOT MEDICAL ADVICE
Noesis.io Health is a claims management and healthcare administration platform. It does not provide medical advice and should not be used as a substitute for professional medical judgment.

2. SCOPE OF SERVICE
This platform is designed for healthcare providers, insurers, and authorized representatives to manage claims, verify eligibility, and coordinate prior authorizations.

3. REGULATORY COMPLIANCE
Users must comply with all applicable healthcare regulations including HIPAA, state insurance laws, and other relevant regulations.

4. DATA INTEGRITY
While we employ industry-standard security measures, no system is completely secure. Users are responsible for maintaining confidentiality of their credentials.

5. NO WARRANTY
Services are provided "as is" without warranty of any kind. We do not guarantee accuracy, completeness, or timeliness of information.

6. LIABILITY LIMITATION
Athena Core Technologies shall not be liable for any indirect, incidental, special, or consequential damages arising from use of this service.`,

    billing_terms: `BILLING TERMS

Last Updated: April 12, 2026

1. PAYMENT TERMS
Users agree to pay all fees associated with their selected subscription plan. Fees are billed monthly in advance.

2. BILLING CYCLE
Billing cycles begin on the date the subscription is activated and continue monthly thereafter.

3. PAYMENT METHODS
We accept major credit cards and ACH transfers. Payment information is processed securely through our payment processor.

4. REFUNDS
Refunds are issued only in accordance with our refund policy. Refund requests must be made within 30 days of purchase.

5. PRICE CHANGES
We reserve the right to change subscription prices with 30 days notice. Changes take effect at the next billing cycle.

6. CANCELLATION
Users may cancel their subscription at any time. No refunds are issued for partial months.`,

    upload_consent: `UPLOAD CONSENT FORM

I acknowledge and consent to the following regarding file uploads:

1. UNDERSTANDING OF USE
I understand that I am uploading materials to Noesis.io Health for claim processing and healthcare administration purposes.

2. AUTHORIZATION
I certify that I am authorized to upload these materials and that they contain accurate information.

3. CONFIDENTIALITY
I understand that uploaded materials may contain protected health information (PHI) and I agree to maintain its confidentiality.

4. COMPLIANCE
I certify that the uploaded materials comply with all applicable laws and regulations, including HIPAA.

5. LIABILITY
I understand that I am responsible for the accuracy and lawfulness of all uploaded materials.`
  };

  res.json({
    ...docInfo,
    type: req.params.type,
    content: documentContent[req.params.type] || 'Document content not available'
  });
});

module.exports = router;
