import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    dataset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      index: true
    },
    cleaningJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CleaningJob',
      index: true
    },
    action: {
      type: String,
      required: [true, 'Audit action is required'],
      trim: true
    },
    entityType: {
      type: String,
      required: [true, 'Entity type is required'],
      trim: true
    },
    entityId: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    source: {
      type: String,
      enum: {
        values: ['system', 'user', 'rule_engine', 'ai', 'batch_processor'],
        message: '{VALUE} is not a valid audit source'
      },
      default: 'system'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

// Indexes
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ dataset: 1, createdAt: -1 });
auditLogSchema.index({ cleaningJob: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
