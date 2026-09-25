// DataSutra Mock Data Store
// Contains all mock data for stats, datasets, cleaning jobs, preview tables, results, and settings.

export const mockDashboardStats = {
  totalDatasets: 24,
  rowsProcessed: 128450,
  dataQuality: 92.4,
  issuesFound: 1248,
  duplicateCandidates: 24,
  missingValues: 56,
  cleaningJobsCount: 8,
  trends: {
    datasets: "+3 this week",
    rows: "+14.2% from last month",
    quality: "+2.1% improvement",
    issues: "-18% after last run"
  }
};

export const mockQualityOverview = {
  cleanDataPercent: 85,
  duplicatesPercent: 5,
  missingValuesPercent: 7,
  invalidDataPercent: 3,
  categories: [
    { label: "Clean Data", percentage: 85, count: 109182, color: "#0284c7" },
    { label: "Duplicates", percentage: 5, count: 6423, color: "#f59e0b" },
    { label: "Missing Values", percentage: 7, count: 8991, color: "#ef4444" },
    { label: "Invalid Data", percentage: 3, count: 3854, color: "#8b5cf6" }
  ]
};

export const mockCleaningJobs = [
  {
    id: "job-001",
    fileName: "leads.csv",
    status: "Completed",
    rowsProcessed: 1200,
    quality: 94,
    date: "Today, 10:45 AM",
    fileSize: "2.4 MB",
    duration: "4.2s",
    issuesFound: 38
  },
  {
    id: "job-002",
    fileName: "contacts.xlsx",
    status: "Processing",
    rowsProcessed: 856,
    quality: 88,
    date: "Today, 09:12 AM",
    fileSize: "1.8 MB",
    duration: "In progress",
    issuesFound: 21
  },
  {
    id: "job-003",
    fileName: "accounts.csv",
    status: "Completed",
    rowsProcessed: 2340,
    quality: 97,
    date: "Yesterday",
    fileSize: "4.1 MB",
    duration: "7.8s",
    issuesFound: 14
  },
  {
    id: "job-004",
    fileName: "opportunities.xlsx",
    status: "Failed",
    rowsProcessed: 0,
    quality: 0,
    date: "Mar 9, 2025",
    fileSize: "5.6 MB",
    duration: "0.4s",
    issuesFound: 1
  },
  {
    id: "job-005",
    fileName: "cases.csv",
    status: "Completed",
    rowsProcessed: 1100,
    quality: 91,
    date: "Mar 8, 2025",
    fileSize: "1.5 MB",
    duration: "3.9s",
    issuesFound: 45
  },
  {
    id: "job-006",
    fileName: "enterprise_clients.csv",
    status: "Completed",
    rowsProcessed: 3500,
    quality: 98,
    date: "Mar 5, 2025",
    fileSize: "6.2 MB",
    duration: "11.2s",
    issuesFound: 9
  }
];

export const mockSampleRecords = [
  {
    id: 1,
    name: "Rahul Sharma",
    email: "RAHUL@GMAIL.COM",
    phone: "+91 98765 43210",
    city: "mumbai",
    company: "TCS",
    issues: ["email-uppercase", "phone-spaces", "city-lowercase"]
  },
  {
    id: 2,
    name: "Priya",
    email: "priya@gmail.com",
    phone: "-",
    city: "Pune",
    company: "Infosys",
    issues: ["missing-phone", "missing-lastname"]
  },
  {
    id: 3,
    name: "Amit Kumar",
    email: "amit@example.com",
    phone: "9876543210",
    city: "MUMBAI",
    company: "Wipro",
    issues: ["city-uppercase"]
  },
  {
    id: 4,
    name: "Sneha",
    email: "SNEHA@GMAIL.COM",
    phone: "+91-9876543211",
    city: "delhi",
    company: "Accenture",
    issues: ["email-uppercase", "phone-formatting", "city-lowercase", "missing-lastname"]
  },
  {
    id: 5,
    name: "Rohit Singh",
    email: "rohit@gmail.com",
    phone: "98765 43210",
    city: "Delhi",
    company: "Cognizant",
    issues: ["duplicate-phone", "phone-spaces"]
  },
  {
    id: 6,
    name: "Ananya Roy",
    email: "ananya.roy@yahoo.com",
    phone: "+91 98112 33445",
    city: "Bangalore",
    company: "infosys ltd",
    issues: ["company-casing"]
  },
  {
    id: 7,
    name: "Vikram Malhotra",
    email: "vikram@malhotra",
    phone: "09988776655",
    city: "Bombay",
    company: "Tata Consultancy",
    issues: ["invalid-email", "archaic-city"]
  },
  {
    id: 8,
    name: "Deepika Patel",
    email: "deepika@patel.co.in",
    phone: "+919876543212",
    city: "Ahmedabad",
    company: "Adani Ent",
    issues: []
  }
];

export const mockCleaningResults = [
  {
    id: 1,
    field: "Email",
    originalValue: "RAHUL@GMAIL.COM",
    cleanedValue: "rahul@gmail.com",
    ruleApplied: "Normalize Email",
    reason: "Converted email to lowercase & validated format",
    category: "Changed",
    status: "Changed",
    confidence: "100%",
    isAi: false
  },
  {
    id: 2,
    field: "City",
    originalValue: "mumbai",
    cleanedValue: "Mumbai",
    ruleApplied: "Standardize City",
    reason: "Capitalized city name standardization",
    category: "Changed",
    status: "Changed",
    confidence: "100%",
    isAi: false
  },
  {
    id: 3,
    field: "Phone",
    originalValue: "(empty)",
    cleanedValue: "[NULL_FLAGGED]",
    ruleApplied: "Detect Missing Values",
    reason: "Value is missing and marked for imputation",
    category: "Missing",
    status: "Missing",
    confidence: "100%",
    isAi: false
  },
  {
    id: 4,
    field: "Phone",
    originalValue: "+91 98765 43210",
    cleanedValue: "9876543210",
    ruleApplied: "Normalize Phone",
    reason: "Stripped country prefix & normalized whitespace",
    category: "Changed",
    status: "Changed",
    confidence: "100%",
    isAi: false
  },
  {
    id: 5,
    field: "Record (Name, Phone)",
    originalValue: "Rohit Singh, 98765 43210",
    cleanedValue: "Duplicate Flagged",
    ruleApplied: "Duplicate Detection",
    reason: "Phone number exactly matches Row #1 (Rahul Sharma)",
    category: "Duplicates",
    status: "Duplicate",
    confidence: "98%",
    isAi: false
  },
  {
    id: 6,
    field: "City",
    originalValue: "Bombay",
    cleanedValue: "Mumbai",
    ruleApplied: "AI Standardization",
    reason: "Historical municipal nomenclature resolution",
    category: "AI Suggestions",
    status: "Needs Review",
    confidence: "95%",
    isAi: true
  },
  {
    id: 7,
    field: "Company",
    originalValue: "TCS Ltd",
    cleanedValue: "Tata Consultancy Services",
    ruleApplied: "AI Entity Resolution",
    reason: "Standardized acronym to primary registered legal entity",
    category: "AI Suggestions",
    status: "Needs Review",
    confidence: "88%",
    isAi: true
  },
  {
    id: 8,
    field: "Email",
    originalValue: "vikram@malhotra",
    cleanedValue: "vikram@malhotra.com",
    ruleApplied: "AI Domain Completion",
    reason: "Appended plausible commercial TLD based on header heuristic",
    category: "Unresolved",
    status: "Needs Review",
    confidence: "74%",
    isAi: true
  }
];

export const mockAiSuggestions = [
  {
    id: 1,
    field: "City",
    originalValue: "Bombay",
    aiSuggestion: "Mumbai",
    reason: "Standardize historic city name to current official nomenclature",
    confidence: 95,
    status: "pending"
  },
  {
    id: 2,
    field: "Company",
    originalValue: "TCS Ltd",
    aiSuggestion: "Tata Consultancy Services",
    reason: "Matched corporate subsidiary acronym to master entity catalog",
    confidence: 88,
    status: "pending"
  },
  {
    id: 3,
    field: "Email",
    originalValue: "rahul@gnail.com",
    aiSuggestion: "rahul@gmail.com",
    reason: "Detected high-probability domain typo ('gnail.com' -> 'gmail.com')",
    confidence: 92,
    status: "pending"
  },
  {
    id: 4,
    field: "City",
    originalValue: "new delhi",
    aiSuggestion: "New Delhi",
    reason: "Proper capitalized title casing for federal territory",
    confidence: 90,
    status: "pending"
  },
  {
    id: 5,
    field: "Company",
    originalValue: "Infy",
    aiSuggestion: "Infosys Technologies",
    reason: "Informal ticker slang mapped to canonical organization",
    confidence: 86,
    status: "pending"
  }
];

export const mockCleaningHistory = [
  {
    id: "hist-01",
    fileName: "leads.csv",
    status: "Completed",
    processed: 1200,
    changed: 450,
    quality: "94%",
    date: "Mar 10, 2025",
    fileSize: "2.4 MB"
  },
  {
    id: "hist-02",
    fileName: "contacts.xlsx",
    status: "Completed",
    processed: 856,
    changed: 198,
    quality: "91%",
    date: "Mar 10, 2025",
    fileSize: "1.8 MB"
  },
  {
    id: "hist-03",
    fileName: "accounts.csv",
    status: "Failed",
    processed: 0,
    changed: 0,
    quality: "0%",
    date: "Mar 9, 2025",
    fileSize: "4.1 MB"
  },
  {
    id: "hist-04",
    fileName: "opportunities.xlsx",
    status: "Completed",
    processed: 2340,
    changed: 612,
    quality: "96%",
    date: "Mar 8, 2025",
    fileSize: "5.6 MB"
  },
  {
    id: "hist-05",
    fileName: "cases.csv",
    status: "Processing",
    processed: 1100,
    changed: 230,
    quality: "89%",
    date: "Mar 8, 2025",
    fileSize: "1.5 MB"
  },
  {
    id: "hist-06",
    fileName: "campaign_members.csv",
    status: "Completed",
    processed: 4890,
    changed: 1120,
    quality: "95%",
    date: "Mar 2, 2025",
    fileSize: "8.2 MB"
  }
];

export const mockUserProfile = {
  name: "John Doe",
  email: "john@example.com",
  role: "Administrator",
  avatarUrl: null,
  initials: "JD",
  organization: "Acme Enterprise Corp",
  joinedDate: "January 2024"
};

export const defaultDeterministicRules = [
  {
    id: "trim_whitespace",
    label: "Remove leading/trailing whitespace",
    description: "Trim redundant spaces from all text fields and strings",
    enabled: true
  },
  {
    id: "normalize_email",
    label: "Normalize email addresses",
    description: "Convert to lowercase, trim spaces, and validate standard RFC syntax",
    enabled: true
  },
  {
    id: "normalize_phone",
    label: "Normalize phone numbers",
    description: "Standardize phone number format and strip extraneous punctuation",
    enabled: true
  },
  {
    id: "detect_duplicates",
    label: "Detect duplicate records",
    description: "Find potential exact and near-exact duplicate records",
    enabled: true
  },
  {
    id: "detect_missing",
    label: "Detect missing values",
    description: "Identify and explicitly flag empty, NaN, or placeholder data",
    enabled: true
  },
  {
    id: "standardize_cities",
    label: "Standardize city names",
    description: "Convert casing and map popular aliases to standard official city names",
    enabled: true
  }
];

export const defaultAiAssistedRules = [
  {
    id: "smart_field_mapping",
    label: "Smart field mapping",
    description: "Use contextual understanding to map ambiguous or misspelled headers",
    enabled: true
  },
  {
    id: "standardize_companies",
    label: "Standardize company names",
    description: "AI-assisted resolution of corporate legal entities and abbreviations",
    enabled: false
  },
  {
    id: "duplicate_explanation",
    label: "Duplicate explanation",
    description: "Generate clear natural-language rationale for fuzzy duplicate pairings",
    enabled: false
  },
  {
    id: "ambiguous_record_suggestions",
    label: "Ambiguous record suggestions",
    description: "Provide candidate suggestions for unparseable or complex anomalies",
    enabled: false
  }
];
