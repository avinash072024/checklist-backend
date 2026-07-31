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
  isPrivate: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index for fast lookups by creator and privacy
checklistSchema.index({ createdBy: 1, isPrivate: 1 });
checklistSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Checklist', checklistSchema);