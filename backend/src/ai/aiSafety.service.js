import { isIdentityField } from '../cleaning/missing/missingDataEngine.js';
import { cleanEmail } from '../cleaning/rules/email.rules.js';
import { cleanPhone } from '../cleaning/rules/phone.rules.js';
import { cleanName } from '../cleaning/rules/name.rules.js';
import { cleanLocation } from '../cleaning/rules/location.rules.js';
import { cleanGeneralString } from '../cleaning/rules/standardization.rules.js';
import { isMissingValue } from '../cleaning/rules/missingValue.rules.js';
import { FieldType } from '../cleaning/rules/fieldTypeDetector.js';
import { AIAction, AISafetyStatus } from './schemas/aiCleaningResult.schema.js';

const DISALLOWED_EMAIL_DOMAINS = new Set([
  'example.com',
  'test.com',
  'fake.com',
  'placeholder.com',
  'none.com',
  'domain.com',
  'invalid.com',
  'null.com'
]);

/**
 * Checks whether a given field name represents a customer identity, contact, address, or ID field.
 *
 * @param {string} fieldName
 * @returns {boolean}
 */
export const isCustomerIdentityOrIdField = (fieldName) => {
  if (!fieldName || typeof fieldName !== 'string') return false;
  if (isIdentityField(fieldName)) return true;
  const lower = fieldName.toLowerCase().replace(/[^a-z]/g, '');
  return (
    lower === 'id' ||
    lower.includes('customerid') ||
    lower.includes('userid') ||
    lower.includes('clientid') ||
    lower.includes('accountid')
  );
};

/**
 * Validates an AI suggestion against strict deterministic safety invariants.
 *
 * Safety policy:
 * 1. Schema must be valid (already validated by Zod).
 * 2. Identity fields (email, phone, name, address, IDs) must NEVER be fabricated if original was empty
 *    unless identical value was present in related fields.
 * 3. Suggested value must pass deterministic validation for the field's type.
 * 4. Disallowed placeholder domains in emails are strictly rejected.
 * 5. Actions with action='needs_review' or null suggestions return NEEDS_REVIEW / NO_CHANGE.
 *
 * @param {object} suggestion - Validated AI suggestion object
 * @param {object} contextItem - Original unresolved item context
 * @param {Map<string, string>} [columnTypeMap] - Column field types
 * @param {object} [options={}]
 * @returns {{
 *   status: string, // One of AISafetyStatus
 *   isValid: boolean,
 *   isSafeToApply: boolean,
 *   validatedValue: any,
 *   rejectionReason: string | null,
 *   safetyCheckNotes: Array<string>
 * }}
 */
export const evaluateAISuggestionSafety = (
  suggestion,
  contextItem,
  columnTypeMap,
  options = {}
) => {
  const notes = [];

  // 1. Explicit needs_review or no_safe_change from model
  if (suggestion.action === AIAction.NEEDS_REVIEW) {
    return {
      status: AISafetyStatus.NEEDS_REVIEW,
      isValid: true,
      isSafeToApply: false,
      validatedValue: null,
      rejectionReason: null,
      safetyCheckNotes: ['Model indicated needs_review due to insufficient evidence.']
    };
  }

  if (suggestion.action === AIAction.NO_SAFE_CHANGE || suggestion.suggestedValue === null || suggestion.suggestedValue === undefined) {
    return {
      status: AISafetyStatus.NO_CHANGE,
      isValid: true,
      isSafeToApply: false,
      validatedValue: null,
      rejectionReason: null,
      safetyCheckNotes: ['Model recommended leaving value unchanged.']
    };
  }

  const { field } = contextItem;
  const originalVal = contextItem.currentValue;
  const suggestedVal = suggestion.suggestedValue;

  // 2. Strict Customer Identity Fabrication Check
  if (isCustomerIdentityOrIdField(field)) {
    // If the original value was empty / missing:
    if (isMissingValue(originalVal, options)) {
      // Check if this exact suggested value existed somewhere in relatedFields
      const relatedValues = Object.values(contextItem.relatedFields || {}).map((v) =>
        String(v).toLowerCase().trim()
      );
      const isPresentInRelated = relatedValues.includes(String(suggestedVal).toLowerCase().trim());

      if (!isPresentInRelated) {
        return {
          status: AISafetyStatus.REJECTED,
          isValid: false,
          isSafeToApply: false,
          validatedValue: null,
          rejectionReason: `Fabrication violation: AI attempted to invent a customer identity field (${field}) without supporting record evidence.`,
          safetyCheckNotes: ['Rejected: Customer identity fields must never be invented.']
        };
      }
    }
  }

  // 3. Email-specific Safety Validation
  const lowerField = field.toLowerCase();
  if (lowerField.includes('email') || lowerField.includes('mail')) {
    const emailResult = cleanEmail(field, suggestedVal, options);
    if (!emailResult.isValid) {
      return {
        status: AISafetyStatus.REJECTED,
        isValid: false,
        isSafeToApply: false,
        validatedValue: null,
        rejectionReason: `Format validation failed: AI suggested value is not a valid email syntax (${suggestedVal}).`,
        safetyCheckNotes: ['Rejected: Email failed deterministic format validation.']
      };
    }

    const domain = String(emailResult.cleanedValue).split('@')[1];
    if (domain && DISALLOWED_EMAIL_DOMAINS.has(domain.toLowerCase())) {
      return {
        status: AISafetyStatus.REJECTED,
        isValid: false,
        isSafeToApply: false,
        validatedValue: null,
        rejectionReason: `Placeholder domain rejected: AI suggested a generic or fake email domain (${domain}).`,
        safetyCheckNotes: ['Rejected: Placeholder email domain.']
      };
    }

    return {
      status: AISafetyStatus.SAFE_SUGGESTION,
      isValid: true,
      isSafeToApply: true,
      validatedValue: emailResult.cleanedValue,
      rejectionReason: null,
      safetyCheckNotes: ['Email passed all safety and format checks.']
    };
  }

  // 4. Phone-specific Safety Validation
  if (lowerField.includes('phone') || lowerField.includes('mobile')) {
    const phoneResult = cleanPhone(field, suggestedVal, options);
    if (!phoneResult.isValid) {
      return {
        status: AISafetyStatus.REJECTED,
        isValid: false,
        isSafeToApply: false,
        validatedValue: null,
        rejectionReason: `Format validation failed: AI suggested phone number failed deterministic validation (${suggestedVal}).`,
        safetyCheckNotes: ['Rejected: Phone number failed deterministic validation.']
      };
    }

    return {
      status: AISafetyStatus.SAFE_SUGGESTION,
      isValid: true,
      isSafeToApply: true,
      validatedValue: phoneResult.cleanedValue,
      rejectionReason: null,
      safetyCheckNotes: ['Phone passed all safety and format checks.']
    };
  }

  // 5. Name-specific Validation
  if (lowerField === 'name' || lowerField.includes('name')) {
    const rawNameStr = String(suggestedVal || '').trim();
    const hasInvalidChars = /[\d!@#$%^&*()_+={}\[\]:;"<>?\/\\|~`]/.test(rawNameStr);
    if (hasInvalidChars || rawNameStr.length < 2) {
      return {
        status: AISafetyStatus.REJECTED,
        isValid: false,
        isSafeToApply: false,
        validatedValue: null,
        rejectionReason: `Format validation failed: AI suggested name contains invalid characters (${suggestedVal}).`,
        safetyCheckNotes: ['Rejected: Name contains invalid characters or digits.']
      };
    }

    const nameResult = cleanName(field, suggestedVal, options);
    if (nameResult.issue && nameResult.issue.severity === 'error') {
      return {
        status: AISafetyStatus.REJECTED,
        isValid: false,
        isSafeToApply: false,
        validatedValue: null,
        rejectionReason: `Format validation failed: AI suggested name contains invalid characters (${suggestedVal}).`,
        safetyCheckNotes: ['Rejected: Name contains invalid characters.']
      };
    }

    return {
      status: AISafetyStatus.SAFE_SUGGESTION,
      isValid: true,
      isSafeToApply: true,
      validatedValue: nameResult.cleanedValue,
      rejectionReason: null,
      safetyCheckNotes: ['Name passed safety checks.']
    };
  }

  // 6. Location-specific Validation
  if (lowerField.includes('city') || lowerField.includes('location') || lowerField.includes('state') || lowerField.includes('country')) {
    const locResult = cleanLocation(field, suggestedVal, options);
    if (locResult.issue && locResult.issue.severity === 'error') {
      return {
        status: AISafetyStatus.REJECTED,
        isValid: false,
        isSafeToApply: false,
        validatedValue: null,
        rejectionReason: `Location validation failed for ${suggestedVal}.`,
        safetyCheckNotes: ['Rejected: Location failed validation.']
      };
    }

    return {
      status: AISafetyStatus.SAFE_SUGGESTION,
      isValid: true,
      isSafeToApply: true,
      validatedValue: locResult.cleanedValue,
      rejectionReason: null,
      safetyCheckNotes: ['Location passed deterministic standardization.']
    };
  }

  // 7. General String Validation
  const genResult = cleanGeneralString(field, suggestedVal);
  return {
    status: AISafetyStatus.SAFE_SUGGESTION,
    isValid: true,
    isSafeToApply: true,
    validatedValue: genResult.cleanedValue,
    rejectionReason: null,
    safetyCheckNotes: ['General text passed safety checks.']
  };
};

export default {
  DISALLOWED_EMAIL_DOMAINS,
  evaluateAISuggestionSafety
};
