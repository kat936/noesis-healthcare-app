const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Mock storage
const payments = new Map();
const mockPayments = [
  {
    id: uuidv4(),
    eraNumber: 'ERA-2026-032301',
    checkNumber: 'CHK-5847291',
    payerId: 'aetna-001',
    payerName: 'Aetna Insurance',
    receivedDate: '2026-03-23',
    checkDate: '2026-03-20',
    totalAmount: 8500.00,
    providerId: 'prov-001',
    status: 'posted',
    postedDate: '2026-03-24',
    lineItems: [
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001234',
        patientName: 'John Smith',
        serviceDate: '2026-03-15',
        allowedAmount: 500.00,
        payerResponsibility: 350.00,
        adjustments: [
          { code: 'CO-18', description: 'Pre-auth not on file', amount: 50.00 }
        ]
      },
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001235',
        patientName: 'Sarah Martinez',
        serviceDate: '2026-03-14',
        allowedAmount: 450.00,
        payerResponsibility: 350.00,
        adjustments: []
      },
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001236',
        patientName: 'Michael Brown',
        serviceDate: '2026-03-13',
        allowedAmount: 350.00,
        payerResponsibility: 280.00,
        adjustments: []
      }
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: uuidv4(),
    eraNumber: 'ERA-2026-032201',
    checkNumber: 'CHK-5847290',
    payerId: 'bcbs-002',
    payerName: 'BCBS Insurance',
    receivedDate: '2026-03-22',
    checkDate: '2026-03-19',
    totalAmount: 12300.00,
    providerId: 'prov-002',
    status: 'posted',
    postedDate: '2026-03-23',
    lineItems: [
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001240',
        patientName: 'Patricia Davis',
        serviceDate: '2026-03-12',
        allowedAmount: 600.00,
        payerResponsibility: 450.00,
        adjustments: []
      },
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001241',
        patientName: 'Robert Johnson',
        serviceDate: '2026-03-11',
        allowedAmount: 800.00,
        payerResponsibility: 550.00,
        adjustments: []
      }
    ],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: uuidv4(),
    eraNumber: 'ERA-2026-032101',
    checkNumber: 'CHK-5847289',
    payerId: 'united-003',
    payerName: 'United Healthcare',
    receivedDate: '2026-03-21',
    checkDate: '2026-03-18',
    totalAmount: 5600.00,
    providerId: 'prov-001',
    status: 'posted',
    postedDate: '2026-03-22',
    lineItems: [
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001250',
        patientName: 'Jennifer Garcia',
        serviceDate: '2026-03-10',
        allowedAmount: 1200.00,
        payerResponsibility: 900.00,
        adjustments: []
      }
    ],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: uuidv4(),
    eraNumber: 'ERA-2026-032001',
    checkNumber: 'CHK-5847288',
    payerId: 'cigna-004',
    payerName: 'Cigna',
    receivedDate: '2026-03-20',
    checkDate: '2026-03-17',
    totalAmount: 9800.00,
    providerId: 'prov-003',
    status: 'pending',
    postedDate: null,
    lineItems: [
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001260',
        patientName: 'Linda Wilson',
        serviceDate: '2026-03-09',
        allowedAmount: 1400.00,
        payerResponsibility: 900.00,
        adjustments: []
      },
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001261',
        patientName: 'James Anderson',
        serviceDate: '2026-03-08',
        allowedAmount: 800.00,
        payerResponsibility: 600.00,
        adjustments: []
      }
    ],
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: uuidv4(),
    eraNumber: 'ERA-2026-031901',
    checkNumber: 'CHK-5847287',
    payerId: 'humana-005',
    payerName: 'Humana',
    receivedDate: '2026-03-19',
    checkDate: '2026-03-16',
    totalAmount: 7200.00,
    providerId: 'prov-002',
    status: 'exception',
    exception: {
      type: 'underpayment',
      expectedAmount: 8100.00,
      actualAmount: 7200.00,
      difference: 900.00,
      description: 'Patient copay amounts not reflected in payment'
    },
    postedDate: '2026-03-20',
    lineItems: [
      {
        claimId: uuidv4(),
        claimNumber: 'CLM-001270',
        patientName: 'Susan Taylor',
        serviceDate: '2026-03-07',
        allowedAmount: 1000.00,
        payerResponsibility: 750.00,
        adjustments: []
      }
    ],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

// Initialize mock data
mockPayments.forEach(payment => payments.set(payment.id, payment));

// Validation schemas
const postPaymentSchema = z.object({
  notes: z.string().max(1000).optional()
});

const exceptionSchema = z.object({
  exceptionType: z.enum(['underpayment', 'overpayment', 'missing_line_items']),
  amount: z.number().positive(),
  description: z.string().max(2000)
});

/**
 * GET /payments
 * List ERA/remittance records for authenticated provider
 * Shows payment receipt and posting status
 */
router.get('/', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    const { status, payerId, limit = 20, offset = 0 } = req.query;

    let filtered = Array.from(payments.values());

    // Filter by provider
    filtered = filtered.filter((p) => p.providerId === req.user.id || req.user.role === ROLES.PRACTICE_ADMIN);

    // Filter by status
    if (status) {
      filtered = filtered.filter((p) => p.status === status);
    }

    // Filter by payer
    if (payerId) {
      filtered = filtered.filter((p) => p.payerId === payerId);
    }

    // Sort by received date descending
    filtered.sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate));

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      data: paginated,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + parseInt(limit) < total
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to list payments',
      code: 'LIST_ERROR',
      details: err.message
    });
  }
});

/**
 * GET /payments/:id
 * Get detailed ERA/remittance record with line-item breakdown
 * Shows claim-level breakdown, adjustments, and current status
 */
router.get('/:id', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    const payment = payments.get(req.params.id);

    if (!payment) {
      return res.status(404).json({
        error: 'Payment record not found',
        code: 'NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role === ROLES.PROVIDER_STAFF && payment.providerId !== req.user.id) {
      return res.status(403).json({
        error: 'Cannot access this payment',
        code: 'FORBIDDEN'
      });
    }

    // Calculate summary
    const lineItemsCount = payment.lineItems.length;
    const totalAllowed = payment.lineItems.reduce((sum, item) => sum + item.allowedAmount, 0);
    const totalPayment = payment.lineItems.reduce((sum, item) => sum + item.payerResponsibility, 0);

    res.json({
      success: true,
      payment: {
        ...payment,
        summary: {
          lineItemsCount,
          totalAllowed,
          totalPayment,
          daysInAR: payment.status === 'posted' ? 0 : Math.floor((new Date() - new Date(payment.receivedDate)) / (1000 * 60 * 60 * 24))
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve payment',
      code: 'GET_ERROR',
      details: err.message
    });
  }
});

/**
 * POST /payments/:id/post
 * Post payment - apply to patient accounts and claims
 * Marks ERA as reconciled
 */
router.post(
  '/:id/post',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  (req, res) => {
    try {
      const payment = payments.get(req.params.id);

      if (!payment) {
        return res.status(404).json({
          error: 'Payment record not found',
          code: 'NOT_FOUND'
        });
      }

      // Check authorization
      if (req.user.role === ROLES.PROVIDER_STAFF && payment.providerId !== req.user.id) {
        return res.status(403).json({
          error: 'Cannot access this payment',
          code: 'FORBIDDEN'
        });
      }

      // Validate request body
      const validation = postPaymentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid posting data',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      if (payment.status === 'posted') {
        return res.status(400).json({
          error: 'Payment already posted',
          code: 'ALREADY_POSTED'
        });
      }

      // Mark as posted
      payment.status = 'posted';
      payment.postedDate = new Date().toISOString();
      payment.postedBy = req.user.id;
      if (validation.data.notes) {
        payment.postingNotes = validation.data.notes;
      }

      res.json({
        success: true,
        message: 'Payment posted successfully',
        payment
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to post payment',
        code: 'POST_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * POST /payments/:id/exception
 * Flag exception on ERA (underpayment, overpayment, missing line items)
 * Creates issue for follow-up with payer
 */
router.post(
  '/:id/exception',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  (req, res) => {
    try {
      const payment = payments.get(req.params.id);

      if (!payment) {
        return res.status(404).json({
          error: 'Payment record not found',
          code: 'NOT_FOUND'
        });
      }

      // Check authorization
      if (req.user.role === ROLES.PROVIDER_STAFF && payment.providerId !== req.user.id) {
        return res.status(403).json({
          error: 'Cannot access this payment',
          code: 'FORBIDDEN'
        });
      }

      // Validate exception data
      const validation = exceptionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid exception data',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // Create exception record
      const exception = {
        id: uuidv4(),
        type: validation.data.exceptionType,
        amount: validation.data.amount,
        description: validation.data.description,
        reportedDate: new Date().toISOString(),
        reportedBy: req.user.id,
        status: 'open'
      };

      payment.exception = exception;
      payment.status = 'exception';

      res.status(201).json({
        success: true,
        exception,
        payment
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to flag exception',
        code: 'EXCEPTION_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /payments/summary
 * Monthly payment summary statistics
 * Aggregates ERA data for cash flow visibility
 */
router.get('/summary/stats', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    const allPayments = Array.from(payments.values());

    // Filter by provider
    let providerPayments = allPayments;
    if (req.user.role === ROLES.PROVIDER_STAFF) {
      providerPayments = allPayments.filter((p) => p.providerId === req.user.id);
    }

    // Get current month and last 3 months
    const now = new Date();
    const months = [];
    for (let i = 0; i < 4; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: month.getFullYear(),
        month: month.getMonth() + 1
      });
    }

    const monthlyStats = {};
    months.forEach(({ year, month }) => {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      monthlyStats[key] = {
        totalPayments: 0,
        totalAmount: 0,
        eraCount: 0,
        postedCount: 0,
        exceptionCount: 0,
        averagePaymentAmount: 0
      };
    });

    // Aggregate data
    providerPayments.forEach((p) => {
      const date = new Date(p.receivedDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (monthlyStats[key]) {
        monthlyStats[key].totalPayments += 1;
        monthlyStats[key].totalAmount += p.totalAmount;
        monthlyStats[key].eraCount += 1;
        if (p.status === 'posted') monthlyStats[key].postedCount += 1;
        if (p.status === 'exception') monthlyStats[key].exceptionCount += 1;
      }
    });

    // Calculate averages
    Object.values(monthlyStats).forEach((stat) => {
      stat.averagePaymentAmount = stat.eraCount > 0 ? (stat.totalAmount / stat.eraCount).toFixed(2) : 0;
    });

    // Overall summary
    const postedPayments = providerPayments.filter((p) => p.status === 'posted');
    const exceptionPayments = providerPayments.filter((p) => p.status === 'exception');
    const pendingPayments = providerPayments.filter((p) => p.status === 'pending');

    const totalAmount = providerPayments.reduce((sum, p) => sum + p.totalAmount, 0);

    res.json({
      success: true,
      summary: {
        totalERA: providerPayments.length,
        totalAmount,
        postedCount: postedPayments.length,
        exceptionCount: exceptionPayments.length,
        pendingCount: pendingPayments.length,
        averageERA: (totalAmount / providerPayments.length).toFixed(2),
        monthlyTrend: monthlyStats
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve summary',
      code: 'SUMMARY_ERROR',
      details: err.message
    });
  }
});

module.exports = router;
