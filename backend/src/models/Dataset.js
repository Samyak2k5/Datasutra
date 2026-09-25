import mongoose from 'mongoose';

const columnSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    originalName: {
      type: String,
      trim: true
    },
    inferredType: {
      type: String,
      default: 'string'
    },
    nullCount: {
      type: Number,
      default: 0
    },
    uniqueCount: {
      type: Number,
      default: 0
    },
    sampleValues: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    }
  },
  { _id: false }
);

const datasetSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Dataset must belong to a user']
    },
    name: {
      type: String,
      required: [true, 'Dataset name is required'],
      trim: true,
      maxlength: [150, 'Dataset name cannot exceed 150 characters']
    },
    originalFileName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true
    },
    fileType: {
      type: String,
      required: [true, 'File type is required'],
      trim: true,
      lowercase: true
    },
    fileSize: {
      type: Number,
      required: [true, 'File size in bytes is required'],
      min: [0, 'File size cannot be negative']
    },
    storagePath: {
      type: String,
      required: [true, 'Storage path is required'],
      trim: true
    },
    totalRows: {
      type: Number,
      default: 0,
      min: 0
    },
    totalColumns: {
      type: Number,
      default: 0,
      min: 0
    },
    columns: {
      type: [columnSchema],
      default: []
    },
    status: {
      type: String,
      enum: {
        values: ['uploaded', 'processing', 'completed', 'failed', 'archived'],
        message: '{VALUE} is not a valid dataset status'
      },
      default: 'uploaded',
      index: true
    },
    originalFileHash: {
      type: String,
      default: null,
      trim: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    parseError: {
      type: String,
      default: null
    },
    parsedAt: {
      type: Date,
      default: null
    },
    sourceFormat: {
      type: String,
      default: null,
      trim: true,
      lowercase: true
    },
    parserType: {
      type: String,
      default: null,
      trim: true
    },
    parserVersion: {
      type: String,
      default: '1.0.0',
      trim: true
    },
    extractionStatus: {
      type: String,
      enum: ['none', 'extracted', 'ocr_fallback', 'failed'],
      default: 'none'
    },
    pageCount: {
      type: Number,
      default: 0
    },
    tableCount: {
      type: Number,
      default: 0
    },
    extractionMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    documentStructure: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    warnings: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.storagePath;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.storagePath;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes
datasetSchema.index({ owner: 1, createdAt: -1 });
datasetSchema.index({ originalFileHash: 1 });

export const Dataset = mongoose.model('Dataset', datasetSchema);
export default Dataset;
