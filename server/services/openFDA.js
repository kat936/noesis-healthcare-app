/**
 * OpenFDA Integration
 * © 2026 Athena Core Technologies
 *
 * Integrates with the OpenFDA API for drug and device data
 * API: https://api.fda.gov/
 * Status: FREE, no API key required for basic access
 * Rate Limit: 40 requests/minute without API key (1000 req/s with key)
 *
 * This is a REAL integration that makes actual HTTP calls to the FDA API.
 * Data is sourced from official FDA databases.
 */

const https = require('https');

const FDA_BASE_URL = 'https://api.fda.gov/';

/**
 * Search FDA drug database
 * Returns drug labeling information including indications and warnings
 *
 * @param {Object} params - Search parameters
 * @param {string} params.brandName - Drug brand name
 * @param {string} params.genericName - Generic drug name
 * @param {string} params.manufacturer - Manufacturer name
 * @param {number} params.limit - Results limit (default 5, max 100)
 * @returns {Promise<Object>} - FDA drug data
 */
async function searchDrugs(params) {
  let searchTerm = '';

  if (params.brandName) {
    searchTerm = `openfda.brand_name:"${params.brandName}"`;
  } else if (params.genericName) {
    searchTerm = `openfda.generic_name:"${params.genericName}"`;
  } else if (params.manufacturer) {
    searchTerm = `openfda.manufacturer_name:"${params.manufacturer}"`;
  } else {
    return {
      success: false,
      error: 'At least one search parameter required (brandName, genericName, or manufacturer)'
    };
  }

  const limit = Math.min(params.limit || 5, 100);
  const url = `${FDA_BASE_URL}drug/label.json?search=${encodeURIComponent(searchTerm)}&limit=${limit}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              success: true,
              source: 'OPEN_FDA_DRUGS',
              apiUrl: url,
              resultCount: parsed.meta?.results?.total || 0,
              drugs: (parsed.results || []).map((r) => ({
                brandName: r.openfda?.brand_name?.[0],
                genericName: r.openfda?.generic_name?.[0],
                manufacturer: r.openfda?.manufacturer_name?.[0],
                route: r.openfda?.route?.[0],
                productType: r.openfda?.product_type?.[0],
                dosageForm: r.openfda?.dosage_form?.[0],
                strength: r.openfda?.strength?.[0],
                indications: (r.indications_and_usage || [''])[0]?.substring(0, 500),
                warnings: (r.warnings || [''])[0]?.substring(0, 500),
                adverseReactions: (r.adverse_reactions || [''])[0]?.substring(0, 500),
                interactions: (r.drug_interactions || [''])[0]?.substring(0, 500)
              })),
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            reject({
              success: false,
              error: 'Failed to parse FDA drug response',
              details: e.message
            });
          }
        });
      })
      .on('error', (e) => {
        reject({
          success: false,
          error: 'OpenFDA drug API call failed',
          details: e.message
        });
      });
  });
}

/**
 * Search FDA adverse event database
 * Returns device-related adverse events and product problems
 *
 * @param {Object} params - Search parameters
 * @param {string} params.deviceName - Device generic name
 * @param {string} params.deviceClass - Device classification (I, II, III)
 * @param {number} params.limit - Results limit (default 5, max 100)
 * @returns {Promise<Object>} - FDA adverse event data
 */
async function searchDevices(params) {
  let searchTerm = '';

  if (params.deviceName) {
    searchTerm = `device.generic_name:"${params.deviceName}"`;
  } else if (params.deviceClass) {
    searchTerm = `device.device_class:"${params.deviceClass}"`;
  } else {
    return {
      success: false,
      error: 'At least one search parameter required (deviceName or deviceClass)'
    };
  }

  const limit = Math.min(params.limit || 5, 100);
  const url = `${FDA_BASE_URL}device/event.json?search=${encodeURIComponent(searchTerm)}&limit=${limit}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              success: true,
              source: 'OPEN_FDA_DEVICES',
              apiUrl: url,
              resultCount: parsed.meta?.results?.total || 0,
              events: (parsed.results || []).slice(0, limit).map((e) => ({
                eventDate: e.date_received,
                eventType: e.type_of_report,
                deviceName: e.device?.[0]?.generic_name,
                deviceClass: e.device?.[0]?.device_class,
                manufacturer: e.device?.[0]?.manufacturer_name,
                problemDescription: e.adverse_event_flag,
                productProblem: e.product_problem_flag,
                outcomes: e.outcomes
              })),
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            reject({
              success: false,
              error: 'Failed to parse FDA device response',
              details: e.message
            });
          }
        });
      })
      .on('error', (e) => {
        reject({
          success: false,
          error: 'OpenFDA device API call failed',
          details: e.message
        });
      });
  });
}

/**
 * Get OpenFDA integration status
 */
function getStatus() {
  return {
    provider: 'OPEN_FDA',
    status: 'ACTIVE',
    apiUrl: FDA_BASE_URL,
    requiresApiKey: false,
    rateLimit: '40 requests/minute without key, 1000 requests/second with key',
    dataFreshness: 'Updated regularly from FDA database',
    endpoints: ['drug/label.json', 'device/event.json']
  };
}

module.exports = { searchDrugs, searchDevices, getStatus };
