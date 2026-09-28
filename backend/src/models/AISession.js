import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dataset: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true, index: true },
  operations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  result: mongoose.Schema.Types.Mixed,
  apiCalls: mongoose.Schema.Types.Mixed,
  processingTimeMs: Number,
  sourceHash: String,
  status: { type: String, enum: ['planned', 'executing', 'completed'], default: 'planned' },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'CleaningJob', default: null }
}, { timestamps: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
export default mongoose.model('AISession', schema);
