import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  LayoutDashboard, FileText, CheckSquare, MessageSquare, Shield, FileCheck, BarChart3, Bell,
  Search, User, ChevronDown, Menu, X, ArrowUpRight, ArrowDownRight, Zap, Clock, TrendingUp,
  AlertCircle, CheckCircle, Clock3, XCircle, Plus, Filter, ChevronRight, Send, Paperclip,
  Calendar, Building2, DollarSign, Users, Activity, Moon, Sun, Settings, LogOut, Eye,
  Download, MoreVertical, ChevronLeft, Flag, MapPin, Phone, Mail, Briefcase, Lock, EyeOff,
  Plug, AlertTriangle, Info, Loader, ScrollText, ExternalLink, Check, Banknote, TrendingDown,
  Fingerprint, KeyRound, ShieldCheck, FileWarning, Siren, GraduationCap, Database, Wifi, Server,
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

// ============ API LAYER ============
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';

async function apiFetch(path, token, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) { headers['Authorization'] = `Bearer ${token}`; }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });

  // Broadcast remaining session time from backend header
  const remaining = res.headers.get('X-Session-Remaining');
  if (remaining) {
    window.dispatchEvent(new CustomEvent('noesis-session', { detail: { remaining: parseInt(remaining, 10) } }));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Session expired by inactivity — broadcast so App can handle
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('noesis-session', { detail: { remaining: 0, expired: true } }));
    }
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

const api = {
  login: async (email, password) => {
    const data = await apiFetch('/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return { token: data.token, user: data.user, expiresIn: 3600 };
  },

  getClaims: async (token, { status, limit = 50, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit, offset });
    if (status) { params.set('status', status); }
    const data = await apiFetch(`/claims?${params}`, token);
    return data.data || [];
  },

  getDenials: async (token) => {
    const data = await apiFetch('/denials', token);
    return data.data || data || [];
  },

  getERA: async (token) => {
    const data = await apiFetch('/billing/era', token);
    return data.data || data || [];
  },

  getAging: async (token) => {
    const data = await apiFetch('/billing/aging', token);
    return data.data || data || {};
  },

  getScrubbing: async (token) => {
    const data = await apiFetch('/scrubbing', token);
    return data.data || data || {};
  },

  scoreClaim: async (token, claimId) => {
    const data = await apiFetch(`/claims/${claimId}/score`, token);
    return data.score || data;
  },

  lookupNPI: async (token, npi) => {
    const data = await apiFetch(`/integrations/npi/${npi}`, token);
    return data;
  },

  getEligibility: async (token, memberId, planId) => {
    const data = await apiFetch('/eligibility/check', token, {
      method: 'POST',
      body: JSON.stringify({ memberId, planId }),
    });
    return data;
  },

  submitMessage: async (token, message) => {
    const data = await apiFetch('/messaging', token, {
      method: 'POST',
      body: JSON.stringify(message),
    });
    return data;
  },

  getAnalytics: async (token) => {
    const data = await apiFetch('/billing/analytics', token);
    return data.data || data;
  },

  getLegalDocument: async (key) => {
    const data = await apiFetch(`/legal/${key}`, null);
    return data.content || data;
  },

  createCheckoutSession: async (token, plan, interval = 'monthly') => {
    const data = await apiFetch('/billing/checkout', token, {
      method: 'POST',
      body: JSON.stringify({
        plan,
        interval,
        successUrl: window.location.href.split('?')[0] + '?checkout=success',
        cancelUrl:  window.location.href.split('?')[0],
      }),
    });
    return data;
  },

  refreshSession: async (token) => {
    const data = await apiFetch('/auth/refresh', token, { method: 'POST' });
    return data;
  },
};

// ============ VALIDATION & SECURITY ============
const validateInput = (value, type) => {
  const patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    npi: /^\d{10}$/,
    phone: /^\d{3}-\d{3}-\d{4}$/,
  };
  const pattern = patterns[type];
  return pattern ? pattern.test(value) : true;
};

const sanitizeInput = (input) => {
  if (!input) return '';
  return String(input).replace(/[<>\"'&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' }[c])).slice(0, 500);
};

const maskPHI = (value, isMasked, type = 'name') => {
  if (!isMasked) return value;
  if (type === 'name') return '****';
  if (type === 'dob') return '**/**/**';
  if (type === 'ssn') return '***-**-****';
  return '****';
};

// ============ CONSTANTS ============
const COLORS = { teal: '#06B6D4', cyan: '#0EA5E9', purple: '#8B5CF6', green: '#10B981', amber: '#F59E0B', red: '#EF4444', orange: '#F97316' };
const statusColorMap = {
  'Submitted': { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  'In Review': { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  'Approved': { bg: 'bg-green-500/20', text: 'text-green-300' },
  'Denied': { bg: 'bg-red-500/20', text: 'text-red-300' },
  'Paid': { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  'New': { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  'Appealing': { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  'Won': { bg: 'bg-green-500/20', text: 'text-green-300' },
  'Lost': { bg: 'bg-red-500/20', text: 'text-red-300' },
  'Resubmitted': { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  'Posted': { bg: 'bg-green-500/20', text: 'text-green-300' },
  'Pending': { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  'Exception': { bg: 'bg-red-500/20', text: 'text-red-300' },
};

const PLAN_FEATURES = {
  solo: {
    displayName: 'Solo',
    price: '$299/mo',
    includedClaims: 500,
    overageRate: '$0.45',
    includedProviders: 3,
    trial: '14-day free trial',
    features: [
      'Claims Management (500 claims/mo)',
      'Eligibility Verification (live payer check)',
      'Secure HIPAA Messaging',
      'Claims Scrubbing',
      'ERA / Payment Posting',
      'Dashboard & Basic Analytics',
      'NPI & FDA Data Integrations',
      'Audit Trail (6yr retention)',
      'Up to 3 provider accounts',
    ],
    locked: ['Prior Authorization', 'A/R Aging', 'Guardrails', 'Contracts', 'Security Center', 'Growth Engine'],
  },
  group: {
    displayName: 'Group Practice',
    price: '$799/mo',
    includedClaims: 2000,
    overageRate: '$0.30',
    includedProviders: 20,
    trial: '14-day free trial',
    popular: true,
    features: [
      'Everything in Solo',
      'Claims Management (2,000 claims/mo)',
      'Prior Authorization workflows',
      'A/R Aging & Denial Analytics',
      'Guardrails pre-submission checks',
      'Batch Eligibility (up to 50 patients)',
      'Advanced Analytics & Reporting',
      'Up to 20 provider accounts',
      'EDI 837P/835 clearinghouse (configurable)',
      'EHR FHIR R4 connector (configurable)',
    ],
    locked: ['Contracts', 'Security Center', 'Growth Engine'],
  },
  enterprise: {
    displayName: 'Enterprise',
    price: 'Custom',
    includedClaims: 'Unlimited',
    overageRate: 'Negotiated',
    includedProviders: 'Unlimited',
    trial: null,
    features: [
      'Everything in Group Practice',
      'Unlimited claims & providers',
      'Adjudication & Fraud Detection',
      'Network Management & Credentialing',
      'Contracts Management',
      'Security Center (HIPAA dashboard)',
      'Growth Engine',
      'Full API access',
      'HEDIS Quality Metrics',
      'Dedicated onboarding & BAA',
      'SLA & uptime guarantee',
    ],
    locked: [],
  },
};

const INTEGRATIONS = [
  { name: 'NPI Registry', provider: 'CMS / NPPES', status: 'ACTIVE', lastVerified: '2026-04-12', affectsOutput: true },
  { name: 'OpenFDA Drug Database', provider: 'U.S. FDA', status: 'ACTIVE', lastVerified: '2026-04-12', affectsOutput: true },
  { name: 'Stripe Billing', provider: 'Stripe Inc.', status: 'CONFIGURED', lastVerified: '2026-04-10', affectsOutput: true },
  { name: 'EDI 837P/835 Clearinghouse', provider: 'Configurable (Office Ally / Availity)', status: 'READY', lastVerified: null, affectsOutput: false },
  { name: 'Payer Eligibility 270/271', provider: 'Availity (2,800+ payers)', status: 'READY', lastVerified: null, affectsOutput: false },
  { name: 'HL7 FHIR R4 EHR Connector', provider: 'Epic / Athenahealth / Cerner', status: 'READY', lastVerified: null, affectsOutput: false },
];

// ============ SHARED COMPONENTS ============
const KPICard = ({ icon: Icon, label, value, trend, color = 'teal', subtext = null }) => (
  <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 hover:bg-slate-800/70 transition-all">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-slate-400 text-sm font-medium mb-2">{label}</p>
        <p className="text-3xl font-bold text-white">{value}</p>
        {trend && <div className="flex items-center gap-1 mt-2 text-sm text-green-400"><ArrowUpRight size={14} /><span>{trend}</span></div>}
        {subtext && <p className="text-xs text-slate-500 mt-2">{subtext}</p>}
      </div>
      <Icon className="text-slate-400" size={32} />
    </div>
  </div>
);

const Badge = ({ status, size = 'md' }) => {
  const colors = statusColorMap[status] || { bg: 'bg-slate-500/20', text: 'text-slate-300' };
  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-xs';
  return <span className={`rounded-full font-semibold ${colors.bg} ${colors.text} ${sizeClass}`}>{status}</span>;
};

const DataTable = ({ columns, data, onRowClick }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-slate-800/50">
        <tr className="border-b border-slate-700/50">
          {columns.map((col) => <th key={col} className="px-4 py-3 text-left text-slate-400 font-semibold">{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map((row, idx) => (
          <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors" onClick={() => onRowClick?.(row)}>
            {Object.values(row).map((val, i) => <td key={i} className="px-4 py-3 text-slate-300">{typeof val === 'object' ? JSON.stringify(val) : val}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Modal = ({ isOpen, onClose, title, children, footer = null }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl max-h-96 overflow-hidden flex flex-col w-full">
        <div className="bg-slate-700/50 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="bg-slate-700/30 border-t border-slate-700 px-6 py-4 flex gap-3 justify-end">{footer}</div>}
      </div>
    </div>
  );
};

const LockedModule = ({ moduleName, requiredPlan }) => (
  <div className="flex flex-col items-center justify-center h-96 bg-slate-800/30 border border-slate-700/50 rounded-lg">
    <Lock size={48} className="text-slate-400 mb-4" />
    <p className="text-slate-300 text-lg font-semibold">{moduleName}</p>
    <p className="text-slate-400 mt-2 text-sm">Upgrade to {requiredPlan} to unlock</p>
  </div>
);

// ============ LEGAL COMPONENTS ============
const LegalDocumentModal = ({ document, onClose }) => {
  if (!document) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-3xl max-h-96 overflow-hidden flex flex-col w-full">
        <div className="bg-slate-700/50 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><FileText size={24} /> {document.title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">{document.content}</p>
        </div>
        <div className="bg-slate-700/30 border-t border-slate-700 px-6 py-4">
          <button onClick={onClose} className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};

const ConsentGate = ({ onConsentsComplete, token, email }) => {
  const [consents, setConsents] = useState({
    terms: false,
    privacy: false,
    hipaa: false,
    disclaimer: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);

  const handleConsentChange = (key) => {
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allRequired = Object.values(consents).every(v => v === true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allRequired) {
      setError('You must accept all terms to continue');
      return;
    }
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1000));
      onConsentsComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const docs = [
    { key: 'terms', label: 'Terms of Service', title: 'Terms of Service' },
    { key: 'privacy', label: 'Privacy Policy', title: 'Privacy Policy' },
    { key: 'hipaa', label: 'HIPAA & Data Security', title: 'HIPAA & Data Security' },
    { key: 'disclaimer', label: 'Medical Claims Disclaimer', title: 'Medical Claims Disclaimer' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-8 backdrop-blur">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield size={32} className="text-teal-400" />
            <h1 className="text-3xl font-bold text-teal-400">Noesis.io</h1>
          </div>
          <h2 className="text-2xl font-bold text-white text-center mb-2">Legal Consents Required</h2>
          <p className="text-slate-400 text-center text-sm mb-6">Please review and accept the following to continue:</p>

          {error && <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            {docs.map(doc => (
              <div key={doc.key} className="flex items-start gap-3 p-4 bg-slate-700/30 rounded-lg border border-slate-700/50">
                <input type="checkbox" id={doc.key} checked={consents[doc.key]} onChange={() => handleConsentChange(doc.key)} className="w-5 h-5 mt-1 accent-teal-400" />
                <div className="flex-1">
                  <label htmlFor={doc.key} className="text-sm font-semibold text-white cursor-pointer">{doc.label}</label>
                  <button type="button" onClick={() => setSelectedDocument(doc)} className="text-xs text-teal-400 hover:underline mt-1">View Document</button>
                </div>
              </div>
            ))}
            <button type="submit" disabled={loading || !allRequired} className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white font-bold py-3 rounded-lg transition-colors mt-6">
              {loading ? 'Processing...' : 'Accept & Continue'}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center">Logged in as: {email}</p>
        </div>
      </div>

      {selectedDocument && (
        <LegalDocumentModal
          document={{
            title: selectedDocument.title,
            content: `[Sample Data - ${selectedDocument.title}]\n\nThis is a placeholder for the full ${selectedDocument.title.toLowerCase()}. In production, this would contain the complete legal text.`,
          }}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </div>
  );
};

const LegalSection = () => {
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(null);

  const legalDocs = [
    { key: 'terms', label: 'Terms of Service' },
    { key: 'privacy', label: 'Privacy Policy' },
    { key: 'disclaimer', label: 'Medical Claims Disclaimer' },
    { key: 'billing', label: 'Billing Terms' },
  ];

  const handleViewDocument = async (key) => {
    setLoadingDoc(key);
    try {
      const doc = await api.getLegalDocument(key);
      setSelectedDocument({ title: legalDocs.find(d => d.key === key)?.label, content: doc });
    } catch (err) {
      alert('Error loading document');
    } finally {
      setLoadingDoc(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {legalDocs.map(doc => (
          <button key={doc.key} onClick={() => handleViewDocument(doc.key)} disabled={loadingDoc === doc.key} className="bg-slate-800/50 border border-slate-700/50 hover:border-teal-500/50 p-6 rounded-lg text-left transition-all group disabled:opacity-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white group-hover:text-teal-400 transition-colors">{doc.label}</h3>
                <p className="text-slate-400 text-sm mt-1">Click to view full document</p>
              </div>
              {loadingDoc === doc.key ? <Loader size={20} className="text-teal-400 animate-spin" /> : <ExternalLink size={20} className="text-slate-400 group-hover:text-teal-400 transition-colors" />}
            </div>
          </button>
        ))}
      </div>

      {selectedDocument && (
        <LegalDocumentModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />
      )}

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Info size={20} /> Important Notice</h3>
        <p className="text-slate-300 text-sm">Noesis.io Health is provided for healthcare billing and claims management. This platform implements HIPAA-aligned security measures including role-based access controls, session management, PHI masking, and audit logging. Noesis.io Health is not HIPAA-certified and no Business Associate Agreement is currently in place. Users are responsible for their own HIPAA compliance obligations and applicable state and federal laws.</p>
      </div>
    </div>
  );
};

// ============ LOGIN SCREEN ============
const LoginScreen = ({ onLogin, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEmailError('');
    if (!validateInput(email, 'email')) {
      setEmailError('Invalid email format');
      return;
    }
    setLoading(true);
    try {
      const result = await api.login(email, password);
      onLogin(result);
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-8 backdrop-blur">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Shield size={40} className="text-teal-400" />
            <h1 className="text-4xl font-bold text-teal-400">Noesis.io</h1>
          </div>
          <h2 className="text-2xl font-bold text-white text-center mb-2">Healthcare Platform</h2>
          <p className="text-slate-400 text-center text-sm mb-8">By Athena Core Technologies</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-white mb-2">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="provider@example.com" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors" />
              {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-white mb-2">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white font-bold py-3 rounded-lg transition-colors mt-6">
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <p className="text-slate-400 text-xs text-center mt-6">Demo: Use any email and password (8+ chars)</p>
        </div>
      </div>
    </div>
  );
};

// ============ DASHBOARD MODULE ============
const DashboardModule = ({ token, userRole, isMasked }) => {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [claimsData, analyticsData] = await Promise.all([api.getClaims(token), api.getAnalytics(token)]);
        setClaims(claimsData);
        setAnalytics(analyticsData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading dashboard...</div>;

  const approved = claims.filter(c => c.status === 'Approved').length;
  const pending = claims.filter(c => c.status === 'In Review' || c.status === 'Submitted').length;
  const denied = claims.filter(c => c.status === 'Denied').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={CheckCircle} label="Approved" value={approved} trend="+12%" />
        <KPICard icon={Clock} label="Pending" value={pending} trend="−5%" />
        <KPICard icon={XCircle} label="Denied" value={denied} trend="+2%" />
        <KPICard icon={TrendingUp} label="Approval Rate" value={analytics?.approvalRate + '%'} trend="Stable" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Claims Trend (Sample Data)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={analytics?.denialTrends || []}>
              <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#06B6D4" stopOpacity={0.4} /><stop offset="100%" stopColor="#06B6D4" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
              <Area type="monotone" dataKey="approvals" stroke="#06B6D4" fill="url(#grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Claims (Sample Data)</h3>
          <div className="space-y-2">
            {claims.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="text-sm">
                  <p className="text-white font-semibold">{c.id}</p>
                  <p className="text-slate-400 text-xs">{c.patient}</p>
                </div>
                <Badge status={c.status} size="sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ CLAIMS MODULE ============
const ClaimsModule = ({ token, userRole, isMasked }) => {
  const [claims, setClaims] = useState([]);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [scoring, setScoring] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getClaims(token);
        setClaims(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const handleScoreClaim = async (claimId) => {
    try {
      setScoring(claimId);
      const result = await api.scoreClaim(token, claimId);
      alert(`Score: ${result.score} - ${result.decision}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setScoring(null);
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400">Loading claims...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-4">
        <button className="px-4 py-2 bg-teal-500/20 text-teal-300 rounded-lg text-sm font-semibold hover:bg-teal-500/30 transition-colors">All</button>
        <button className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-700/70 transition-colors">Submitted</button>
        <button className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-700/70 transition-colors">Approved</button>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
        <DataTable columns={['ID', 'Patient', 'Provider', 'Amount', 'Status', 'Days']} data={claims.map(c => ({ ID: c.id, Patient: maskPHI(c.patient, isMasked), Provider: c.provider, Amount: '$' + c.amount, Status: c.status, Days: c.days }))} onRowClick={(row) => { const c = claims.find(x => x.id === row.ID); if (c) setSelectedClaim(c); }} />
      </div>

      {selectedClaim && (
        <Modal isOpen={!!selectedClaim} onClose={() => setSelectedClaim(null)} title={`Claim ${selectedClaim.id}`}
          footer={
            <>
              <button onClick={() => setSelectedClaim(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Close</button>
              <button onClick={() => handleScoreClaim(selectedClaim.id)} disabled={scoring === selectedClaim.id} className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white rounded-lg font-semibold transition-colors">{scoring === selectedClaim.id ? 'Scoring...' : 'Score Claim'}</button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Claim ID:</span><span className="text-white">{selectedClaim.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Patient:</span><span className="text-white">{maskPHI(selectedClaim.patient, isMasked)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Provider:</span><span className="text-white">{selectedClaim.provider}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Payer:</span><span className="text-white">{selectedClaim.payer}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Amount:</span><span className="text-white">${selectedClaim.amount}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">CPT Code:</span><span className="text-white">{selectedClaim.cptCode}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">ICD-10:</span><span className="text-white">{selectedClaim.icd10}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Service Date:</span><span className="text-white">{selectedClaim.serviceDate}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status:</span><Badge status={selectedClaim.status} size="sm" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============ DENIALS MODULE ============
const DenialsModule = ({ token, userRole, isMasked }) => {
  const [denials, setDenials] = useState([]);
  const [selectedDenial, setSelectedDenial] = useState(null);
  const [denialStats, setDenialStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getDenials(token);
        setDenials(data);
        setDenialStats({
          rate: 8.2,
          totalDenied: 287400,
          pendingAppeals: 23,
          avgTurnaround: 14,
          reasonBreakdown: [
            { reason: 'Missing Info', code: 'CO-16', count: 28 },
            { reason: 'Not Medically Necessary', code: 'PR-1', count: 22 },
            { reason: 'Prior Auth Required', code: 'PR-2', count: 18 },
            { reason: 'Timely Filing', code: 'CO-29', count: 12 },
            { reason: 'Duplicate Claim', code: 'CO-18', count: 10 },
            { reason: 'Other', code: 'OTHER', count: 10 },
          ]
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading denials...</div>;

  const filteredDenials = filter === 'all' ? denials : denials.filter(d => d.denialCode.startsWith(filter.split('-')[0]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={TrendingDown} label="Denial Rate" value={denialStats?.rate.toFixed(1) + '%'} subtext="Current month" />
        <KPICard icon={DollarSign} label="Total Denied" value={'$' + (denialStats?.totalDenied / 1000).toFixed(0) + 'K'} subtext="This month" />
        <KPICard icon={AlertTriangle} label="Pending Appeals" value={denialStats?.pendingAppeals || 0} subtext="In progress" />
        <KPICard icon={Clock} label="Avg Turnaround" value={denialStats?.avgTurnaround + ' days'} subtext="Appeal resolution" />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Denial Reasons Breakdown (Sample Data)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={denialStats?.reasonBreakdown || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis dataKey="reason" stroke="#94a3b8" angle={-45} textAnchor="end" height={80} />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
            <Bar dataKey="count" fill="#F59E0B" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === 'all' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>All</button>
        <button onClick={() => setFilter('CO')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === 'CO' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Coverage (CO)</button>
        <button onClick={() => setFilter('PR')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === 'PR' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Patient Resp (PR)</button>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
        <DataTable
          columns={['Claim ID', 'Patient', 'Payer', 'Amount', 'Code', 'Status', 'Appeal Status']}
          data={filteredDenials.map(d => ({ 'Claim ID': d.id, Patient: maskPHI(d.patient, isMasked), Payer: d.payer, Amount: '$' + d.amount, Code: d.denialCode, Status: d.status, 'Appeal Status': d.appStatus }))}
          onRowClick={(row) => { const d = filteredDenials.find(x => x.id === row['Claim ID']); if (d) setSelectedDenial(d); }}
        />
      </div>

      {selectedDenial && (
        <Modal isOpen={!!selectedDenial} onClose={() => setSelectedDenial(null)} title={`Denial: ${selectedDenial.id}`}
          footer={
            <>
              <button onClick={() => setSelectedDenial(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Close</button>
              <button className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-semibold transition-colors">Appeal</button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Claim ID:</span><span className="text-white">{selectedDenial.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Patient:</span><span className="text-white">{maskPHI(selectedDenial.patient, isMasked)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Payer:</span><span className="text-white">{selectedDenial.payer}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Amount:</span><span className="text-white">${selectedDenial.amount}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Denial Code:</span><span className="text-white font-mono">{selectedDenial.denialCode}</span></div>
            <div className="bg-slate-700/30 border-l-2 border-amber-500 p-3 rounded">
              <p className="text-slate-300 text-xs font-semibold mb-1">Reason:</p>
              <p className="text-slate-400">{selectedDenial.denialReason}</p>
            </div>
            <div className="flex justify-between"><span className="text-slate-400">Deadline:</span><span className="text-white">{selectedDenial.deadline}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status:</span><Badge status={selectedDenial.status} size="sm" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============ ELIGIBILITY MODULE ============
const EligibilityModule = ({ token }) => {
  const [activeTab, setActiveTab] = useState('verify');
  const [memberId, setMemberId] = useState('');
  const [planId, setPlanId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [estimatorData, setEstimatorData] = useState(null);

  const handleCheck = async () => {
    setError('');
    if (!memberId || !planId) {
      setError('Please enter Member ID and Plan ID');
      return;
    }
    setLoading(true);
    try {
      const data = await api.getEligibility(token, memberId, planId);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEstimate = () => {
    setEstimatorData({
      patient: 'Sample Patient',
      payer: 'BlueCross',
      cptCode: '99214',
      allowedAmount: 450,
      payerResp: 360,
      patientResp: 90,
      deductibleRemaining: 250,
      copay: 40,
      coinsurance: 50,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setActiveTab('verify'); setResult(null); }} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'verify' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Eligibility Verification</button>
        <button onClick={() => setActiveTab('estimator')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'estimator' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Patient Cost Estimator</button>
      </div>

      {activeTab === 'verify' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Check Eligibility</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Member ID</label>
                <input type="text" value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="MEM-12345678" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Plan ID</label>
                <input type="text" value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="PLAN-001" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500" />
              </div>
              {error && <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded-lg text-sm">{error}</div>}
              <button onClick={handleCheck} disabled={loading} className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white font-semibold py-2 rounded-lg transition-colors">
                {loading ? 'Checking...' : 'Check Eligibility'}
              </button>
            </div>
          </div>

          {result && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="text-green-400" size={24} />
                <h3 className="text-lg font-semibold text-white">Eligible</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Member ID:</span><span className="text-white font-semibold">{result.memberId}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Plan:</span><span className="text-white font-semibold">{result.planName}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Deductible:</span><span className="text-white font-semibold">${result.deductible.individual} (${result.deductible.met} met)</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Copay (Office):</span><span className="text-white font-semibold">${result.copay.office}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Coinsurance:</span><span className="text-white font-semibold">{result.coinsurance}%</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Out-of-Pocket Max:</span><span className="text-white font-semibold">${result.outOfPocket.individual}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'estimator' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Patient Cost Estimator (Sample Data)</h3>
            <button onClick={handleEstimate} className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-6 py-2 rounded-lg transition-colors">Estimate Cost</button>
          </div>

          {estimatorData && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 space-y-4">
              <h4 className="font-semibold text-white">Estimate Results</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Allowed Amount:</span><span className="text-white font-semibold">${estimatorData.allowedAmount}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Payer Responsibility:</span><span className="text-green-400 font-semibold">${estimatorData.payerResp} (80%)</span></div>
              </div>
              <div className="border-t border-slate-700 pt-4">
                <p className="text-white font-semibold mb-3">Patient Responsibility Breakdown:</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Deductible Remaining:</span><span className="text-white">${estimatorData.deductibleRemaining}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Copay:</span><span className="text-white">${estimatorData.copay}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Coinsurance (20%):</span><span className="text-white">${estimatorData.coinsurance}</span></div>
                </div>
              </div>
              <div className="bg-teal-500/10 border border-teal-500/30 p-3 rounded mt-4">
                <p className="text-teal-300 text-xs font-semibold">Total Estimated Patient Owe: ${estimatorData.patientResp}</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded mt-4">
                <p className="text-amber-300 text-xs">ESTIMATE DISCLAIMER: This is an estimate only. Actual patient responsibility may differ based on final claim adjudication, benefits verification, and applicable payer policies. This is not a guarantee of payment.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ PRIOR AUTH MODULE ============
const PriorAuthModule = ({ token, plan }) => {
  if (plan === 'solo') return <LockedModule moduleName="Prior Authorization" requiredPlan="Group Practice or higher" />;
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Prior Authorization Module</h2>
      <p className="text-slate-400">Manage prior authorization requests with payer verification workflows. [Demo data — not connected to live payer systems]</p>
    </div>
  );
};

// ============ MESSAGING MODULE ============
const MessagingModule = ({ token }) => {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'BlueCross Support', timestamp: '2024-03-15 10:30', text: 'Your claim has been received and is under review.' },
    { id: 2, sender: 'You', timestamp: '2024-03-15 09:15', text: 'Requesting information on claim CLM-2024-0001 status.' },
  ]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!newMsg.trim()) return;
    setSending(true);
    try {
      await api.submitMessage(token, newMsg);
      setMessages([...messages, { id: messages.length + 1, sender: 'You', timestamp: new Date().toLocaleString(), text: newMsg }]);
      setNewMsg('');
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-96">
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'You' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs px-4 py-2 rounded-lg ${msg.sender === 'You' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/30 text-slate-300'}`}>
              <p className="text-xs font-semibold opacity-75">{msg.sender}</p>
              <p className="text-sm">{msg.text}</p>
              <p className="text-xs opacity-50 mt-1">{msg.timestamp}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input type="text" value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder="Type message..." className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500" />
        <button onClick={handleSend} disabled={sending || !newMsg.trim()} className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-2">
          <Send size={16} /> {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

// ============ A/R AGING MODULE ============
const ARAgingModule = ({ token }) => {
  const [aging, setAging] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getAging(token);
        setAging(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading A/R data...</div>;

  const total = aging?.buckets.reduce((sum, b) => sum + b.amount, 0) || 0;
  const colors = ['bg-green-500/20 text-green-300 border-green-500/30', 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', 'bg-orange-500/20 text-orange-300 border-orange-500/30', 'bg-red-500/20 text-red-300 border-red-500/30'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {aging?.buckets.map((bucket, idx) => (
          <div key={idx} className={`border rounded-lg p-6 ${colors[idx]}`}>
            <p className="font-semibold mb-2">{bucket.range}</p>
            <p className="text-2xl font-bold">${(bucket.amount / 1000).toFixed(0)}K</p>
            <p className="text-xs opacity-75">{bucket.claimCount} claims</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Total Outstanding: ${(total / 1000).toFixed(0)}K</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={aging?.byPayer || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis dataKey="payer" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
            <Legend />
            <Bar dataKey="0-30" stackId="a" fill="#10B981" />
            <Bar dataKey="31-60" stackId="a" fill="#F59E0B" />
            <Bar dataKey="61-90" stackId="a" fill="#F97316" />
            <Bar dataKey="90+" stackId="a" fill="#EF4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Priority Follow-Up Queue (Sample Data)</h3>
        <DataTable
          columns={['Claim ID', 'Patient', 'Payer', 'Amount', 'Age (days)', 'Last Action', 'Priority']}
          data={aging?.queue.map(q => ({ 'Claim ID': q.claimId, Patient: q.patient, Payer: q.payer, Amount: '$' + q.amount, 'Age (days)': q.age, 'Last Action': q.lastAction, Priority: q.priority })) || []}
          onRowClick={() => {}}
        />
      </div>
    </div>
  );
};

// ============ CLAIMS SCRUBBING MODULE ============
const ScrubModule = ({ token }) => {
  const [scrubbing, setScrubbing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getScrubbing(token);
        setScrubbing(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading scrub results...</div>;

  const cleanRate = scrubbing?.summary ? ((scrubbing.summary.clean / scrubbing.summary.scrubbed) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={FileCheck} label="Scrubbed Today" value={scrubbing?.summary.scrubbed} />
        <KPICard icon={CheckCircle} label="Clean Claims" value={scrubbing?.summary.clean + ` (${cleanRate}%)`} />
        <KPICard icon={AlertTriangle} label="Errors Found" value={scrubbing?.summary.errors} />
        <KPICard icon={AlertCircle} label="Warnings" value={scrubbing?.summary.warnings} />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Errors & Warnings (Sample Data)</h3>
        <DataTable
          columns={['Claim ID', 'Type', 'Severity', 'Description']}
          data={scrubbing?.issues.map(i => ({ 'Claim ID': i.claimId, Type: i.type, Severity: i.severity, Description: i.description.substring(0, 50) + '...' })) || []}
          onRowClick={() => {}}
        />
      </div>
    </div>
  );
};

// ============ PAYMENTS/ERA MODULE ============
const PaymentsModule = ({ token }) => {
  const [era, setERA] = useState([]);
  const [selectedERA, setSelectedERA] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getERA(token);
        setERA(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading payment data...</div>;

  const totalMonth = era.reduce((sum, e) => sum + e.amount, 0);
  const pending = era.filter(e => e.status === 'Pending').length;
  const exceptions = era.filter(e => e.status === 'Exception').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard icon={DollarSign} label="Received This Month" value={'$' + (totalMonth / 1000).toFixed(0) + 'K'} />
        <KPICard icon={Clock} label="Pending Posting" value={pending} />
        <KPICard icon={AlertTriangle} label="Underpayments" value="5" />
        <KPICard icon={CheckCircle} label="Overpayments" value="1" />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 overflow-hidden">
        <h3 className="text-lg font-semibold text-white mb-4">ERA/Remittance Queue (Sample Data)</h3>
        <DataTable
          columns={['ERA ID', 'Payer', 'Check #', 'Amount', 'Claims', 'Status', 'Date Received']}
          data={era.map(e => ({ 'ERA ID': e.id, Payer: e.payer, 'Check #': e.checkNo, Amount: '$' + e.amount.toLocaleString('en-US', { maximumFractionDigits: 2 }), Claims: e.claimsCount, Status: e.status, 'Date Received': e.received }))}
          onRowClick={(row) => { const e = era.find(x => x.id === row['ERA ID']); if (e) setSelectedERA(e); }}
        />
      </div>

      {selectedERA && (
        <Modal isOpen={!!selectedERA} onClose={() => setSelectedERA(null)} title={`ERA: ${selectedERA.id}`}
          footer={
            <>
              <button onClick={() => setSelectedERA(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Close</button>
              <button className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-semibold transition-colors">Post Payment</button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">ERA ID:</span><span className="text-white">{selectedERA.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Payer:</span><span className="text-white">{selectedERA.payer}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Check/EFT:</span><span className="text-white">{selectedERA.checkNo}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Total Amount:</span><span className="text-white font-semibold">${selectedERA.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Claims Count:</span><span className="text-white">{selectedERA.claimsCount}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Date Received:</span><span className="text-white">{selectedERA.received}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status:</span><Badge status={selectedERA.status} size="sm" /></div>
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded mt-4">
              <p className="text-amber-300 text-xs">Review line items for variance before posting. Underpayments highlighted in red.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============ ADJUDICATION MODULE (Insurance Only) ============
const AdjudicationModule = ({ token, userRole }) => {
  const [claims, setClaims] = useState([]);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getClaims(token);
        setClaims(data.filter(c => c.status === 'In Review' || c.status === 'Submitted'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading adjudication queue...</div>;

  const handleDecision = (decision) => {
    alert(`Claim ${selectedClaim.id} marked as ${decision}. Confirmation dialog would appear.`);
    setSelectedClaim(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard icon={CheckSquare} label="To Review" value={claims.length} />
        <KPICard icon={Clock} label="Avg Review Time" value="4.2 min" />
        <KPICard icon={CheckCircle} label="Auto-Adjudicated" value="312" subtext="Today" />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 overflow-hidden">
        <h3 className="text-lg font-semibold text-white mb-4">Review Queue (Sample Data)</h3>
        <DataTable
          columns={['Claim ID', 'Provider', 'Member', 'CPT', 'DX', 'Amount', 'Status']}
          data={claims.map(c => ({ 'Claim ID': c.id, Provider: c.provider, Member: c.patient, CPT: c.cptCode, DX: c.icd10, Amount: '$' + c.amount, Status: c.status }))}
          onRowClick={(row) => { const c = claims.find(x => x.id === row['Claim ID']); if (c) setSelectedClaim(c); }}
        />
      </div>

      {selectedClaim && (
        <Modal isOpen={!!selectedClaim} onClose={() => setSelectedClaim(null)} title={`Adjudicate: ${selectedClaim.id}`}
          footer={
            <>
              <button onClick={() => setSelectedClaim(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Cancel</button>
              <button onClick={() => handleDecision('Deny')} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-colors">Deny</button>
              <button onClick={() => handleDecision('Approve')} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors">Approve</button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Claim ID:</span><span className="text-white">{selectedClaim.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Provider:</span><span className="text-white">{selectedClaim.provider}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Member:</span><span className="text-white">{selectedClaim.patient}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">CPT:</span><span className="text-white">{selectedClaim.cptCode}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">DX:</span><span className="text-white">{selectedClaim.icd10}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Billed Amount:</span><span className="text-white">${selectedClaim.amount}</span></div>
            <div className="bg-slate-700/30 border-l-2 border-cyan-500 p-3 rounded mt-4">
              <p className="text-slate-300 text-xs font-semibold">Member Eligibility: Active | Fee Schedule: $450 allowed</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============ FRAUD DETECTION MODULE (Insurance Only) ============
const FraudDetectionModule = ({ token }) => {
  const [alerts, setAlerts] = useState([
    { id: 1, severity: 'Critical', message: 'Provider #NPI-1234567890: 94% of E&M visits billed at Level 5 (99215). National average: 23%', status: 'New' },
    { id: 2, severity: 'High', message: 'Member #MEM-45821: 8 MRI claims in 30 days across 4 different providers. Pattern alert.', status: 'Open' },
    { id: 3, severity: 'High', message: 'Provider group billing unbundled lab panels (NCCI violation suspected).', status: 'New' },
    { id: 4, severity: 'Medium', message: 'Claim CLM-2024-0891: Service date is a federal holiday. Verify service rendered.', status: 'New' },
    { id: 5, severity: 'Critical', message: 'Provider billing for services during license suspension (state board data).', status: 'New' },
  ]);

  const severityColor = (sev) => {
    if (sev === 'Critical') return 'border-red-500/50 bg-red-500/10 text-red-300';
    if (sev === 'High') return 'border-orange-500/50 bg-orange-500/10 text-orange-300';
    return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300';
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
        <p className="text-amber-300 text-sm font-semibold">Fraud detection flags are generated by rules-based pattern analysis. Flags do not constitute findings of fraud. All flagged items require human investigation and due process.</p>
      </div>

      <div className="space-y-3">
        {alerts.map(alert => (
          <div key={alert.id} className={`border rounded-lg p-4 ${severityColor(alert.severity)}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} />
                  <span className="font-semibold">{alert.severity} - {alert.status}</span>
                </div>
                <p className="text-sm">{alert.message}</p>
              </div>
              <div className="flex gap-2 ml-4">
                <button className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors">Investigate</button>
                <button className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors">Dismiss</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ NETWORK MANAGEMENT MODULE (Insurance Only) ============
const NetworkModule = ({ token }) => {
  const [stats, setStats] = useState({
    totalProviders: 2847,
    pendingCred: 34,
    expiring90: 12,
    adequacy: 87,
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard icon={Users} label="In-Network Providers" value={stats.totalProviders} />
        <KPICard icon={Clock} label="Pending Credentialing" value={stats.pendingCred} />
        <KPICard icon={AlertCircle} label="Expiring (90 days)" value={stats.expiring90} />
        <KPICard icon={TrendingUp} label="Adequacy Score" value={stats.adequacy + '%'} />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Provider Directory (Sample Data)</h3>
        <DataTable
          columns={['NPI', 'Provider', 'Specialty', 'Status', 'Contract', 'Last Verified']}
          data={[
            { NPI: '1234567890', Provider: 'Dr. Smith', Specialty: 'Internal Medicine', Status: 'Active', Contract: 'Active', 'Last Verified': '2024-03-15' },
            { NPI: '1234567891', Provider: 'Dr. Johnson', Specialty: 'Cardiology', Status: 'Active', Contract: 'Active', 'Last Verified': '2024-03-14' },
            { NPI: '1234567892', Provider: 'Dr. Williams', Specialty: 'Surgery', Status: 'Pending', Contract: 'Pending', 'Last Verified': '2024-03-13' },
          ]}
          onRowClick={() => {}}
        />
      </div>
    </div>
  );
};

// ============ ANALYTICS MODULE ============
const AnalyticsModule = ({ token, plan, userRole }) => {
  const [analytics, setAnalytics] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getAnalytics(token);
        setAnalytics(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading analytics...</div>;

  const isInsurance = userRole?.includes('Insurance') || userRole === 'Insurance Rep';

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'overview' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Overview</button>
        {(plan === 'group' || plan === 'enterprise') && <button onClick={() => setActiveTab('aging')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'aging' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>A/R Aging</button>}
        {isInsurance && <button onClick={() => setActiveTab('quality')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'quality' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Quality Metrics</button>}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KPICard icon={FileCheck} label="Claims This Month" value={analytics?.claimsThisMonth} />
            <KPICard icon={TrendingUp} label="Approval Rate" value={analytics?.approvalRate + '%'} />
            <KPICard icon={Clock} label="Avg Days Processing" value={analytics?.avgDaysProcessing} />
            <KPICard icon={TrendingDown} label="Denial Rate" value={analytics?.denialRate.toFixed(1) + '%'} />
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Claims Trend (Sample Data)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics?.denialTrends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                <Legend />
                <Bar dataKey="approvals" fill="#10B981" />
                <Bar dataKey="denials" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'aging' && <ARAgingModule token={token} />}

      {activeTab === 'quality' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-white">HEDIS Quality Metrics (Sample Data)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Breast Cancer Screening</p>
              <p className="text-2xl font-bold text-yellow-300 mt-2">78%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 80% • Gap: -2%</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Diabetes A1C Testing</p>
              <p className="text-2xl font-bold text-green-300 mt-2">85%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 82% • Gap: +3%</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Controlling Blood Pressure</p>
              <p className="text-2xl font-bold text-red-300 mt-2">72%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 75% • Gap: -3%</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Childhood Immunizations</p>
              <p className="text-2xl font-bold text-green-300 mt-2">91%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 90% • Gap: +1%</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Follow-Up After Hospitalization</p>
              <p className="text-2xl font-bold text-red-300 mt-2">68%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 72% • Gap: -4%</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <p className="text-white font-semibold">Overall Star Rating</p>
              <p className="text-2xl font-bold text-teal-300 mt-2">4.0</p>
              <p className="text-xs text-slate-400 mt-2">Out of 5.0</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ GUARDRAILS MODULE ============
const GuardrailsModule = ({ token, plan }) => {
  if (plan === 'solo') return <LockedModule moduleName="Guardrails" requiredPlan="Group Practice or higher" />;
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Guardrails Module</h2>
      <p className="text-slate-400">Pre-submission compliance checks and claim validation.</p>
    </div>
  );
};

// ============ CONTRACTS MODULE ============
const ContractsModule = ({ plan }) => {
  if (plan !== 'enterprise') return <LockedModule moduleName="Contracts Management" requiredPlan="Enterprise" />;
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Contracts Management</h2>
      <p className="text-slate-400">Manage provider and payer contracts with automated renewal tracking.</p>
    </div>
  );
};

// ============ SECURITY MODULE ============

// Mock data generators for security features
const generateSecurityAlerts = () => [
  { id: 1, severity: 'CRITICAL', title: 'Failed Login Attempts Spike', description: 'Detected 12 failed login attempts from IP 203.0.113.45 in last 15 minutes', timestamp: '2 minutes ago' },
  { id: 2, severity: 'HIGH', title: 'Unusual Access Pattern', description: 'User john.provider accessed 847 patient records (average: 12/hour)', timestamp: '1 hour ago' },
  { id: 3, severity: 'MEDIUM', title: 'SSL Certificate Expiring Soon', description: 'TLS certificate for api.noesis.io expires in 14 days', timestamp: '6 hours ago' },
];

const generateActiveSessions = () => [
  { id: 1, name: 'John Smith', role: 'Provider', lastLogin: '12:34 PM', mfaStatus: 'Enabled', sessionStatus: 'Active' },
  { id: 2, name: 'Sarah Johnson', role: 'Billing Manager', lastLogin: '10:15 AM', mfaStatus: 'Enabled', sessionStatus: 'Active' },
  { id: 3, name: 'Michael Chen', role: 'Provider', lastLogin: '9:42 AM', mfaStatus: 'Disabled', sessionStatus: 'Idle' },
  { id: 4, name: 'Emma Davis', role: 'Security Admin', lastLogin: '8:20 AM', mfaStatus: 'Enabled', sessionStatus: 'Active' },
  { id: 5, name: 'Robert Wilson', role: 'Compliance Officer', lastLogin: '7:05 AM', mfaStatus: 'Enabled', sessionStatus: 'Offline' },
  { id: 6, name: 'Lisa Anderson', role: 'Coder', lastLogin: '11:58 PM (prev day)', mfaStatus: 'Disabled', sessionStatus: 'Offline' },
];

const generateAuditLog = () => [
  { timestamp: '2024-04-12 14:32', user: 'john.provider', action: 'Viewed claim', resource: 'CLM-2024-0892', ip: '192.168.1.100', status: 'Success' },
  { timestamp: '2024-04-12 14:28', user: 'sarah.billing', action: 'Exported report', resource: 'Patient Eligibility (125 records)', ip: '192.168.1.101', status: 'Success' },
  { timestamp: '2024-04-12 14:15', user: 'michael.chen', action: 'Failed login', resource: 'Authentication', ip: '203.0.113.45', status: 'Failed' },
  { timestamp: '2024-04-12 14:10', user: 'emma.admin', action: 'Modified authorization', resource: 'AUTH-0045', ip: '192.168.1.102', status: 'Success' },
  { timestamp: '2024-04-12 14:05', user: 'john.provider', action: 'Accessed PHI', resource: 'Patient: J.Smith (DOB: 06/15/1968)', ip: '192.168.1.100', status: 'Success' },
  { timestamp: '2024-04-12 13:52', user: 'robert.compliance', action: 'Downloaded ERA', resource: 'ERA batch (456 claims)', ip: '192.168.1.103', status: 'Success' },
  { timestamp: '2024-04-12 13:45', user: 'lisa.code', action: 'Logged in', resource: 'Authentication', ip: '203.0.113.200', status: 'Success' },
  { timestamp: '2024-04-12 13:32', user: 'emma.admin', action: 'Changed security settings', resource: 'MFA Policy', ip: '192.168.1.102', status: 'Success' },
  { timestamp: '2024-04-12 13:20', user: 'sarah.billing', action: 'Ran claim scrubbing', resource: 'Claim Validation Engine', ip: '192.168.1.101', status: 'Success' },
  { timestamp: '2024-04-12 13:10', user: 'michael.chen', action: 'Updated denial appeal', resource: 'CLM-2024-0010', ip: '192.168.1.104', status: 'Success' },
];

const generatePHICategories = () => [
  { category: 'Patient Name', masking: 'Available', risk: 'Medium' },
  { category: 'Date of Birth', masking: 'Available', risk: 'Medium' },
  { category: 'Medical Record Numbers', masking: 'Available', risk: 'High' },
  { category: 'Diagnosis Codes (ICD-10)', masking: 'Visible to Authorized', risk: 'Low' },
  { category: 'CPT/Procedure Codes', masking: 'Visible to Authorized', risk: 'Low' },
  { category: 'Insurance ID', masking: 'Available', risk: 'High' },
  { category: 'Provider NPI', masking: 'Public Data', risk: 'Low' },
];

const generateRolePermissions = () => {
  const permissions = ['View Claims', 'Edit Claims', 'Access PHI', 'Download Reports', 'Manage Users', 'View Audit Logs', 'Configure Security', 'Approve Appeals'];
  return {
    'Provider': [true, true, true, false, false, false, false, false],
    'Billing Manager': [true, true, false, true, false, false, false, true],
    'Security Admin': [false, false, false, false, true, true, true, false],
  };
};

const SecurityCenterModule = ({ plan, isMasked, setIsMasked }) => {
  if (plan !== 'enterprise') return <LockedModule moduleName="Security Center" requiredPlan="Enterprise — contact sales" />;

  const [activeTab, setActiveTab] = useState('overview');
  const [minimumNecessary, setMinimumNecessary] = useState(true);
  const [autoLock, setAutoLock] = useState(true);
  const [mfaEnforced, setMfaEnforced] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [searchAudit, setSearchAudit] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [breachSeverity, setBreachSeverity] = useState('LOW');
  const [affectedRecords, setAffectedRecords] = useState('');
  const [safeHarborChecks, setSafeHarborChecks] = useState({
    names: true,
    addresses: true,
    dates: false,
    identifiers: true,
    phoneEmails: false,
    webUrls: false,
    biometrics: false,
  });

  const alerts = generateSecurityAlerts();
  const sessions = generateActiveSessions();
  const auditLog = generateAuditLog();
  const phiCategories = generatePHICategories();
  const rolePermissions = generateRolePermissions();
  const permissionNames = ['View Claims', 'Edit Claims', 'Access PHI', 'Download Reports', 'Manage Users', 'View Audit Logs', 'Configure Security', 'Approve Appeals'];

  // Calculate security score
  const calculateSecurityScore = () => {
    let score = 0;
    score += mfaEnforced ? 20 : 0;
    score += isMasked ? 15 : 0;
    score += minimumNecessary ? 15 : 0;
    score += autoLock ? 15 : 0;
    score += 15; // Access controls
    score += 20; // Encryption in transit
    return Math.min(score, 100);
  };

  const securityScore = calculateSecurityScore();
  const scoreColor = securityScore >= 80 ? 'text-green-400' : securityScore >= 60 ? 'text-yellow-400' : 'text-red-400';

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-500/20 text-red-300 border border-red-500/30';
      case 'HIGH': return 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
      case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
      case 'LOW': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border border-slate-500/30';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL': return <AlertTriangle size={18} />;
      case 'HIGH': return <AlertCircle size={18} />;
      case 'MEDIUM': return <AlertCircle size={18} />;
      case 'LOW': return <Info size={18} />;
      default: return <Info size={18} />;
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'High': return 'text-red-400';
      case 'Medium': return 'text-yellow-400';
      case 'Low': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* HIPAA Compliance Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-300 mb-1">HIPAA-Aligned Security Measures</p>
          <p className="text-amber-200/80">This platform implements security controls aligned with HIPAA Privacy and Security Rules. Noesis.io Health is NOT HIPAA-certified. No Business Associate Agreement is currently in place. Organizations must perform their own compliance assessment.</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
        {[
          { id: 'overview', label: 'Overview', icon: Shield },
          { id: 'phi', label: 'PHI Protection', icon: Lock },
          { id: 'access', label: 'Access Controls', icon: Users },
          { id: 'audit', label: 'Audit Trail', icon: Activity },
          { id: 'encryption', label: 'Encryption', icon: KeyRound },
          { id: 'breach', label: 'Breach Response', icon: Siren },
          { id: 'training', label: 'Training', icon: GraduationCap },
        ].map(tab => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-600/50 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <TabIcon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Security Score */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-8 text-center">
            <p className="text-slate-400 mb-2">Security Posture Score</p>
            <div className={`text-6xl font-bold ${scoreColor} mb-2`}>{securityScore}</div>
            <p className="text-slate-300 text-sm">Based on 6 security control categories</p>
          </div>

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">ACTIVE SESSIONS</p>
              <p className="text-3xl font-bold text-white">4</p>
              <p className="text-xs text-slate-400 mt-2">out of 6 licensed users</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">FAILED LOGIN ATTEMPTS (24H)</p>
              <p className="text-3xl font-bold text-orange-400">12</p>
              <p className="text-xs text-slate-400 mt-2">from 1 IP address</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">PHI ACCESS EVENTS (24H)</p>
              <p className="text-3xl font-bold text-green-400">847</p>
              <p className="text-xs text-slate-400 mt-2">authorized access</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">ENCRYPTION STATUS</p>
              <p className="text-2xl font-bold text-blue-400 flex items-center gap-2"><CheckCircle size={20} /> ACTIVE</p>
              <p className="text-xs text-slate-400 mt-2">TLS 1.3 in transit</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">ACCESS CONTROL SCORE</p>
              <p className="text-3xl font-bold text-green-400">92%</p>
              <p className="text-xs text-slate-400 mt-2">policy compliance</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">LAST SECURITY SCAN</p>
              <p className="text-2xl font-bold text-slate-300">2 hrs ago</p>
              <p className="text-xs text-green-400 mt-2">no issues found</p>
            </div>
          </div>

          {/* Security Alerts */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle size={20} /> Security Alerts</h3>
            <div className="space-y-3">
              {alerts.map(alert => (
                <div key={alert.id} className={`p-4 rounded-lg ${getSeverityColor(alert.severity)}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">{getSeverityIcon(alert.severity)}</div>
                    <div className="flex-1">
                      <p className="font-semibold">{alert.title}</p>
                      <p className="text-xs mt-1 opacity-90">{alert.description}</p>
                      <p className="text-xs mt-2 opacity-75">{alert.timestamp}</p>
                    </div>
                    <button className="text-xs font-semibold hover:underline">VIEW</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Status Checklist */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><ShieldCheck size={20} /> HIPAA Safeguards Compliance Status</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'Access Controls (164.312(a)(1))', status: 'IMPLEMENTED' },
                { name: 'Audit Controls (164.312(b))', status: 'IMPLEMENTED' },
                { name: 'Integrity Controls (164.312(c)(1))', status: 'IMPLEMENTED' },
                { name: 'Transmission Security (164.312(e)(1))', status: 'PARTIAL' },
                { name: 'Authentication (164.312(d))', status: 'IMPLEMENTED' },
                { name: 'Encryption at Rest (164.312(a)(2))', status: 'NOT YET' },
              ].map((item, idx) => {
                const isCompleted = item.status === 'IMPLEMENTED';
                const isPartial = item.status === 'PARTIAL';
                const statusColor = isCompleted ? 'text-green-400' : isPartial ? 'text-yellow-400' : 'text-red-400';
                const statusBg = isCompleted ? 'bg-green-500/10' : isPartial ? 'bg-yellow-500/10' : 'bg-red-500/10';
                return (
                  <div key={idx} className={`p-3 rounded-lg border ${statusBg} border-slate-700/50 flex items-start gap-3`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {isCompleted ? <CheckCircle size={18} className="text-green-400" /> : isPartial ? <AlertCircle size={18} className="text-yellow-400" /> : <AlertCircle size={18} className="text-red-400" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-white font-semibold">{item.name}</p>
                      <p className={`text-xs font-semibold ${statusColor} mt-1`}>{item.status}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-4 italic">Note: "Encryption at Rest" shows NOT YET because current prototype uses in-memory storage only. Production will implement AES-256.</p>
          </div>
        </div>
      )}

      {/* TAB 2: PHI PROTECTION */}
      {activeTab === 'phi' && (
        <div className="space-y-6">
          {/* PHI Masking Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-700/50">
            <div>
              <p className="text-white font-semibold flex items-center gap-2"><Eye size={18} /> PHI Masking</p>
              <p className="text-sm text-slate-400">Hide patient identifiers in tables and reports</p>
            </div>
            <button onClick={() => setIsMasked(!isMasked)} className={`px-6 py-2 rounded-lg font-semibold transition-colors text-sm ${isMasked ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-slate-600 text-slate-300 border border-slate-500'}`}>
              {isMasked ? '✓ ON' : 'OFF'}
            </button>
          </div>

          {/* Minimum Necessary Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-700/50">
            <div>
              <p className="text-white font-semibold flex items-center gap-2"><Filter size={18} /> Minimum Necessary Standard</p>
              <p className="text-sm text-slate-400">Limit PHI access to only what is necessary for the job function</p>
            </div>
            <button onClick={() => setMinimumNecessary(!minimumNecessary)} className={`px-6 py-2 rounded-lg font-semibold transition-colors text-sm ${minimumNecessary ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-slate-600 text-slate-300 border border-slate-500'}`}>
              {minimumNecessary ? '✓ ON' : 'OFF'}
            </button>
          </div>

          {/* PHI Categories Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">PHI Categories & Risk Assessment</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">PHI Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Masking Available</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {phiCategories.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-200">{item.category}</td>
                      <td className="px-4 py-3 text-slate-300">{item.masking}</td>
                      <td className={`px-4 py-3 font-semibold ${getRiskColor(item.risk)}`}>{item.risk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* De-identification Controls */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><ShieldCheck size={20} /> Safe Harbor De-identification Method</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(safeHarborChecks).map(([key, value]) => (
                <label key={key} className="flex items-center gap-3 p-3 bg-slate-700/20 rounded-lg hover:bg-slate-700/40 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={() => setSafeHarborChecks({ ...safeHarborChecks, [key]: !value })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-slate-200">
                    {key === 'names' && 'Remove Names'}
                    {key === 'addresses' && 'Remove Addresses'}
                    {key === 'dates' && 'Remove Dates (except year)'}
                    {key === 'identifiers' && 'Remove ID Numbers'}
                    {key === 'phoneEmails' && 'Remove Phone/Email'}
                    {key === 'webUrls' && 'Remove Web URLs'}
                    {key === 'biometrics' && 'Remove Biometric Data'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Data Retention Policy */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Info size={20} /> Data Retention Policy</h3>
            <p className="text-slate-300 text-sm mb-3">
              <strong>Current Storage:</strong> In-Memory Only (Session-Based)
            </p>
            <p className="text-slate-400 text-sm">
              All patient data and PHI is stored in application memory only and is cleared at the end of each session. No persistent database storage is implemented in this prototype. In production, data retention will comply with HIPAA Storage Rule requirements (minimum 6 years for audit trails, with configurable retention policies for different data types).
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: ACCESS CONTROLS */}
      {activeTab === 'access' && (
        <div className="space-y-6">
          {/* Active Users Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Users size={20} /> Active Users & Sessions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">User Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Last Login</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">MFA Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Session</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session, idx) => (
                    <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-200">{session.name}</td>
                      <td className="px-4 py-3 text-slate-300">{session.role}</td>
                      <td className="px-4 py-3 text-slate-400">{session.lastLogin}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${session.mfaStatus === 'Enabled' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                          {session.mfaStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${session.sessionStatus === 'Active' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-600/50 text-slate-400'}`}>
                          {session.sessionStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Role Permissions Matrix */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Role-Based Access Control (RBAC) Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Permission</th>
                    {Object.keys(rolePermissions).map(role => (
                      <th key={role} className="px-4 py-3 text-center font-semibold text-slate-300">{role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionNames.map((perm, idx) => (
                    <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-200">{perm}</td>
                      {Object.values(rolePermissions).map((permissions, roleIdx) => (
                        <td key={roleIdx} className="px-4 py-3 text-center">
                          {permissions[idx] ? (
                            <CheckCircle size={18} className="text-green-400 inline-block" />
                          ) : (
                            <AlertCircle size={18} className="text-slate-600 inline-block" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Session Management */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={20} /> Session Management</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-slate-300 text-sm font-semibold mb-2">Active Sessions: 4 / 6</p>
                  <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '67%' }}></div>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-semibold mb-2">Session Timeout</label>
                  <select
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="480">8 hours</option>
                  </select>
                </div>
                <button className="w-full bg-red-600/30 hover:bg-red-600/50 border border-red-600/50 text-red-300 font-semibold py-2 rounded-lg transition-colors text-sm">
                  Force Logout All Sessions
                </button>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Lock size={20} /> Security Policies</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-300 font-semibold text-sm">Auto-Lock After Inactivity</p>
                    <p className="text-xs text-slate-400 mt-1">Automatically lock sessions after 10 minutes</p>
                  </div>
                  <button onClick={() => setAutoLock(!autoLock)} className={`px-4 py-2 rounded-lg font-semibold transition-colors text-sm ${autoLock ? 'bg-green-500/20 text-green-300' : 'bg-slate-600 text-slate-300'}`}>
                    {autoLock ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="border-t border-slate-700/50 pt-4 flex items-center justify-between">
                  <div>
                    <p className="text-slate-300 font-semibold text-sm">Enforce Multi-Factor Auth</p>
                    <p className="text-xs text-slate-400 mt-1">Recommended for HIPAA compliance</p>
                  </div>
                  <button onClick={() => setMfaEnforced(!mfaEnforced)} className={`px-4 py-2 rounded-lg font-semibold transition-colors text-sm ${mfaEnforced ? 'bg-green-500/20 text-green-300' : 'bg-slate-600 text-slate-300'}`}>
                    {mfaEnforced ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* IP Allowlist */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Wifi size={20} /> IP Allowlist (Whitelist)</h3>
            <div className="space-y-2">
              {['192.168.1.0/24', '203.0.113.50 - 203.0.113.100', '198.51.100.200'].map((ip, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg">
                  <p className="text-slate-200 font-mono">{ip}</p>
                  <button className="text-xs text-red-400 hover:text-red-300 font-semibold">REMOVE</button>
                </div>
              ))}
            </div>
            <button className="mt-4 w-full bg-blue-600/30 hover:bg-blue-600/50 border border-blue-600/50 text-blue-300 font-semibold py-2 rounded-lg transition-colors text-sm">
              + Add IP Address
            </button>
          </div>

          {/* Password Policy */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Fingerprint size={20} /> Password Policy</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                'Minimum 12 characters',
                'Uppercase letters required',
                'Lowercase letters required',
                'Numbers required',
                'Special characters required',
                'No reuse of last 10 passwords',
              ].map((policy, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 bg-slate-700/20 rounded-lg">
                  <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                  <p className="text-slate-200 text-sm">{policy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Audit Filters */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">Search by User/Resource</label>
              <input
                type="text"
                placeholder="Enter search term..."
                value={searchAudit}
                onChange={(e) => setSearchAudit(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">Filter by Action</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-sm"
              >
                <option value="">All Actions</option>
                <option value="Viewed">Viewed</option>
                <option value="Exported">Exported</option>
                <option value="Modified">Modified</option>
                <option value="Accessed">Accessed</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm">
                <Download size={16} className="inline-block mr-2" />
                Export Audit Log
              </button>
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Activity size={20} /> Comprehensive Audit Log</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Timestamp</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">User</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Action</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Resource</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">IP Address</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((log, idx) => (
                    <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{log.timestamp}</td>
                      <td className="px-4 py-3 text-slate-200">{log.user}</td>
                      <td className="px-4 py-3 text-slate-300">{log.action}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{log.resource}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{log.ip}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${log.status === 'Success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Trail Features */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><ShieldCheck size={20} /> Tamper-Evident Logging</h3>
              <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg">
                <CheckCircle size={20} className="text-green-400" />
                <div>
                  <p className="text-green-300 font-semibold">Enabled</p>
                  <p className="text-xs text-green-200/80">Cryptographic hashing prevents tampering</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={20} /> Retention Policy</h3>
              <p className="text-slate-300 text-sm">
                Audit logs are retained for <strong>6 years</strong> in compliance with HIPAA Security Rule 45 CFR § 164.312(b).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ENCRYPTION */}
      {activeTab === 'encryption' && (
        <div className="space-y-6">
          {/* Encryption Status Dashboard */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><KeyRound size={20} /> Encryption Status Dashboard</h3>
            <div className="space-y-3">
              {[
                { name: 'Data in Transit', protocol: 'TLS 1.3', status: 'ACTIVE', color: 'green' },
                { name: 'Data at Rest', protocol: 'In-Memory Only', status: 'NOT PERSISTENT', color: 'amber' },
                { name: 'API Communications', protocol: 'HTTPS Enforced', status: 'ACTIVE', color: 'green' },
                { name: 'File Uploads', protocol: 'Scanned & Validated', status: 'ACTIVE', color: 'green' },
                { name: 'Backup Encryption', protocol: 'Not Applicable', status: 'N/A', color: 'gray' },
              ].map((item, idx) => {
                const statusColor = item.color === 'green' ? 'bg-green-500/10 text-green-300 border-green-500/30' : item.color === 'amber' ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30' : 'bg-slate-600/20 text-slate-400 border-slate-600/30';
                return (
                  <div key={idx} className={`p-4 rounded-lg border ${statusColor} flex items-start justify-between`}>
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs mt-1 opacity-80">{item.protocol}</p>
                    </div>
                    <span className="px-3 py-1 rounded text-xs font-bold">{item.status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Key Management */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Fingerprint size={20} /> Key Management</h3>
            <div className="space-y-3">
              <div className="p-4 bg-slate-700/20 rounded-lg">
                <p className="text-slate-300 font-semibold mb-2">Current Encryption Standard</p>
                <p className="text-slate-400 text-sm">Prototype: In-memory (no persistent encryption)</p>
              </div>
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-300 font-semibold mb-2">Production Roadmap</p>
                <p className="text-blue-200/80 text-sm">• AES-256 encryption at rest (database & backup)<br/>• Field-level encryption for PHI<br/>• Hardware Security Module (HSM) key management<br/>• Key rotation every 90 days</p>
              </div>
            </div>
          </div>

          {/* Certificate Status */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Server size={20} /> TLS Certificate Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-300 font-semibold text-sm">Certificate Valid</p>
                <p className="text-xs text-green-200/80 mt-2">Issued: Jan 15, 2024</p>
                <p className="text-xs text-green-200/80">Expires: Jan 14, 2025</p>
              </div>
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-300 font-semibold text-sm">HSTS Enabled</p>
                <p className="text-xs text-green-200/80 mt-2">HTTP Strict-Transport-Security</p>
                <p className="text-xs text-green-200/80">Max Age: 31536000 seconds</p>
              </div>
            </div>
          </div>

          {/* Important Disclaimer */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><AlertTriangle size={20} /> Important Production Disclaimer</h3>
            <p className="text-amber-200 text-sm">
              <strong>Current prototype uses in-memory storage.</strong> Production deployment will implement:
            </p>
            <ul className="text-amber-200/80 text-sm mt-3 space-y-1 ml-4">
              <li>• AES-256 encryption at rest for all persistent data</li>
              <li>• Field-level encryption for sensitive PHI (patient names, SSN, DOB, MRN)</li>
              <li>• Hardware Security Module (HSM) for key management and rotation</li>
              <li>• Encrypted backups with separate encryption keys</li>
              <li>• TLS 1.3+ for all data in transit</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 6: BREACH RESPONSE */}
      {activeTab === 'breach' && (
        <div className="space-y-6">
          {/* Breach Notification Workflow */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Siren size={20} /> Breach Notification Workflow</h3>
            <div className="space-y-3">
              {[
                { step: 1, name: 'Detection & Identification', desc: 'Automated monitoring detects unauthorized PHI access' },
                { step: 2, name: 'Containment', desc: 'Isolate affected systems and revoke compromised credentials' },
                { step: 3, name: 'Risk Assessment', desc: 'Determine scope of PHI exposure and breach severity' },
                { step: 4, name: 'Notification', desc: 'Notify affected individuals within 60 days per HIPAA Breach Notification Rule' },
                { step: 5, name: 'Documentation', desc: 'Maintain detailed breach records for 6 years' },
              ].map((item) => (
                <div key={item.step} className="p-4 bg-slate-700/20 rounded-lg border border-slate-700/50 flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white">{item.step}</div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="text-sm text-slate-400 mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current Incident Status */}
          <div className="flex items-center gap-3 p-6 bg-green-500/10 border border-green-500/30 rounded-lg">
            <CheckCircle size={24} className="text-green-400" />
            <div>
              <p className="text-green-300 font-semibold text-lg">No Active Incidents</p>
              <p className="text-green-200/80 text-sm">All systems secure. Last breach assessment: 7 days ago</p>
            </div>
          </div>

          {/* Breach Risk Assessment Form */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Breach Risk Assessment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">Incident Severity</label>
                <select
                  value={breachSeverity}
                  onChange={(e) => setBreachSeverity(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="LOW">Low Risk - Technical issue, no actual exposure</option>
                  <option value="MEDIUM">Medium Risk - Limited unauthorized access, low sensitivity PHI</option>
                  <option value="HIGH">High Risk - Significant PHI exposure, multiple individuals affected</option>
                  <option value="CRITICAL">Critical - Widespread breach of sensitive data requiring OCR notification</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">Number of Affected Patient Records</label>
                <input
                  type="number"
                  value={affectedRecords}
                  onChange={(e) => setAffectedRecords(e.target.value)}
                  placeholder="Enter number..."
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <p className="text-slate-300 text-sm font-semibold mb-3">Affected PHI Types</p>
                <div className="grid grid-cols-2 gap-3">
                  {['Patient Names', 'SSN', 'Medical Record Numbers', 'Diagnosis Codes', 'Insurance Information', 'Contact Information'].map((phi, idx) => (
                    <label key={idx} className="flex items-center gap-2 p-2 hover:bg-slate-700/20 rounded cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded" />
                      <span className="text-slate-300 text-sm">{phi}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors">
                Submit Incident Report
              </button>
            </div>
          </div>

          {/* Emergency Contacts */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle size={20} /> Emergency Contacts</h3>
            <div className="space-y-3">
              {[
                { role: 'Privacy Officer', name: 'Dr. Sarah Mitchell', phone: '+1-555-0123', email: 'sarah.mitchell@organization.com' },
                { role: 'Security Officer', name: 'James Chen', phone: '+1-555-0456', email: 'james.chen@organization.com' },
                { role: 'Legal Counsel', name: 'Patricia Woods', phone: '+1-555-0789', email: 'patricia.woods@organization.com' },
              ].map((contact, idx) => (
                <div key={idx} className="p-4 bg-slate-700/20 rounded-lg border border-slate-700/50 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">{contact.role}</p>
                    <p className="text-sm text-slate-400 mt-1">{contact.name}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Phone size={14} /> {contact.phone}</span>
                      <span className="flex items-center gap-1"><Mail size={14} /> {contact.email}</span>
                    </div>
                  </div>
                  <button className="px-3 py-1 bg-blue-600/30 text-blue-300 border border-blue-600/50 rounded text-xs font-semibold hover:bg-blue-600/50 transition-colors">
                    Configure
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* OCR Reporting Checklist */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><FileWarning size={20} /> Office for Civil Rights (OCR) Reporting Checklist</h3>
            <div className="space-y-2">
              {[
                'Breach affects 500+ individuals in single jurisdiction',
                'Breach affects 500+ individuals nationwide',
                'Media notification required',
                'HHS notification required',
                'Individual notification letters prepared',
                'Documentation complete',
              ].map((item, idx) => (
                <label key={idx} className="flex items-center gap-3 p-3 hover:bg-slate-700/20 rounded cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  <span className="text-slate-200 text-sm">{item}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: TRAINING */}
      {activeTab === 'training' && (
        <div className="space-y-6">
          {/* Organization Compliance Rate */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Organization Training Compliance</h3>
            <div className="text-center">
              <p className="text-slate-400 mb-2">Organization Completion Rate</p>
              <p className="text-5xl font-bold text-green-400 mb-2">87%</p>
              <div className="w-full bg-slate-700/50 rounded-full h-3">
                <div className="bg-green-500 h-3 rounded-full" style={{ width: '87%' }}></div>
              </div>
              <p className="text-xs text-slate-400 mt-3">24 of 27 users completed all required training</p>
            </div>
          </div>

          {/* Training Modules */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><GraduationCap size={20} /> HIPAA Compliance Training Modules</h3>
            <div className="space-y-4">
              {[
                { title: 'HIPAA Privacy Rule Fundamentals', required: true, duration: '60 min', status: 'Completed' },
                { title: 'HIPAA Security Rule', required: true, duration: '45 min', status: 'Completed' },
                { title: 'PHI Handling & De-identification', required: true, duration: '30 min', status: 'In Progress' },
                { title: 'Breach Notification Procedures', required: true, duration: '20 min', status: 'Pending' },
                { title: 'Security Incident Response', required: false, duration: '25 min', status: 'Not Started' },
                { title: 'Social Engineering Awareness', required: false, duration: '15 min', status: 'Completed' },
              ].map((module, idx) => {
                const isCompleted = module.status === 'Completed';
                const isInProgress = module.status === 'In Progress';
                const statusColor = isCompleted ? 'bg-green-500/10 text-green-300' : isInProgress ? 'bg-blue-500/10 text-blue-300' : 'bg-slate-600/20 text-slate-400';
                const progressPercent = isCompleted ? 100 : isInProgress ? 65 : 0;
                return (
                  <div key={idx} className="p-4 bg-slate-700/20 rounded-lg border border-slate-700/50">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{module.title}</p>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${module.required ? 'bg-red-500/20 text-red-300' : 'bg-slate-600/50 text-slate-400'}`}>
                            {module.required ? 'Required' : 'Recommended'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Duration: {module.duration}</p>
                      </div>
                      <span className={`px-3 py-1 rounded text-xs font-bold ${statusColor}`}>{module.status}</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${isCompleted ? 'bg-green-500' : isInProgress ? 'bg-blue-500' : 'bg-slate-600'}`} style={{ width: `${progressPercent}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deadlines and Certificates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={20} /> Next Training Deadline</h3>
              <p className="text-2xl font-bold text-yellow-400 mb-2">May 15, 2024</p>
              <p className="text-slate-400 text-sm">
                Complete "Breach Notification Procedures" training to maintain HIPAA compliance.
              </p>
              <button className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm">
                Start Training Now
              </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><FileCheck size={20} /> Training Certificates</h3>
              <div className="space-y-2">
                <button className="w-full px-4 py-2 bg-green-600/30 border border-green-600/50 text-green-300 rounded-lg hover:bg-green-600/50 transition-colors text-sm font-semibold">
                  Download All Certificates (PDF)
                </button>
                <button className="w-full px-4 py-2 bg-blue-600/30 border border-blue-600/50 text-blue-300 rounded-lg hover:bg-blue-600/50 transition-colors text-sm font-semibold">
                  View Compliance Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ GROWTH ENGINE MODULE ============
const GrowthEngineModule = ({ plan }) => {
  if (plan !== 'enterprise') return <LockedModule moduleName="Growth Engine" requiredPlan="Enterprise" />;
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Growth Engine</h2>
      <p className="text-slate-400">Expand network and optimize revenue cycle.</p>
    </div>
  );
};

// ============ INTEGRATIONS MODULE ============
const IntegrationStatusModule = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {INTEGRATIONS.map((int, idx) => (
          <div key={idx} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Plug className="text-slate-400" size={24} />
              <div>
                <p className="text-white font-semibold">{int.name}</p>
                <p className="text-sm text-slate-400">{int.provider}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className={`text-sm font-semibold ${
                  int.status === 'ACTIVE'     ? 'text-green-400' :
                  int.status === 'CONFIGURED' ? 'text-blue-400'  :
                  int.status === 'READY'      ? 'text-amber-400' :
                  'text-slate-400'
                }`}>{int.status}</p>
                {int.lastVerified && <p className="text-xs text-slate-500">Verified {int.lastVerified}</p>}
                {int.status === 'READY' && <p className="text-xs text-slate-500">Set env vars to activate</p>}
              </div>
              {int.affectsOutput && <CheckCircle size={20} className="text-green-400" />}
              {int.status === 'READY' && <Plug size={20} className="text-amber-400/60" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ SESSION TIMEOUT WARNING ============
const SessionTimeoutWarning = ({ secondsRemaining, onStayLoggedIn, onLogout }) => {
  const [secs, setSecs] = useState(secondsRemaining);

  useEffect(() => {
    setSecs(secondsRemaining);
  }, [secondsRemaining]);

  useEffect(() => {
    if (secs <= 0) return;
    const t = setTimeout(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const mins = Math.floor(secs / 60);
  const sec  = secs % 60;
  const isUrgent = secs < 60;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-800 border rounded-xl max-w-sm w-full shadow-2xl ${isUrgent ? 'border-red-500/60' : 'border-amber-500/60'}`}>
        <div className={`px-6 py-4 border-b flex items-center gap-3 ${isUrgent ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <Clock size={24} className={isUrgent ? 'text-red-400' : 'text-amber-400'} />
          <h3 className={`text-lg font-bold ${isUrgent ? 'text-red-300' : 'text-amber-300'}`}>
            Session Expiring Soon
          </h3>
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-slate-300 text-sm mb-4">
            Your session will expire due to inactivity in:
          </p>
          <div className={`text-5xl font-bold font-mono mb-4 ${isUrgent ? 'text-red-400' : 'text-amber-400'}`}>
            {mins > 0 ? `${mins}m ` : ''}{String(sec).padStart(2, '0')}s
          </div>
          <p className="text-slate-400 text-xs mb-6">
            HIPAA §164.312(a)(2)(iii) — automatic session logoff after 30 min inactivity
          </p>
          <div className="flex gap-3">
            <button
              onClick={onLogout}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-semibold transition-colors text-sm"
            >
              Sign Out
            </button>
            <button
              onClick={onStayLoggedIn}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors text-sm text-white ${isUrgent ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-500 hover:bg-teal-600'}`}
            >
              Stay Logged In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ PRICING PAGE ============
const PricingPage = ({ token, currentPlan, onUpgrade }) => {
  const [loading, setLoading] = useState(null);
  const [interval, setInterval] = useState('monthly');
  const [error, setError] = useState('');

  const ANNUAL_DISCOUNT = 0.17; // ~2 months free

  const getPriceDisplay = (plan) => {
    if (plan === 'enterprise') return { main: 'Custom', sub: 'Contact sales for enterprise pricing' };
    const monthly = plan === 'solo' ? 299 : 799;
    const annual  = Math.round(monthly * (1 - ANNUAL_DISCOUNT));
    return interval === 'monthly'
      ? { main: `$${monthly}`, sub: '/month, billed monthly' }
      : { main: `$${annual}`, sub: `/month, billed $${annual * 12}/year` };
  };

  const handleSubscribe = async (plan) => {
    if (plan === 'enterprise') {
      window.location.href = 'mailto:sales@noesis.io?subject=Enterprise%20Inquiry';
      return;
    }
    setError('');
    setLoading(plan);
    try {
      const result = await api.createCheckoutSession(token, plan, interval);
      if (result.url) {
        window.location.href = result.url;
      } else if (result.demo) {
        alert(`[Demo mode] Stripe not configured.\n\nIn production this would redirect to:\n${result.sessionId || 'Stripe Checkout'}\n\nPlan: ${plan} • Interval: ${interval}`);
      }
    } catch (err) {
      setError(err.message || 'Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-3">Simple, Transparent Pricing</h2>
        <p className="text-slate-400 max-w-xl mx-auto">
          Hybrid pricing model — flat monthly base plus per-claim overages only when you exceed your included volume.
          No surprises.
        </p>

        {/* Billing interval toggle */}
        <div className="mt-6 inline-flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
          <button
            onClick={() => setInterval('monthly')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${interval === 'monthly' ? 'bg-teal-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('annual')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${interval === 'annual' ? 'bg-teal-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Annual
            <span className="bg-green-500/20 text-green-300 text-xs px-2 py-0.5 rounded-full font-bold">Save 17%</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm max-w-lg mx-auto text-center">
          {error}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {['solo', 'group', 'enterprise'].map((planKey) => {
          const plan    = PLAN_FEATURES[planKey];
          const priceD  = getPriceDisplay(planKey);
          const isCurrent = currentPlan === planKey;
          const isPopular = plan.popular;

          return (
            <div
              key={planKey}
              className={`relative flex flex-col rounded-xl border transition-all ${
                isPopular
                  ? 'border-teal-500/60 bg-teal-500/5 shadow-lg shadow-teal-500/10'
                  : 'border-slate-700/50 bg-slate-800/50'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                  MOST POPULAR
                </div>
              )}

              <div className="p-6 border-b border-slate-700/50">
                <h3 className="text-xl font-bold text-white mb-1">{plan.displayName}</h3>
                {plan.trial && (
                  <p className="text-xs text-green-400 font-semibold mb-3">{plan.trial}</p>
                )}
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-bold text-white">{priceD.main}</span>
                </div>
                <p className="text-xs text-slate-400">{priceD.sub}</p>
                {planKey !== 'enterprise' && (
                  <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                    <p>Includes {plan.includedClaims.toLocaleString()} claims/mo</p>
                    <p>Overage: {plan.overageRate}/claim above limit</p>
                    <p>Up to {plan.includedProviders} provider accounts</p>
                  </div>
                )}
              </div>

              <div className="flex-1 p-6">
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle size={14} className="text-teal-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-300">{f}</span>
                    </li>
                  ))}
                  {plan.locked.map((f, i) => (
                    <li key={`locked-${i}`} className="flex items-start gap-2 text-sm opacity-40">
                      <Lock size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-500">{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(planKey)}
                  disabled={loading === planKey || isCurrent}
                  className={`w-full py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-slate-700 text-slate-400 cursor-default'
                      : isPopular
                      ? 'bg-teal-500 hover:bg-teal-600 text-white'
                      : planKey === 'enterprise'
                      ? 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  {loading === planKey ? (
                    <><Loader size={16} className="animate-spin" /> Redirecting to Stripe…</>
                  ) : isCurrent ? (
                    <><CheckCircle size={16} /> Current Plan</>
                  ) : planKey === 'enterprise' ? (
                    'Contact Sales'
                  ) : (
                    `Get Started — ${plan.displayName}`
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overage explainer */}
      <div className="max-w-5xl mx-auto bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="text-white font-bold mb-3 flex items-center gap-2">
          <DollarSign size={18} className="text-teal-400" /> How claim overages work
        </h4>
        <p className="text-slate-400 text-sm leading-relaxed">
          Each plan includes a monthly claim allowance. If your practice submits more claims than included, you're billed
          a small per-claim overage fee automatically via Stripe at the end of your billing period.
          There are no surprises — you can view your usage in the billing portal at any time.
          Enterprise plans negotiate a custom volume rate with no overages.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-teal-300 font-semibold">Solo example</p>
            <p className="text-slate-400 mt-1">520 claims × $0.45 overage on 20 claims above 500 limit = <span className="text-white font-bold">$9 overage</span> added to $299 base</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-teal-300 font-semibold">Group example</p>
            <p className="text-slate-400 mt-1">2,300 claims × $0.30 overage on 300 claims above 2,000 limit = <span className="text-white font-bold">$90 overage</span> added to $799 base</p>
          </div>
        </div>
      </div>

      {/* Enterprise CTA */}
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-slate-400 text-sm">
          Need a BAA, custom SLA, or dedicated onboarding? <button onClick={() => handleSubscribe('enterprise')} className="text-teal-400 hover:text-teal-300 font-semibold">Talk to our sales team →</button>
        </p>
      </div>
    </div>
  );
};

// ============ MAIN APP ============
export default function NoesisApp() {
  const [authState, setAuthState] = useState({ token: null, user: null, expiresIn: 0 });
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isMasked, setIsMasked] = useState(false);
  const [sessionExpiry, setSessionExpiry] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [consentsAccepted, setConsentsAccepted] = useState(false);
  const [userRole, setUserRole] = useState('Provider Staff');
  const [sessionSecsRemaining, setSessionSecsRemaining] = useState(null);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  // Listen for session-remaining events from apiFetch
  // Uses state setters directly (stable refs) to avoid stale closure issues
  useEffect(() => {
    const handler = (e) => {
      const { remaining, expired } = e.detail;
      if (expired) {
        setAuthState({ token: null, user: null, expiresIn: 0 });
        setSessionExpiry(null);
        setConsentsAccepted(false);
        setShowTimeoutWarning(false);
        setSessionSecsRemaining(null);
        return;
      }
      setSessionSecsRemaining(remaining);
      setShowTimeoutWarning(remaining > 0 && remaining <= 300);
    };
    window.addEventListener('noesis-session', handler);
    return () => window.removeEventListener('noesis-session', handler);
  }, []);

  // Check URL for Stripe checkout success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setActiveTab('Dashboard');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleLogin = (result) => {
    setAuthState(result);
    setUserRole(Math.random() > 0.7 ? 'Insurance Rep' : 'Provider Staff');
    setConsentsAccepted(false);
    setSessionExpiry(Date.now() + result.expiresIn * 1000);
    setShowTimeoutWarning(false);
  };

  const handleLogout = () => {
    setAuthState({ token: null, user: null, expiresIn: 0 });
    setSessionExpiry(null);
    setActiveTab('Dashboard');
    setConsentsAccepted(false);
    setShowTimeoutWarning(false);
    setSessionSecsRemaining(null);
  };

  const handleStayLoggedIn = async () => {
    setShowTimeoutWarning(false);
    try {
      const result = await api.refreshSession(authState.token);
      if (result.token) {
        setAuthState((prev) => ({ ...prev, token: result.token }));
        setSessionExpiry(Date.now() + (result.expiresIn || 3600) * 1000);
      }
    } catch {
      // Refresh failed — just dismiss the warning; next API call will catch expiry
    }
  };

  const handleConsentsComplete = () => {
    setConsentsAccepted(true);
  };

  if (!authState.token) return <LoginScreen onLogin={handleLogin} />;

  if (!consentsAccepted) {
    return (
      <ConsentGate onConsentsComplete={handleConsentsComplete} token={authState.token} email={authState.user?.email} />
    );
  }

  const isInsurance = userRole === 'Insurance Rep';
  const isProvider = !isInsurance;

  const providerTabs = ['Dashboard', 'Claims', 'Denials', 'Eligibility', 'Prior Auth', 'Messaging', 'Payments', 'Analytics', 'Guardrails', 'Contracts', 'Security', 'Growth', 'Integrations', 'Pricing', 'Legal'];
  const insuranceTabs = ['Dashboard', 'Adjudication', 'Appeals', 'Fraud Detection', 'Network', 'Analytics', 'Integrations', 'Pricing', 'Legal'];
  const tabs = isInsurance ? insuranceTabs : providerTabs;
  // Normalize legacy plan names (essentials→solo, professional→group)
  const rawPlan = authState.user?.plan || 'solo';
  const plan = rawPlan === 'essentials' ? 'solo' : rawPlan === 'professional' ? 'group' : rawPlan;
  const planName = { solo: 'Solo', group: 'Group Practice', enterprise: 'Enterprise' }[plan] || plan;

  const moduleMap = {
    Dashboard: <DashboardModule token={authState.token} userRole={userRole} isMasked={isMasked} />,
    Claims: <ClaimsModule token={authState.token} userRole={userRole} isMasked={isMasked} />,
    Denials: <DenialsModule token={authState.token} userRole={userRole} isMasked={isMasked} />,
    Eligibility: <EligibilityModule token={authState.token} />,
    'Prior Auth': <PriorAuthModule token={authState.token} plan={plan} />,
    Messaging: <MessagingModule token={authState.token} />,
    Payments: <PaymentsModule token={authState.token} />,
    Analytics: <AnalyticsModule token={authState.token} plan={plan} userRole={userRole} />,
    Guardrails: <GuardrailsModule token={authState.token} plan={plan} />,
    Contracts: <ContractsModule plan={plan} />,
    Security: <SecurityCenterModule plan={plan} isMasked={isMasked} setIsMasked={setIsMasked} />,
    Growth: <GrowthEngineModule plan={plan} />,
    Integrations: <IntegrationStatusModule />,
    Pricing: <PricingPage token={authState.token} currentPlan={plan} onUpgrade={(p) => { /* noop, handled inside */ }} />,
    Legal: <LegalSection />,
    Adjudication: <AdjudicationModule token={authState.token} userRole={userRole} />,
    'Fraud Detection': <FraudDetectionModule token={authState.token} />,
    Network: <NetworkModule token={authState.token} />,
    Appeals: <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6"><h2 className="text-2xl font-bold text-white">Appeals Review Queue</h2><p className="text-slate-400 mt-2">Review provider appeals for denied claims (Sample Data)</p></div>,
  };

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Session timeout warning overlay */}
      {showTimeoutWarning && sessionSecsRemaining !== null && (
        <SessionTimeoutWarning
          secondsRemaining={sessionSecsRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={handleLogout}
        />
      )}

      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-slate-800 border-r border-slate-700 overflow-hidden transition-all duration-300 flex flex-col`}>
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold text-teal-400 flex items-center gap-2">
            <Shield size={24} /> Noesis.io
          </h1>
          <p className="text-xs text-amber-400 mt-2">{isInsurance ? 'INSURANCE' : 'PROVIDER'} • {plan.toUpperCase()}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {tabs.map((tab) => {
            const isLocked = (tab === 'Prior Auth' || tab === 'Guardrails') && plan === 'solo';
            const isEnterprise = (tab === 'Contracts' || tab === 'Security' || tab === 'Growth') && plan !== 'enterprise';
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  activeTab === tab ? 'bg-teal-500/20 text-teal-400' : 'text-slate-300 hover:bg-slate-700/50'
                } ${tab === 'Pricing' ? 'border border-teal-500/20 text-teal-300' : ''}`}
              >
                {isLocked || isEnterprise ? <Lock size={16} /> : null}
                {tab === 'Pricing' ? <DollarSign size={16} /> : null}
                {tab}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700 space-y-2">
          <div className="text-xs text-slate-400">
            <p className="font-semibold">{authState.user?.email}</p>
            <p className="text-teal-400 font-semibold">{planName} • {userRole}</p>
          </div>
          <button
            onClick={() => setActiveTab('Pricing')}
            className="w-full bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 font-semibold px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs mb-1"
          >
            <DollarSign size={14} /> Upgrade Plan
          </button>
          <button onClick={handleLogout} className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-800/50 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-white transition-colors">
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div>
              <h2 className="text-2xl font-bold text-white">{activeTab}</h2>
              {sessionSecsRemaining !== null && sessionSecsRemaining > 0 && !showTimeoutWarning && (
                <p className="text-xs text-slate-500">Session active · {Math.floor(sessionSecsRemaining / 60)}m remaining</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:text-white transition-colors">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {moduleMap[activeTab]}
        </div>

        {/* Footer */}
        <div className="bg-slate-800/50 border-t border-slate-700/50 px-6 py-4">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <button onClick={() => setActiveTab('Legal')} className="hover:text-teal-400 transition-colors">Terms</button>
              <span>|</span>
              <button onClick={() => setActiveTab('Legal')} className="hover:text-teal-400 transition-colors">Privacy</button>
              <span>|</span>
              <button onClick={() => setActiveTab('Legal')} className="hover:text-teal-400 transition-colors">Disclaimer</button>
              <span>|</span>
              <button onClick={() => setActiveTab('Legal')} className="hover:text-teal-400 transition-colors">Billing</button>
            </div>
            <p className="text-xs text-slate-500">© 2026 Athena Core Technologies. All rights reserved.</p>
            <p className="text-xs text-slate-600">Noesis.io Health™ — Healthcare Revenue Management, Simplified</p>
          </div>
        </div>
      </div>
    </div>
  );
}
