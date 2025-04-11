const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  studentCount: {
    type: Number,
    required: true
  },
  report: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('Report', ReportSchema);
