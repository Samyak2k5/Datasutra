import mongoose from 'mongoose';

const cleaningRuleSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Cleaning rule must belong to a user']
    },
    name: {
      type: String,
      required: [true, 'Rule name is required'],
      trim: true,
      maxlength: [100, 'Rule name cannot exceed 100 characters']
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    field: {
      type: String,
      required: [true, 'Target field is required'],
      trim: true
    },
    ruleType: {
      type: String,
      enum: {
        values: [
          'email_normalization',
          'phone_normalization',
          'name_normalization',
          'city_normalization',
          'missing_value',
          'duplicate_detection',
          'format_validation',
          'custom'
        ],
        message: '{VALUE} is not a valid cleaning rule type'
      },
      required: [true, 'Rule type is required']
    },
    configuration: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    isEnabled: {
      type: Boolean,
      default: true,
      index: true
    },
    priority: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Indexes
cleaningRuleSchema.index({ owner: 1, isEnabled: 1 });
cleaningRuleSchema.index({ owner: 1, priority: -1 });

export const CleaningRule = mongoose.model('CleaningRule', cleaningRuleSchema);
export default CleaningRule;
