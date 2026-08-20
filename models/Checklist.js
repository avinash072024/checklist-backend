const mongoose = require('mongoose');

const checklistSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  listItems: [{
    text: { type: String, required: true },
    completed: { type: Boolean, default: false },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isFreeze: {
    type: Boolean,
    default: false
  },
  frozenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  frozenAt: {
    type: Date,
    default: null
  },
  isPrivate: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index for fast lookups by creator and privacy
checklistSchema.index({ createdBy: 1, isPrivate: 1 });

// Auto-delete checklists 30 days after frozenAt (MongoDB TTL monitor)
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
checklistSchema.index({ frozenAt: 1 }, { expireAfterSeconds: THIRTY_DAYS_IN_SECONDS });

module.exports = mongoose.model('Checklist', checklistSchema);