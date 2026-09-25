import mongoose from 'mongoose';

const reviewItemSchema = new mongoose.Schema(
  {
    reviewId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
      index: true
    },
    dataset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true
    },
    cleaningJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CleaningJob',
      required: true
    },
    rowNumber: {
      type: Number,
      required: true
    },
    field: {
      type: String,
      required: true
    },
    originalValue: {
      type: mongoose.Schema.Types.Mixed,
      default: ''
    },
    suggestedValue: {
      type: mongoose.Schema.Types.Mixed,
      default: ''
    },
    approvedValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    source: {
      type: String,
      enum: ['rule_engine', 'ai', 'parser', 'duplicate_detection', 'deterministic', 'duplicate'],
      default: 'ai'
    },
    reason: {
      type: String,
      default: ''
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    confidence: {
      type: Number,
      default: 0.8,
      min: 0,
      max: 1
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'edited'],
      default: 'pending',
      index: true
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    provenance: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.reviewId;
        delete ret.__v;
        return ret;
      }
    }
  }
);

const cleaningJobSchema = new mongoose.Schema(
  {
    dataset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: [true, 'Cleaning job must reference a dataset']
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Cleaning job must belong to a user']
    },
    status: {
      type: String,
      enum: {
        values: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
        message: '{VALUE} is not a valid cleaning job status'
      },
      default: 'queued',
      index: true
    },
    cleaningMode: {
      type: String,
      enum: {
        values: ['rules_only', 'rules_then_ai'],
        message: '{VALUE} is not a valid cleaning mode'
      },
      default: 'rules_only'
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    totalRecords: {
      type: Number,
      default: 0,
      min: 0
    },
    cleanedRecords: {
      type: Number,
      default: 0,
      min: 0
    },
    modifiedRecords: {
      type: Number,
      default: 0,
      min: 0
    },
    duplicateRecords: {
      type: Number,
      default: 0,
      min: 0
    },
    totalDuplicateGroups: {
      type: Number,
      default: 0,
      min: 0
    },
    missingValueRecords: {
      type: Number,
      default: 0,
      min: 0
    },
    rowsWithMissingValues: {
      type: Number,
      default: 0,
      min: 0
    },
    resolvedMissingValues: {
      type: Number,
      default: 0,
      min: 0
    },
    unresolvedMissingValues: {
      type: Number,
      default: 0,
      min: 0
    },
    missingConflicts: {
      type: Number,
      default: 0,
      min: 0
    },
    imputedFieldCount: {
      type: Number,
      default: 0,
      min: 0
    },
    fieldsImputed: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    unresolvedRecords: {
      type: Number,
      default: 0,
      min: 0
    },
    aiProcessedRecords: {
      type: Number,
      default: 0,
      min: 0
    },
    aiCandidates: {
      type: Number,
      default: 0,
      min: 0
    },
    aiProcessed: {
      type: Number,
      default: 0,
      min: 0
    },
    aiSuggestions: {
      type: Number,
      default: 0,
      min: 0
    },
    aiApplied: {
      type: Number,
      default: 0,
      min: 0
    },
    aiNeedsReview: {
      type: Number,
      default: 0,
      min: 0
    },
    aiRejected: {
      type: Number,
      default: 0,
      min: 0
    },
    aiFailed: {
      type: Number,
      default: 0,
      min: 0
    },
    aiProvider: {
      type: String,
      default: null
    },
    aiModel: {
      type: String,
      default: null
    },
    aiUsage: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    errorCount: {
      type: Number,
      default: 0,
      min: 0
    },
    configuration: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    report: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    errorMessage: {
      type: String,
      default: null
    },
    metrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    preview: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    duplicateGroups: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    progressPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    processedRecords: {
      type: Number,
      default: 0,
      min: 0
    },
    currentBatch: {
      type: Number,
      default: 0,
      min: 0
    },
    totalBatches: {
      type: Number,
      default: 0,
      min: 0
    },
    batchSize: {
      type: Number,
      default: 500
    },
    processingMode: {
      type: String,
      enum: ['in_memory', 'batch_streaming'],
      default: 'in_memory'
    },
    extractionMetrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    reviewItems: {
      type: [reviewItemSchema],
      default: []
    },
    qualityScore: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        overall: 100,
        completeness: 100,
        validity: 100,
        uniqueness: 100,
        consistency: 100,
        dimensions: {}
      }
    },
    fieldQuality: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    transformationLog: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes
cleaningJobSchema.index({ createdAt: -1 });
cleaningJobSchema.index({ owner: 1, status: 1 });
cleaningJobSchema.index({ dataset: 1, createdAt: -1 });

export const CleaningJob = mongoose.model('CleaningJob', cleaningJobSchema);
export default CleaningJob;
