# Health EDI

Production-grade ASC X12N 005010 implementations for the four EDI
transactions Noesis exchanges with clearinghouses and payers:

| Set    | Direction         | Purpose                        | Version            |
| ------ | ----------------- | ------------------------------ | ------------------ |
| 837P   | Provider -> Payer | Professional claim submission  | 005010X222A1       |
| 276    | Provider -> Payer | Claim status inquiry           | 005010X212         |
| 277    | Payer -> Provider | Claim status response          | 005010X212         |
| 835    | Payer -> Provider | Electronic remittance advice   | 005010X221A1       |

Eligibility (270/271, 005010X279A1) lives separately in
`server/services/x12.js` (already shipped).

## Module layout

```
healthEdi/
  x12Envelope.js      - low-level ISA/GS/ST envelope writer + parser
  edi837p.js          - 837P (Health Care Claim - Professional) builder + parser
  edi276277.js        - 276 builder + 277 parser (status inquiry/response)
  edi835.js           - 835 (ERA) parser with CARC/CAS adjustments + PLB
  tradingPartner.js   - persistent partner registry + submission ledger
                         (encrypts API secrets w/ PHI_ENCRYPTION_KEY)
  index.js            - public facade (used by routes/healthEdi.js)
  README.md           - this file
```

## Standards referenced

- ASC X12N 005010 (envelope, ISA/GS/ST/SE/GE/IEA segments)
- 005010X222A1 - Health Care Claim: Professional (837P)
- 005010X212  - Health Care Claim Status (276/277)
- 005010X221A1 - Health Care Claim Payment / Advice (835)
- HIPAA Adopted Standards (45 CFR 162.1102/1202/1302/1402/1502/1602)

## Validations enforced

The 837P builder fails fast on:

- Missing or non-10-digit billing provider NPI
- Negative or non-numeric claim totals
- Empty diagnosis array (TR3 requires at least one)
- More than 12 diagnoses per claim (TR3 cap)
- More than 50 service lines per claim (TR3 cap)
- Service line totals not matching claim total within 1 cent
- Missing required identifiers (subscriber memberId / lastName / firstName / dob,
  payer name / payerId, submitter id, receiver id)

## Synthetic data only

All unit tests use synthetic patient names (e.g. "Synthea / Test") and
clearly fake identifiers. No real PHI is ever committed to this repo. For
richer synthetic patient generation use HL7 Synthea
(https://github.com/synthetichealth/synthea).

## Production deployment checklist

This module ships only the X12 builder, parser, and trading-partner
registry. Before submitting live claims the following non-code work is
required:

1. Enroll with a CAQH-certified clearinghouse (Office Ally, Change
   Healthcare, Availity, Waystar) or arrange direct payer EDI access.
2. Complete the payer enrollment matrix per CAQH ProView for each payer
   you will submit to.
3. Execute Business Associate Agreements with each clearinghouse and each
   payer that requires one.
4. Source `PHI_ENCRYPTION_KEY` from AWS Secrets Manager (or equivalent),
   never from a committed `.env` file. See `HIPAA-COMPLIANCE.md`.
5. Configure the trading-partner record's `transport` and credentials
   (REST, SFTP, AS2). Actual transport-layer wiring lives outside this
   module and is partner-specific.
