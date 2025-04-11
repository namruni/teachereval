const mongoose = require('mongoose');

const EvaluationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  criteria: {
    teaching: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    communication: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    knowledge: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    support: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    management: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    }
  },
  comments: {
    type: String,
    required: true
  },
  report: {
    type: String,
    default: ''
  }
});

module.exports = mongoose.model('Evaluation', EvaluationSchema);
