'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const env = require('../services/healthEdi/x12Envelope');

test('writeISA produces 106-byte segment with terminators at standard positions', () => {
  const seg = env.writeISA({
    senderId:      'NOESISTEST     ',
    receiverId:    'CLEARINGHOUSE  ',
    controlNumber: '000000123',
    date:          new Date('2026-05-06T13:30:00Z'),
  });
  // Element separator at position 3
  assert.equal(seg.charAt(3), '*');
  // Repetition separator at position 82 (per ASC X12N 005010)
  assert.equal(seg.charAt(82), '^');
  // Component separator at position 104, segment terminator at 105
  assert.equal(seg.charAt(104), ':');
  assert.equal(seg.charAt(105), '~');
  // Should start with 'ISA*'
  assert.ok(seg.startsWith('ISA*'));
  // Control number padded to 9 digits
  assert.match(seg, /\*000000123\*/);
});

test('writeGS chooses functional id by transaction set', () => {
  const seg = env.writeGS({
    transactionSet: '837',
    senderId:       'SENDER',
    receiverId:     'RECEIVER',
    controlNumber:  '1',
    versionId:      '005010X222A1',
    date:           new Date('2026-05-06T13:30:00Z'),
  });
  // GS01 = 'HC' for 837 (Health Care Claim)
  assert.match(seg, /^GS\*HC\*/);
  assert.match(seg, /\*005010X222A1~$/);
});

test('writeGS rejects unknown transaction sets explicitly', () => {
  assert.throws(() => env.writeGS({
    transactionSet: '999',
    senderId: 'A', receiverId: 'B', controlNumber: '1', versionId: '005010',
  }), /unknown transaction set/);
});

test('buildEnvelope wraps body and computes SE count correctly', () => {
  const body = [
    env.writeSegment(['BHT', '0019', '00', 'BHT-1', '20260506', '1330', '00']),
    env.writeSegment(['NM1', '85', '2', 'TEST CLINIC', '', '', '', '', 'XX', '1234567890']),
    env.writeSegment(['NM1', 'PR', '2', 'AETNA', '', '', '', '', 'PI', '60054']),
  ];
  const result = env.buildEnvelope({
    interchange: {
      senderId:      'NOESISTEST',
      receiverId:    'CLEARINGHOUSE',
      controlNumber: '000000123',
      usageIndicator: 'T',
    },
    functionalGroup: {
      transactionSet: '837',
      versionId:      '005010X222A1',
      controlNumber:  '1',
    },
    transaction: {
      transactionSet: '837',
      versionId:      '005010X222A1',
      controlNumber:  '0001',
    },
    body,
  });

  // SE segment count includes ST and SE themselves: body(3) + ST + SE = 5
  assert.match(result.edi, /SE\*5\*0001~/);
  // Envelope wraps in correct order (segments separated by '~')
  assert.match(result.edi, /^ISA\*/);
  assert.match(result.edi, /~GS\*HC\*/);
  assert.match(result.edi, /~ST\*837\*/);
  assert.ok(result.edi.endsWith('~'));
  // GE/IEA terminators present
  assert.match(result.edi, /GE\*1\*/);
  assert.match(result.edi, /IEA\*1\*/);
});

test('sniffDelimiters reads delimiters from ISA positions', () => {
  const isa = 'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260506*1330*^*00501*000000123*0*T*:~';
  const d = env.sniffDelimiters(isa + 'GS*HC*S*R*20260506*1330*1*X*005010X222A1~');
  assert.equal(d.elementSeparator, '*');
  assert.equal(d.repetitionSeparator, '^');
  assert.equal(d.componentSeparator, ':');
  assert.equal(d.segmentTerminator, '~');
});

test('parseSegments splits and trims preserving element positions', () => {
  const edi = 'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260506*1330*^*00501*000000123*0*T*:~' +
              'GS*HC*S*R*20260506*1330*1*X*005010X222A1~' +
              'ST*837*0001*005010X222A1~' +
              'NM1*85*2*TEST CLINIC*****XX*1234567890~' +
              'SE*2*0001~GE*1*1~IEA*1*000000123~';
  const { segments } = env.parseSegments(edi);
  const isa = segments[0];
  assert.equal(isa[0], 'ISA');
  assert.equal(isa[6].trim(), 'SENDER');
  const nm1 = segments.find((s) => s[0] === 'NM1');
  assert.equal(nm1[1], '85');
  assert.equal(nm1[3], 'TEST CLINIC');
  // Empty interior elements preserved
  assert.equal(nm1[4], '');
});

test('writeSegment strips trailing empty elements but preserves interior empties', () => {
  const seg = env.writeSegment(['DTP', '291', '', 'D8', '20260506', '', '']);
  assert.equal(seg, 'DTP*291**D8*20260506~');
});

test('groupTransactions returns one transaction per ST/SE pair', () => {
  const edi = 'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260506*1330*^*00501*000000123*0*T*:~' +
              'GS*HC*S*R*20260506*1330*1*X*005010X222A1~' +
              'ST*837*0001*005010X222A1~' + 'BHT*0019*00*X*20260506*1330*00~' + 'SE*2*0001~' +
              'GE*1*1~IEA*1*000000123~';
  const { segments } = env.parseSegments(edi);
  const grouped = env.groupTransactions(segments);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].groups.length, 1);
  assert.equal(grouped[0].groups[0].transactions.length, 1);
});
