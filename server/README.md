# Noesis.io Health API Server

**Powered by Athena Core Technologies**

© 2026 Athena Core Technologies. All rights reserved.

A production-grade Express.js API server for healthcare claims management, prior authorization, eligibility verification, and payer-provider communication.

## Features

- **JWT Authentication**: Secure token-based authentication on all routes
- **Role-Based Access Control (RBAC)**: Provider Staff, Practice Admin, Insurance Rep
- **Subscription Plans**: Essentials, Professional, Enterprise with feature gating
- **Claims Strategy Engine**: Proprietary server-side scoring system for claim validation
- **Real Integrations**: NPI Registry (CMS), OpenFDA, Stripe Billing
- **HIPAA Compliance**: Audit logging, encryption, compliance scoring
- **Rate Limiting**: Endpoint-specific rate limiting to prevent abuse
- **Zod Validation**: Input validation on all endpoints

## Architecture

```
server/
├── index.js                    # Main Express app
├── package.json               # Dependencies
├── middleware/
│   ├── auth.js               # JWT + RBAC
│   ├── rateLimiter.js        # Endpoint-specific rate limits
│   ├── validate.js           # Zod schema validation
│   └── fileUpload.js         # MIME validation, macro blocking
├── routes/
│   ├── auth.js               # Login, logout, session
│   ├── claims.js             # Claims CRUD + strategy engine
│   ├── authorizations.js     # Prior auth workflows
│   ├── messaging.js          # Secure messaging
│   ├── eligibility.js        # Patient eligibility checks
│   ├── contracts.js          # Payer contracts
│   ├── guardrails.js         # Compliance scoring + validation
│   ├── billing.js            # Stripe webhooks + entitlement
│   └── integrations.js       # NPI, FDA, external APIs
├── services/
│   ├── strategyEngine.js     # Claims scoring (server-side only)
│   ├── npiRegistry.js        # NPI Registry API (REAL)
│   ├── openFDA.js            # OpenFDA API (REAL)
│   ├── stripe.js             # Stripe billing service
│   └── complianceEngine.js   # HIPAA compliance scoring
├── schemas/
│   └── validation.js         # Zod validation schemas
├── config/
│   └── roles.js              # RBAC + plan definitions
├── .env.example              # Environment template
└── README.md                 # This file
```

## Real Integrations

| Provider | Status | API | Key Required |
|----------|--------|-----|-------------|
| NPI Registry (CMS) | ACTIVE | https://npiregistry.cms.hhs.gov/api/ | No |
| OpenFDA | ACTIVE | https://api.fda.gov/ | No |
| Stripe | CONFIGURED | https://api.stripe.com/ | Yes |

## Quick Start

### 1. Setup

```bash
# Clone repository
git clone <repo-url>
cd server

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your values
# - JWT_SECRET: Generate a random 256-bit key
# - STRIPE_* keys from Stripe Dashboard
# - DATABASE_URL: PostgreSQL connection string
# - REDIS_URL: Redis connection string
```

### 2. Run Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:3001`

### 3. Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "service": "Noesis.io Health API",
  "version": "1.0.0",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "environment": "development"
}
```

## Authentication

All routes except `/auth/login`, `/health`, `/billing/plans` require JWT authentication.

### Login

```bash
POST /auth/login
Content-Type: application/json

{
  "email": "provider@clinic.com",
  "password": "Test123456!"
}
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-123",
    "email": "provider@clinic.com",
    "role": "provider_staff",
    "plan": "professional"
  },
  "expiresIn": "1h"
}
```

### Use Token

```bash
curl http://localhost:3001/claims \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

## API Endpoints

### Authentication
- `POST /auth/login` - Login and get JWT token
- `POST /auth/logout` - Logout (client removes token)
- `POST /auth/refresh` - Refresh token before expiry
- `GET /auth/session` - Get current session info

### Claims
- `GET /claims` - List claims (filtered by role)
- `POST /claims` - Submit claim with strategy engine validation
- `GET /claims/:id` - Get claim detail
- `PUT /claims/:id/status` - Update claim status (insurer only)
- `POST /claims/:id/appeal` - Submit claim appeal
- `GET /claims/:id/score` - Get strategy engine score

### Prior Authorizations
- `GET /authorizations` - List authorizations
- `POST /authorizations` - Request prior authorization
- `GET /authorizations/:id` - Get authorization detail
- `PUT /authorizations/:id` - Update authorization
- `POST /authorizations/:id/approve` - Approve auth (insurer only)
- `POST /authorizations/:id/deny` - Deny authorization

### Eligibility
- `POST /eligibility/verify` - Verify patient eligibility
- `GET /eligibility/history/:memberId` - Get eligibility history
- `POST /eligibility/batch` - Batch eligibility verification
- `GET /eligibility/payers` - List connected payers

### Messaging
- `GET /messaging/conversations` - List conversations
- `POST /messaging/conversations` - Create conversation
- `GET /messaging/conversations/:id` - Get conversation with messages
- `POST /messaging/messages` - Send encrypted message
- `PUT /messaging/messages/:id/read` - Mark message as read

### Integrations (REAL APIs)
- `GET /integrations/status` - Show integration status
- `POST /integrations/npi/lookup` - NPI Registry lookup (REAL)
- `POST /integrations/fda/drugs` - FDA drug search (REAL)
- `POST /integrations/fda/devices` - FDA device search (REAL)
- `GET /integrations/proof/:provider` - Prove integration with REAL API call

### Guardrails
- `GET /guardrails/compliance` - Get compliance score (server-side)
- `POST /guardrails/validate-claim` - Validate claim against rules
- `GET /guardrails/rules` - List active validation rules
- `PUT /guardrails/rules/:id` - Toggle rule enabled/disabled
- `POST /guardrails/rules/:id/override` - Override rule score (admin only)
- `DELETE /guardrails/rules/:id/override` - Clear rule override

### Billing
- `GET /billing/subscription` - Get current plan and features
- `GET /billing/invoices` - List invoices
- `POST /billing/webhook` - Stripe webhook endpoint
- `GET /billing/entitlement` - Check feature entitlement
- `GET /billing/plans` - List available plans

### Contracts
- `GET /contracts` - List contracts
- `POST /contracts` - Create contract (Enterprise only)
- `GET /contracts/:id` - Get contract detail
- `PUT /contracts/:id` - Update contract
- `POST /contracts/:id/activate` - Activate contract
- `POST /contracts/:id/terminate` - Terminate contract

## Role-Based Access Control

### Roles

- **Provider Staff**: Clinical staff submitting claims/authorizations
- **Practice Admin**: Practice management and configuration
- **Insurance Rep**: Claims adjudication and authorization approval

### Permissions Matrix

```
Provider Staff:
  - claims: read, create, update
  - authorizations: read, create
  - messaging: read, create
  - eligibility: read, verify
  - guardrails: read

Practice Admin:
  - claims: read, create, update, delete, export
  - authorizations: read, create, update, approve
  - messaging: read, create
  - eligibility: read, verify
  - contracts: read, create, update
  - analytics: read, export
  - guardrails: read, configure
  - security: read, configure

Insurance Rep:
  - claims: read, review, adjudicate
  - authorizations: read, review, approve, deny
  - messaging: read, create
  - eligibility: read
  - contracts: read
  - guardrails: read
```

## Subscription Plans

### Essentials ($29.99/month)
- Claims management
- Eligibility verification
- Secure messaging

### Professional ($99.99/month)
- All Essentials features +
- Prior authorizations
- Analytics
- Guardrails/compliance

### Enterprise (Custom)
- All Professional features +
- Payer contracts
- Advanced security
- White-label options
- API access
- Custom rules

## Security

### Authentication
- JWT tokens with configurable expiry (default 1 hour)
- Token refresh endpoint for seamless UX
- Session validation on every protected route

### Rate Limiting
- Auth: 10 attempts per 15 minutes
- API: 100 requests per minute
- Submissions: 10 per minute

### Input Validation
- Zod schemas on all endpoints
- HTML/script injection prevention
- Medical coding format validation (CPT, ICD-10)

### HIPAA Compliance
- Message encryption (AES-256-GCM)
- Audit logging of all PHI access
- Compliance scoring engine
- 6+ year retention of audit logs

### File Upload
- MIME type whitelist (PDF, PNG, JPG, DOC, DOCX)
- Executable blocking (.exe, .bat, .sh, etc.)
- Macro file blocking (.xlsm, .docm, .pptm, etc.)
- 10MB size limit

## Strategy Engine

The proprietary claims strategy engine evaluates claims against multiple rule packs:

### Standard Claims
- CPT-DX Compatibility (25%)
- Medical Necessity (20%)
- Timely Filing (15%)
- Duplicate Detection (15%)
- Modifier Compliance (10%)
- Bundling/Unbundling (15%)

### Emergency Claims
- Emergency Qualifier (30%)
- Level of Care (25%)
- Out-of-Network Override (20%)
- Documentation Completeness (25%)

### Surgical Claims
- Prior Authorization (30%)
- Global Period Check (25%)
- Assistant Surgeon Rules (20%)
- Bilateral Modifier (25%)

Decision output: `APPROVE_SUBMIT`, `REVIEW_RECOMMENDED`, or `HOLD_FOR_CORRECTION`

## Testing

### Test NPI Integration (REAL)
```bash
curl -X POST http://localhost:3001/integrations/npi/lookup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "npiNumber": "1234567893"
  }'
```

### Test FDA Integration (REAL)
```bash
curl -X POST http://localhost:3001/integrations/fda/drugs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "genericName": "acetaminophen",
    "limit": 5
  }'
```

### Proof Endpoints
```bash
# See actual API calls being made
curl http://localhost:3001/integrations/proof/npi \
  -H "Authorization: Bearer YOUR_TOKEN"

curl http://localhost:3001/integrations/proof/fda \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Production Deployment

### Environment Variables
- Use strong JWT_SECRET (256-bit minimum)
- Store secrets in environment, never in code
- Configure real Stripe keys
- Set `NODE_ENV=production`

### Database
- PostgreSQL for user data, claims, contracts
- Connect via `DATABASE_URL`

### Caching/Sessions
- Redis for session store and rate limiting
- Connect via `REDIS_URL`

### Logging
- Audit all API access
- Log claim submissions and decisions
- Monitor compliance violations

### HTTPS
- Always use TLS in production
- Set security headers with Helmet (already configured)

### Monitoring
- Monitor error rates and response times
- Alert on failed Stripe webhooks
- Track compliance score trends

## License

© 2026 Athena Core Technologies. All rights reserved.

Proprietary software. Unauthorized copying or distribution prohibited.
