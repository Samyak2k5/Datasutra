import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import api from '../services/api';
import Button from './Button';
import RequestError from './RequestError';
import './DatasetAI.css';
import CleaningComparison from './CleaningComparison';

const labels = { trim_whitespace: 'Trim and collapse whitespace', normalize_email: 'Normalize email',
  standardize_phone: 'Standardize phone numbers', standardize_name: 'Standardize names',
  standardize_location: 'Standardize locations', detect_duplicates: 'Flag duplicate records', flag_missing_values: 'Flag missing values' };
const operationLabel = operation => labels[operation.type] + (operation.column === null ? ' · all columns' : ' · ' + operation.column);

export default function DatasetAI({ datasetId }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [plan, setPlan] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [embeddings, setEmbeddings] = useState(null);
  const [report, setReport] = useState(null);
  async function run(action, payload = {}) {
    setBusy(action); setError(null);
    try {
      const response = await api.datasetAI(datasetId, action, payload);
      const result = response.data;
      if (result.embeddings) setEmbeddings(result.embeddings);
      if (action === 'embeddings') setEmbeddings(result);
      else if (action === 'analyze') setAnalysis(result);
      else if (action === 'cleaning-suggestions') setSuggestions(result);
      else if (action === 'command') { setPlan(result); setJobId(null); }
      else {
        if (!result?.job?.id) throw new Error('The server did not return a cleaning job ID.');
        setJobId(result.job.id); setReport(result.comparisonReport);
        if (result.aiError) setError(result.aiError);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  function reviewSuggestion(item) {
    setReport(null);
    setPlan({ sessionId: suggestions.sessionId, supported: true, message: item.suggestedAction, operations: [item.operation] });
    setJobId(null); setError(null);
  }
  return <section className="ds-card dataset-ai" aria-labelledby="dataset-ai-title">
    <div className="ai-heading"><Sparkles size={22} /><h2 id="dataset-ai-title">Ask DataSutra AI</h2></div>
    <p>Analyze a sample, explore issues, and review a cleaning plan before applying it.</p>
    <p className="ai-note">The embedding stage stores up to 80 chunks of 1,200 characters in local Qdrant. Chat receives a bounded sample and retrieved chunks. This demo supports up to 2,000 extracted records. API usage may incur charges.</p>
    <div className="ai-actions">
      <Button variant="secondary" disabled={!!busy} loading={busy === 'embeddings'} onClick={() => run('embeddings')}>Prepare Embeddings</Button>
      <Button disabled={!!busy} loading={busy === 'analyze'} onClick={() => run('analyze')}>Analyze with AI</Button>
      <Button variant="secondary" disabled={!!busy} loading={busy === 'cleaning-suggestions'} onClick={() => run('cleaning-suggestions')}>Cleaning Suggestions</Button>
    </div>
    {embeddings && <p role="status">{embeddings.storedChunks} {embeddings.representation} stored in Qdrant · {embeddings.model}{embeddings.reused ? " · reused existing vectors" : ""}{embeddings.truncated ? " · limited to the first 80 chunks" : ""}</p>}
    <RequestError message={error} />
    {busy && <p role="status">{busy === 'execute' ? 'Applying reviewed operations…' : 'Waiting for AI response…'}</p>}
    {analysis && <div className="ai-result">
      <h3>AI Dataset Summary</h3><p>{analysis.summary}</p>
      <p className="ai-note">{analysis.sample?.limitations}</p>
      <details><summary>Column analysis ({analysis.columns.length})</summary>
        <ul>{analysis.columns.map(column => <li key={column.name}><strong>{column.name}</strong> · {column.type}{column.issues.length > 0 && ': ' + column.issues.join('; ')}</li>)}</ul>
      </details>
      <h3>Issues Found</h3>
      {!analysis.issues.length && <p>No issues reported in this sample.</p>}
      <div className="ai-grid">{analysis.issues.map((issue, index) => <article className="ai-issue" key={index}>
        <span className={'ai-severity ai-severity-' + issue.severity}>{issue.severity}</span>
        <h4>{issue.type.replaceAll('_', ' ')}{issue.column && ' · ' + issue.column}</h4>
        <p>{issue.description}</p><p><strong>Suggestion:</strong> {issue.suggestion}</p>
      </article>)}</div>
      <h3>Recommendations</h3><ul>{analysis.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </div>}
    {suggestions && <div className="ai-result"><h3>Cleaning Suggestions</h3>
      {!suggestions.suggestions.length && <p>No cleaning suggestions returned for this sample.</p>}
      <div className="ai-grid">{suggestions.suggestions.map((item, index) => <article className="ai-issue" key={index}>
        <span className={'ai-severity ai-severity-' + item.severity}>{item.severity}</span>
        <h4>{item.issue}</h4><p>{item.explanation}</p><p><strong>Suggested action:</strong> {item.suggestedAction}</p>
        {item.operation ? <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => reviewSuggestion(item)}>Review this operation</Button> : <p className="ai-note">Manual review required; no automated operation available.</p>}
      </article>)}</div>
    </div>}
    <form className="ai-command" onSubmit={event => { event.preventDefault(); setPlan(null); setJobId(null); setReport(null); run('command', { instruction: instruction.trim() }); }}>
      <label htmlFor={'ai-command-' + datasetId}>Tell DataSutra what you want to clean</label>
      <textarea id={'ai-command-' + datasetId} className="ds-input" rows={3} maxLength={1000} required disabled={!!busy} value={instruction}
        placeholder="Standardize phone numbers and flag missing values…" onChange={event => { setInstruction(event.target.value); setPlan(null); setJobId(null); }} />
      <p className="ai-note">Supports formatting, duplicate detection and missing-value flags. Deleting rows and filling values are not supported. AI plan execution supports up to 2,000 extracted records.</p>
      <Button type="submit" disabled={!!busy || !instruction.trim()} loading={busy === 'command'}>Generate Cleaning Plan</Button>
    </form>
    {plan && <div className="ai-result" aria-live="polite"><h3>Review Cleaning Plan</h3><p>{plan.message}</p>
      {plan.supported && <><ol>{plan.operations.map((operation, index) => <li key={index}>{operationLabel(operation)}</li>)}</ol>
        <details><summary>Structured operations</summary><pre>{JSON.stringify({ operations: plan.operations }, null, 2)}</pre></details>
        <p className="ai-note">Applies only these operations to the dataset and creates a cleaning job. Your original upload is retained.</p>
        <Button disabled={!!busy || !!jobId} loading={busy === 'execute'} onClick={() => run('execute', { operations: plan.operations, ...(plan.sessionId ? { sessionId: plan.sessionId } : {}) })}>Apply Reviewed Plan</Button>
      </>}
      {!plan.supported && <p>No operations will be executed.</p>}
      {jobId && <p role="status">Plan applied. <Link to={'/results?jobId=' + encodeURIComponent(jobId)}>View cleaning results</Link></p>}
    </div>}
    <CleaningComparison report={report} />
  </section>;
}
