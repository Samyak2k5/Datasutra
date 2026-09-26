import ApiError from '../utils/apiError.js';

/**
 * Standard document classification categories.
 */
export const DocumentCategory = {
  CUSTOMER_LIST: 'customer_list',
  INVOICE: 'invoice',
  TRANSACTION_STATEMENT: 'transaction_statement',
  CONTACT_LIST: 'contact_list',
  APPLICATION_FORM: 'application_form',
  REPORT: 'report',
  GENERIC_TABLE: 'generic_table',
  UNKNOWN: 'unknown_document'
};

/**
 * Deterministic Header Alias Dictionary.
 * Maps field name variations across unstructured/semi-structured documents to standard canonical fields.
 */
export const FIELD_ALIAS_MAP = {
  name: [
    'name',
    'full name',
    'fullname',
    'customer name',
    'client name',
    'contact name',
    'employee name',
    'applicant name',
    'lead name',
    'first and last name'
  ],
  email: [
    'email',
    'email address',
    'e-mail',
    'mail id',
    'email id',
    'mail',
    'electronic mail'
  ],
  phone: [
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'cell',
    'cellphone',
    'tel',
    'contact number',
    'telephone',
    'phone_no',
    'contact_no'
  ],
  city: [
    'city',
    'town',
    'location',
    'place',
    'district',
    'city/town'
  ],
  state: [
    'state',
    'province',
    'region'
  ],
  country: [
    'country',
    'nation'
  ],
  company: [
    'company',
    'organization',
    'organisation',
    'employer',
    'business name',
    'firm',
    'company name'
  ],
  salary: [
    'salary',
    'compensation',
    'income',
    'annual salary',
    'monthly salary',
    'ctc',
    'wage'
  ]
};

/**
 * Deterministically normalizes a discovered header string to a canonical field name.
 *
 * @param {string} rawHeader
 * @returns {{ canonical: string, matched: boolean, confidence: number }}
 */
export const mapToCanonicalHeader = (rawHeader) => {
  if (!rawHeader || typeof rawHeader !== 'string') {
    return { canonical: 'Column', matched: false, confidence: 0 };
  }

  const normalized = rawHeader.toLowerCase().trim().replace(/[-_]/g, ' ');

  for (const [canonical, aliases] of Object.entries(FIELD_ALIAS_MAP)) {
    if (aliases.includes(normalized)) {
      // Capitalize first letter for consistent display
      const capCanonical = canonical.charAt(0).toUpperCase() + canonical.slice(1);
      return { canonical: capCanonical, matched: true, confidence: 1.0 };
    }
  }

  // Preserve original title-cased if no alias matches
  return { canonical: rawHeader.trim(), matched: false, confidence: 0.7 };
};

/**
 * Deterministically classifies a document based on text keywords, headings, and structure.
 *
 * @param {string} textContent
 * @param {Array<string>} [headers=[]]
 * @param {Array<object>} [tables=[]]
 * @returns {{ category: string, confidence: number, method: string }}
 */
export const classifyDocument = (textContent = '', headers = [], tables = []) => {
  const lower = (textContent || '').toLowerCase();
  const headerStr = (headers || []).join(' ').toLowerCase();
  const combined = `${lower} ${headerStr}`;

  // 1. Invoice detection
  const invoiceKeywords = ['invoice', 'bill to', 'subtotal', 'tax rate', 'amount due', 'due date', 'remit to'];
  const invoiceHits = invoiceKeywords.filter((k) => combined.includes(k)).length;
  if (invoiceHits >= 3) {
    return { category: DocumentCategory.INVOICE, confidence: 0.95, method: 'deterministic' };
  }

  // 2. Transaction statement detection
  const statementKeywords = ['statement of account', 'debit', 'credit', 'balance brought forward', 'transaction date', 'opening balance'];
  const statementHits = statementKeywords.filter((k) => combined.includes(k)).length;
  if (statementHits >= 2) {
    return { category: DocumentCategory.TRANSACTION_STATEMENT, confidence: 0.9, method: 'deterministic' };
  }

  // 3. Application form detection
  const appKeywords = ['application form', 'applicant name', 'date of birth', 'applicant signature', 'declare that'];
  const appHits = appKeywords.filter((k) => combined.includes(k)).length;
  if (appHits >= 2) {
    return { category: DocumentCategory.APPLICATION_FORM, confidence: 0.9, method: 'deterministic' };
  }

  // 4. Customer list / Contact list
  const contactKeywords = ['email', 'phone', 'mobile', 'city', 'customer', 'client', 'leads', 'address'];
  const contactHits = contactKeywords.filter((k) => combined.includes(k)).length;

  if (combined.includes('customer') || combined.includes('client') || combined.includes('leads')) {
    if (contactHits >= 3 || tables.length > 0) {
      return { category: DocumentCategory.CUSTOMER_LIST, confidence: 0.92, method: 'deterministic' };
    }
  }

  if (contactHits >= 3) {
    return { category: DocumentCategory.CONTACT_LIST, confidence: 0.88, method: 'deterministic' };
  }

  // 5. Generic Table
  if (tables && tables.length > 0) {
    return { category: DocumentCategory.GENERIC_TABLE, confidence: 0.85, method: 'deterministic' };
  }

  // 6. Report
  const reportKeywords = ['summary', 'findings', 'conclusion', 'analysis', 'overview', 'quarterly', 'annual'];
  const reportHits = reportKeywords.filter((k) => combined.includes(k)).length;
  if (reportHits >= 2) {
    return { category: DocumentCategory.REPORT, confidence: 0.8, method: 'deterministic' };
  }

  return { category: DocumentCategory.UNKNOWN, confidence: 0.5, method: 'deterministic' };
};

/**
 * Extracts structured records from semi-structured key-value paragraphs without fabricating missing fields.
 *
 * @param {Array<string | object>} sections
 * @param {number} [pageNumber=1]
 * @returns {Array<object>} Extracted structured records with provenance
 */
export const extractSemiStructuredFields = (sections = [], pageNumber = 1) => {
  const records = [];
  let currentRecord = {};
  let fieldCount = 0;

  const sectionTexts = sections.map((s) => (typeof s === 'string' ? s : s.content || ''));

  for (let idx = 0; idx < sectionTexts.length; idx++) {
    const text = sectionTexts[idx];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const kvMatch = trimmed.match(/^([A-Za-z0-9_\s#]+):\s*(.*)$/);
      if (kvMatch) {
        const rawKey = kvMatch[1].trim();
        const rawVal = kvMatch[2].trim();

        const { canonical } = mapToCanonicalHeader(rawKey);

        if (rawVal) {
          // If we already saw this key in the current record, push existing record and start a new one
          if (currentRecord[canonical] !== undefined) {
            records.push({
              ...currentRecord,
              _provenance: {
                sourceType: 'document',
                sourcePage: pageNumber,
                section: 'key_value_block',
                sourceRow: records.length + 1
              }
            });
            currentRecord = {};
            fieldCount = 0;
          }

          currentRecord[canonical] = rawVal;
          fieldCount++;
        }
      }
    }
  }

  if (fieldCount > 0) {
    records.push({
      ...currentRecord,
      _provenance: {
        sourceType: 'document',
        sourcePage: pageNumber,
        section: 'key_value_block',
        sourceRow: records.length + 1
      }
    });
  }

  return records;
};

/**
 * Catalogues multiple tables detected in a document separately.
 *
 * @param {Array<object>} tables
 * @returns {Array<object>}
 */
export const separateDocumentTables = (tables = []) => {
  return tables.map((t, idx) => {
    const tableId = `table_${idx + 1}`;
    const rawHeaders = t.headers || [];
    const mappedHeaders = rawHeaders.map((h) => mapToCanonicalHeader(h).canonical);

    return {
      tableId,
      tableIndex: idx + 1,
      pageNumber: t.pageNumber || 1,
      originalHeaders: rawHeaders,
      canonicalHeaders: mappedHeaders,
      rowCount: t.rowCount || (t.rows ? t.rows.length : 0),
      isPrimary: idx === 0
    };
  });
};

/**
 * Calculates document extraction quality metrics.
 *
 * @param {object} params
 * @param {number} params.totalPages
 * @param {number} params.extractedPages
 * @param {number} params.failedPages
 * @param {number} params.tablesFound
 * @param {number} params.recordsExtracted
 * @param {Array<string>} params.columns
 * @param {Array<object>} params.rows
 * @param {boolean} [params.ocrUsed=false]
 * @param {number | null} [params.ocrConfidence=null]
 * @returns {object} Quality metrics
 */
export const calculateDocumentQualityMetrics = ({
  totalPages = 1,
  extractedPages = 1,
  failedPages = 0,
  tablesFound = 0,
  recordsExtracted = 0,
  columns = [],
  rows = [],
  ocrUsed = false,
  ocrConfidence = null
}) => {
  let fieldsMissing = 0;
  let ambiguousFields = 0;

  for (const r of rows) {
    for (const c of columns) {
      const colName = typeof c === 'string' ? c : c.name;
      const val = r[colName];
      if (val === undefined || val === null || val === '') {
        fieldsMissing++;
      }
    }
    if (r.issues && r.issues.length > 0) {
      ambiguousFields += r.issues.length;
    }
  }

  const reviewRequired = fieldsMissing > 0 || ambiguousFields > 0 || failedPages > 0 || ocrUsed;

  return {
    totalPages,
    extractedPages,
    failedPages,
    tablesFound,
    recordsExtracted,
    fieldsExtracted: columns.length,
    fieldsMissing,
    ocrUsed,
    ocrConfidence,
    ambiguousFields,
    reviewRequired
  };
};

export default {
  DocumentCategory,
  FIELD_ALIAS_MAP,
  mapToCanonicalHeader,
  classifyDocument,
  extractSemiStructuredFields,
  separateDocumentTables,
  calculateDocumentQualityMetrics
};
