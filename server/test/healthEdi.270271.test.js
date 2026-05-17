'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const edi270271 = require('../services/healthEdi/edi270271');

test('270/271 module advertises scaffold maturity', () => {
  assert.equal(edi270271.MATURITY, 'scaffold');
  assert.equal(edi270271.VERSION_ID, '005010X279A1');
});

test('build270 throws NOT_IMPLEMENTED so callers fail fast', () => {
  assert.throws(
    () => edi270271.build270({ submitter: { id: 'X' } }),
    (err) => {
      assert.equal(err.code, 'EDI_270271_NOT_IMPLEMENTED');
      assert.equal(err.status, 501);
      assert.match(err.message, /scaffold-only|production wiring/i);
      return true;
    }
  );
});

test('parse271 throws NOT_IMPLEMENTED so callers fail fast', () => {
  assert.throws(
    () => edi270271.parse271('ISA*00*...'),
    (err) => {
      assert.equal(err.code, 'EDI_270271_NOT_IMPLEMENTED');
      assert.equal(err.status, 501);
      return true;
    }
  );
});
