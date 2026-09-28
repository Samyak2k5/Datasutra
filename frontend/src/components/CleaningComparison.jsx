const pairs = [
  ['Original rows', 'originalRows', 'Final rows', 'finalRows'],
  ['Missing values before', 'missingValuesBefore', 'Missing values after', 'missingValuesAfter'],
  ['Duplicate groups before', 'duplicateGroupsBefore', 'Duplicate groups after', 'duplicateGroupsAfter'],
  ['Invalid emails before', 'invalidEmailsBefore', 'Invalid emails after', 'invalidEmailsAfter'],
  ['Invalid/non-canonical phones before', 'invalidPhonesBefore', 'Invalid/non-canonical phones after', 'invalidPhonesAfter'],
  ['Name/city inconsistencies before', 'nameCityInconsistenciesBefore', 'Name/city inconsistencies after', 'nameCityInconsistenciesAfter']
];
export default function CleaningComparison({ report }) {
  if (!report) return null;
  const { metrics, apiCalls } = report;
  return <section className="ds-card" style={{ padding: 24, margin: '24px 0' }} aria-label="Before and after cleaning report">
    <h2>BEFORE / AFTER Cleaning Report</h2>
    <div style={{ overflowX: 'auto' }}><table className="ds-table" style={{ width: '100%' }}>
      <thead><tr><th colSpan={2}>BEFORE</th><th colSpan={2}>AFTER</th></tr></thead>
      <tbody>{pairs.map(([before, beforeKey, after, afterKey]) => <tr key={beforeKey}>
        <th scope="row">{before}:</th><td>{metrics[beforeKey]}</td><th scope="row">{after}:</th><td>{metrics[afterKey]}</td>
      </tr>)}</tbody>
    </table></div>
    <p><strong>Semantic/manual review records:</strong> {metrics.semanticManualReviewRecords}</p>
    <p><strong>Processing time:</strong> {(metrics.processingTimeMs / 1000).toFixed(2)} seconds</p>
    <p><strong>LLM/API calls:</strong> {metrics.llmApiCalls} <span className="ai-note">(embeddings: {apiCalls.embeddings}, chat: {apiCalls.chat}; failed requests: {apiCalls.failed})</span></p>
    <p className="ai-note">{report.scope} Processing time includes active planning and execution, excluding time spent reviewing the plan. Counts include successful OpenAI HTTP requests in this plan and execution; previously cached embeddings add zero calls. This report is the snapshot at cleaning completion.</p>
    {report.documentMetrics && <p>Extracted content characters: {report.documentMetrics.extractedCharactersBefore} before / {report.documentMetrics.extractedCharactersAfter} after. Extracted sections: {report.documentMetrics.extractedSections ?? 'Not applicable'}.</p>}
    <h3>AI Summary</h3>
    <p>{report.summary || (report.summaryError ? 'AI summary unavailable: ' + report.summaryError : 'No AI summary was requested for this deterministic cleaning job.')}</p>
    <h3>Cleaning Recommendations</h3>
    {report.recommendations.length ? <ul>{report.recommendations.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p>No AI recommendations returned.</p>}
    {report.issues.length > 0 && <><h3>Remaining Issues</h3><ul>{report.issues.map((issue, index) => <li key={index}>{issue.column && issue.column + ': '}{issue.description} ({issue.severity})</li>)}</ul></>}
  </section>;
}
