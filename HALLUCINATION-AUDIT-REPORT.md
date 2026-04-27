# Noesis.io Health — Hallucination Audit Report

**Date:** April 12, 2026  
**Auditor:** Athena Core Technologies QA  
**Scope:** All UI text, legal documents, documentation

## Methodology

Every user-facing claim verified against actual codebase. Keywords searched: "HIPAA compliant", "HIPAA certified", "AI-powered", "machine learning", "encrypted at rest", "real-time payer", "guaranteed", "prediction", "decision support", cross-app references.

## Findings

### FIXED — Trust Violations (4 items fixed)

1. **JSX Line 1611: Footer "HIPAA Compliant Claims Management"**  
   → Changed to "Healthcare Revenue Management, Simplified"

2. **JSX Line 465: "All PHI is handled in compliance with HIPAA regulations"**  
   → Changed to accurate disclaimer about HIPAA-aligned measures, no certification, no BAA

3. **JSX Line 184: Privacy mock claiming "encrypted at rest"**  
   → Changed to accurately describe TLS in transit and in-memory storage

4. **ToS Line 49: "HIPAA-certified" self-contradiction**  
   → Clarified as "NOT HIPAA-certified" with HIPAA-aligned measures explanation

### FIXED — Additional Hallucinations Found

5. **JSX Line 905: "real-time payer verification"**  
   → Changed to "payer verification workflows [Demo data]"

6. **ToS Line 49: Remaining "HIPAA-certified" lead text**  
   → Changed to "A HIPAA-certified platform" in the "NOT" list

### CLEAN — No Hallucinations Found

- **"AI-powered" / "machine learning"** — All correctly described as rules-based
- **"QuickBooks/Xero/ATTOM/RentCast/FRED/Plaid"** — No cross-app contamination
- **"FHIR/HL7/EDI"** — Correctly marked as planned, not active
- **"guaranteed/prediction"** — Properly qualified with disclaimers
- **"decision support"** — Not used; brand guidelines followed
- **Database persistence claims** — Correctly stated as in-memory throughout

## Score

**6 hallucinations found and fixed. 0 remaining.**

---

(c) 2026 Athena Core Technologies. All rights reserved. CONFIDENTIAL.
