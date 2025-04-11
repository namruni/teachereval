const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const session = require('express-session');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
require('dotenv').config();

// Connect to MongoDB
connectDB();

// Load models
const Evaluation = require('./models/Evaluation');
const Report = require('./models/Report');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false, // Changed from true to false
  cookie: { secure: false }, // Set to true if using HTTPS
  proxy: true // Trust the reverse proxy when using HTTPS
}));

// Disable warning about MemoryStore in production
app.set('trust proxy', 1);

// Suppress MemoryStore warning for Render deployment

// Simple authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.session.authenticated) {
    return next();
  }
  res.redirect('/login.html');
}

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
const evaluationsFile = path.join(dataDir, 'evaluations.json');
const reportsFile = path.join(dataDir, 'reports.json');

// Make sure data directory exists
if (!fs.existsSync(dataDir)) {
  console.log('Creating data directory...');
  fs.mkdirSync(dataDir, { recursive: true });
}

// Make sure evaluations.json exists
if (!fs.existsSync(evaluationsFile)) {
  console.log('Creating empty evaluations.json file...');
  fs.writeFileSync(evaluationsFile, JSON.stringify([]));
}

// Make sure reports.json exists
if (!fs.existsSync(reportsFile)) {
  console.log('Creating empty reports.json file...');
  fs.writeFileSync(reportsFile, JSON.stringify({
    lastReportCount: 0,
    reports: []
  }));
}

// Log successful initialization
console.log('Data files initialized successfully.');

// Initialize Gemini AI with fallback for deployments without API key
let genAI;
try {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not found in environment variables. Using fallback mode.');
    // Fallback mode will be handled in report generation functions
  } else {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('Gemini AI initialized successfully.');
  }
} catch (error) {
  console.error('Error initializing Gemini AI:', error);
  // Will use fallback mode
}

// Helper function to generate report using Gemini
async function generateStudentReport(evaluation) {
  try {
    // Add a delay to make the spinner visible (at least 1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Check if Gemini API is available
    if (!genAI) {
      console.log('Using fallback student report generator');
      return generateFallbackStudentReport(evaluation);
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = `
    Bir öğrenci aşağıdaki kriterlere göre öğretmeni değerlendirmiştir:
    
    1. Ders Anlatım Kalitesi: ${evaluation.criteria.teaching} / 10
    2. İletişim Becerisi: ${evaluation.criteria.communication} / 10
    3. Alan Bilgisi: ${evaluation.criteria.knowledge} / 10
    4. Öğrenci Desteği: ${evaluation.criteria.support} / 10
    5. Sınıf Yönetimi: ${evaluation.criteria.management} / 10
    
    Öğrencinin ek yorumları: "${evaluation.comments}"
    
    Bu değerlendirmeye dayanarak öğretmen için kişiselleştirilmiş, yapıcı bir geri bildirim raporu oluştur. 
    Güçlü yanları ve geliştirilmesi gereken alanları belirt.
    Raporu en fazla 3 paragraf olacak şekilde kısa tut.
    `;
    
    // Make API call with timeout handling
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Gemini API timeout')), 15000)
    );
    
    const apiPromise = model.generateContent(prompt);
    const result = await Promise.race([apiPromise, timeoutPromise]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    return generateFallbackStudentReport(evaluation);
  }
}

// Fallback function to generate student reports without API
function generateFallbackStudentReport(evaluation) {
  const avgScore = ((
    evaluation.criteria.teaching + 
    evaluation.criteria.communication + 
    evaluation.criteria.knowledge + 
    evaluation.criteria.support + 
    evaluation.criteria.management
  ) / 5).toFixed(1);
  
  const strengths = [];
  const improvements = [];
  
  if (evaluation.criteria.teaching >= 7) strengths.push('ders anlatımı');
  else improvements.push('ders anlatımı');
  
  if (evaluation.criteria.communication >= 7) strengths.push('iletişim becerileri');
  else improvements.push('iletişim becerileri');
  
  if (evaluation.criteria.knowledge >= 7) strengths.push('alan bilgisi');
  else improvements.push('alan bilgisi');
  
  if (evaluation.criteria.support >= 7) strengths.push('öğrenci desteği');
  else improvements.push('öğrenci desteği');
  
  if (evaluation.criteria.management >= 7) strengths.push('sınıf yönetimi');
  else improvements.push('sınıf yönetimi');
  
  let report = `<p>Öğretmenin genel performansı ${avgScore}/10 olarak değerlendirilmiştir.</p>`;
  
  if (strengths.length > 0) {
    report += `<p><strong>Güçlü Yönler:</strong> Öğretmenin ${strengths.join(', ')} konularında güçlü olduğu görülmektedir.</p>`;
  }
  
  if (improvements.length > 0) {
    report += `<p><strong>Geliştirilmesi Gereken Alanlar:</strong> Öğretmenin ${improvements.join(', ')} konularında kendisini geliştirmesi önerilmektedir.</p>`;
  }
  
  if (evaluation.comments) {
    report += `<p><strong>Öğrenci Yorumu:</strong> "${evaluation.comments}" Bu yorum dikkate alınarak öğretmenin gelişimi desteklenmelidir.</p>`;
  }
  
  return report;
}

async function generateOverallReport(evaluations) {
  try {
    // Add a delay to make the spinner visible
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Calculate average scores
    const totalEvaluations = evaluations.length;
    if (totalEvaluations === 0) return "Henüz değerlendirme bulunmamaktadır.";
    
    // Check if we have at least 5 evaluations
    if (totalEvaluations < 5) {
      return `<div class="minimum-evaluations-warning">
        <h3>Yetersiz Değerlendirme Sayısı</h3>
        <p>Toplu değerlendirme raporu oluşturabilmek için en az 5 öğrenci değerlendirmesi gereklidir.</p>
        <p>Şu anda sadece ${totalEvaluations} değerlendirme bulunmaktadır.</p>
        <p>5 değerlendirmeye ulaşıldığında rapor otomatik olarak oluşturulacaktır.</p>
      </div>`;
    }
    
    const avgScores = {
      teaching: 0,
      communication: 0,
      knowledge: 0,
      support: 0,
      management: 0
    };
    
    evaluations.forEach(eval => {
      avgScores.teaching += eval.criteria.teaching;
      avgScores.communication += eval.criteria.communication;
      avgScores.knowledge += eval.criteria.knowledge;
      avgScores.support += eval.criteria.support;
      avgScores.management += eval.criteria.management;
    });
    
    Object.keys(avgScores).forEach(key => {
      avgScores[key] = (avgScores[key] / totalEvaluations).toFixed(1);
    });
    
    // Check if Gemini API is available
    if (!genAI) {
      console.log('Using fallback overall report generator');
      return generateFallbackOverallReport(evaluations, avgScores);
    }
    
    // Collect all comments (limit to latest 10 to avoid token limits)
    let latestEvaluations = evaluations.slice(-10); // Take only the last 10 evaluations
    const allComments = latestEvaluations.map((eval, index) => 
        `Öğrenci ${evaluations.length - latestEvaluations.length + index + 1}: "${eval.comments}"`
    ).join('\n');
    
    // Get previous reports to include in context
    let previousReportsContext = '';
    try {
      const reportsData = JSON.parse(fs.readFileSync(reportsFile));
      if (reportsData.reports.length > 0) {
        // Get the latest valid report (not containing error messages)
        let validReport = reportsData.reports
          .filter(r => !r.report.includes('hata oluştu'))
          .pop();
          
        if (validReport) {
          previousReportsContext = `\nDaha önce ${validReport.studentCount} öğrenci için oluşturulan raporda belirtilen ana noktalar dikkate alınmalıdır. Bu yeni raporu oluştururken, önceki raporu göz önünde bulundurarak güncelle ve yeni bilgilerle zenginleştir.`;
        }
      }
    } catch (error) {
      console.error('Error reading previous reports:', error);
    }
    
    const prompt = `
    Bir öğretmen için ${totalEvaluations} öğrenci aşağıdaki ortalama puanları vermiştir:
    
    1. Ders Anlatım Kalitesi: ${avgScores.teaching} / 10
    2. İletişim Becerisi: ${avgScores.communication} / 10
    3. Alan Bilgisi: ${avgScores.knowledge} / 10
    4. Öğrenci Desteği: ${avgScores.support} / 10
    5. Sınıf Yönetimi: ${avgScores.management} / 10
    
    Öğrencilerin son yorumlarından örnekler:
    ${allComments}${previousReportsContext}
    
    Bu değerlendirmelere dayanarak:
    1. Öğretmen için detaylı ve yapıcı bir geri bildirim raporu oluştur.
    2. Güçlü yönleri ve geliştirilmesi gereken alanları belirle.
    3. 100 üzerinden genel bir öğretmenlik puanı ver ve bunu raporun en başında belirt.
    4. Puanın nasıl hesaplandığını kısaca açıkla.
    `;
    
    // Set a timeout for the API call
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Gemini API timeout')), 15000)
    );
    
    const apiPromise = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(prompt);
    const result = await Promise.race([apiPromise, timeoutPromise]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    return generateFallbackOverallReport(evaluations, calculateAverageScores(evaluations));
  }
}

// Helper function to calculate average scores
function calculateAverageScores(evaluations) {
  const totalEvaluations = evaluations.length;
  if (totalEvaluations === 0) return null;
  
  const avgScores = {
    teaching: 0,
    communication: 0,
    knowledge: 0,
    support: 0,
    management: 0
  };
  
  evaluations.forEach(eval => {
    avgScores.teaching += eval.criteria.teaching;
    avgScores.communication += eval.criteria.communication;
    avgScores.knowledge += eval.criteria.knowledge;
    avgScores.support += eval.criteria.support;
    avgScores.management += eval.criteria.management;
  });
  
  Object.keys(avgScores).forEach(key => {
    avgScores[key] = (avgScores[key] / totalEvaluations).toFixed(1);
  });
  
  return avgScores;
}

// Fallback function to generate overall reports without API
function generateFallbackOverallReport(evaluations, avgScores) {
  if (!avgScores) {
    avgScores = calculateAverageScores(evaluations);
    if (!avgScores) return "Henüz değerlendirme bulunmamaktadır.";
  }
  
  const totalScore = (
    parseFloat(avgScores.teaching) + 
    parseFloat(avgScores.communication) + 
    parseFloat(avgScores.knowledge) + 
    parseFloat(avgScores.support) + 
    parseFloat(avgScores.management)
  );
  
  // Calculate overall score out of 100
  const overallScore = Math.round((totalScore / 50) * 100);
  
  // Determine strengths and areas for improvement
  const strengths = [];
  const improvements = [];
  
  if (avgScores.teaching >= 7) strengths.push('ders anlatımı');
  else improvements.push('ders anlatımı');
  
  if (avgScores.communication >= 7) strengths.push('iletişim becerileri');
  else improvements.push('iletişim becerileri');
  
  if (avgScores.knowledge >= 7) strengths.push('alan bilgisi');
  else improvements.push('alan bilgisi');
  
  if (avgScores.support >= 7) strengths.push('öğrenci desteği');
  else improvements.push('öğrenci desteği');
  
  if (avgScores.management >= 7) strengths.push('sınıf yönetimi');
  else improvements.push('sınıf yönetimi');
  
  // Generate the report
  let report = `<h3>Öğretmen Performans Puanı: ${overallScore}/100</h3>
  
  <p>Bu puan, ${evaluations.length} öğrencinin 5 farklı kriterde verdiği puanların ortalaması alınarak hesaplanmıştır. Değerlendirme 10 üzerinden yapılmış ve 100'lük sisteme çevrilmiştir.</p>
  
  <h4>Kriterler Bazında Değerlendirme:</h4>
  <ul>
    <li>Ders Anlatım Kalitesi: ${avgScores.teaching}/10</li>
    <li>İletişim Becerisi: ${avgScores.communication}/10</li>
    <li>Alan Bilgisi: ${avgScores.knowledge}/10</li>
    <li>Öğrenci Desteği: ${avgScores.support}/10</li>
    <li>Sınıf Yönetimi: ${avgScores.management}/10</li>
  </ul>
  
  <h4>Öğretmenin Güçlü Yönleri:</h4>
  <p>Öğretmenin ${strengths.length > 0 ? strengths.join(', ') : 'tüm alanlarda gelişim göstermesi'} öne çıkmaktadır. Bu alanlarda öğrencilerin memnuniyeti yüksektir.</p>
  
  <h4>Geliştirilmesi Gereken Alanlar:</h4>
  <p>Öğretmenin ${improvements.length > 0 ? improvements.join(', ') : 'belirgin bir zayıf alanı bulunmamakta, ancak mevcut performansını sürdürmesi'} konularında kendisini geliştirmesi önerilmektedir.</p>
  
  <h4>Genel Değerlendirme:</h4>
  <p>Öğretmen genel olarak ${overallScore >= 80 ? 'başarılı' : overallScore >= 60 ? 'orta düzeyde başarılı' : 'gelişmeye açık'} bir performans sergilemektedir. ${evaluations.length} öğrencinin değerlendirmesine göre, ${strengths.length > improvements.length ? 'olumlu yönleri daha fazladır' : improvements.length > strengths.length ? 'geliştirilmesi gereken yönleri bulunmaktadır' : 'güçlü ve gelişmeye açık yönleri dengelidir'}.</p>`;
  
  return report;
}

// Simple authentication routes
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  // Check credentials (simple check for fakimozdemir@gmail.com)
  if (email === 'fakimozdemir@gmail.com' && password === 'teacherpass123') {
    req.session.authenticated = true;
    req.session.user = { email, name: 'Fakım Özdemir' };
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Hatalı kullanıcı adı veya şifre' });
  }
});

app.get('/logout', (req, res) => {
  req.session.authenticated = false;
  req.session.user = null;
  res.redirect('/');
});

app.get('/auth/status', (req, res) => {
  res.json({
    authenticated: !!req.session.authenticated,
    user: req.session.user || null
  });
});

// Routes

// Get all evaluations
app.get('/api/evaluations', ensureAuthenticated, async (req, res) => {
  try {
    // First try MongoDB
    if (mongoose.connection.readyState === 1) { // Connected
      const evaluations = await Evaluation.find().sort({ timestamp: -1 });
      return res.json(evaluations);
    } else {
      // Fallback to file system
      const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
      return res.json(evaluations);
    }
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    // If MongoDB fails, try file system
    try {
      const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
      return res.json(evaluations);
    } catch (fsError) {
      console.error('File system fallback failed:', fsError);
      return res.status(500).json({ error: 'Değerlendirmeler alınamadı.' });
    }
  }
});

// Submit a new evaluation
app.post('/api/evaluations', async (req, res) => {
  try {
    const newEvaluation = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      criteria: req.body.criteria,
      comments: req.body.comments,
      report: '<div class="report-spinner-container"><div class="spinner medium-spinner"></div><p class="student-loading-text">Gemini öğrenci değerlendirmesi oluşturuyor...</p></div>' // Improved student report placeholder
    };
    
    // Try to save to MongoDB first
    let savedEvaluation;
    if (mongoose.connection.readyState === 1) { // Connected
      try {
        savedEvaluation = await new Evaluation(newEvaluation).save();
      } catch (mongoError) {
        console.error('MongoDB save failed, using file system:', mongoError);
        // Fallback to file system if MongoDB fails
        const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
        evaluations.push(newEvaluation);
        fs.writeFileSync(evaluationsFile, JSON.stringify(evaluations, null, 2));
        savedEvaluation = newEvaluation;
      }
    } else {
      // Fallback to file system
      const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
      evaluations.push(newEvaluation);
      fs.writeFileSync(evaluationsFile, JSON.stringify(evaluations, null, 2));
      savedEvaluation = newEvaluation;
    }
    
    // Return the evaluation immediately without waiting for Gemini
    res.status(201).json(savedEvaluation);
    
    // Generate report asynchronously
    generateStudentReport(newEvaluation).then(async report => {
      if (mongoose.connection.readyState === 1) {
        // Update in MongoDB
        try {
          await Evaluation.findOneAndUpdate(
            { id: newEvaluation.id },
            { report: report }
          );
        } catch (mongoError) {
          console.error('MongoDB update failed, using file system:', mongoError);
          // Fallback to file system
          updateEvaluationInFileSystem(newEvaluation.id, report);
        }
      } else {
        // Fallback to file system
        updateEvaluationInFileSystem(newEvaluation.id, report);
      }
      
      // Check if we've hit a new batch of 5 evaluations
      let evaluationCount = 0;
      let lastReportCount = 0;
      
      if (mongoose.connection.readyState === 1) {
        evaluationCount = await Evaluation.countDocuments();
        const lastReport = await Report.findOne().sort({ timestamp: -1 });
        lastReportCount = lastReport ? lastReport.studentCount : 0;
      } else {
        const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
        evaluationCount = evaluations.length;
        const reportsData = JSON.parse(fs.readFileSync(reportsFile));
        lastReportCount = reportsData.lastReportCount;
      }
      
      if (evaluationCount >= 5 && evaluationCount - lastReportCount >= 5) {
        // Get all evaluations for report generation
        let allEvaluations;
        if (mongoose.connection.readyState === 1) {
          allEvaluations = await Evaluation.find();
        } else {
          allEvaluations = JSON.parse(fs.readFileSync(evaluationsFile));
        }
        
        // Trigger a new overall report generation asynchronously
        generateOverallReport(allEvaluations).then(async newOverallReport => {
          if (mongoose.connection.readyState === 1) {
            // Save to MongoDB
            try {
              await new Report({
                timestamp: new Date(),
                studentCount: evaluationCount,
                report: newOverallReport
              }).save();
            } catch (mongoError) {
              console.error('MongoDB report save failed, using file system:', mongoError);
              // Fallback to file system
              saveReportToFileSystem(evaluationCount, newOverallReport);
            }
          } else {
            // Fallback to file system
            saveReportToFileSystem(evaluationCount, newOverallReport);
          }
        }).catch(error => {
          console.error('Error generating overall report:', error);
        });
      }
    }).catch(error => {
      console.error('Error generating report:', error);
    });
    
  } catch (error) {
    console.error('Error saving evaluation:', error);
    res.status(500).json({ error: 'Değerlendirme kaydedilirken bir hata oluştu.' });
  }
});

// Helper function to update evaluation report in file system
function updateEvaluationInFileSystem(evaluationId, report) {
  try {
    const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
    const evalIndex = evaluations.findIndex(e => e.id === evaluationId);
    
    if (evalIndex !== -1) {
      evaluations[evalIndex].report = report;
      fs.writeFileSync(evaluationsFile, JSON.stringify(evaluations, null, 2));
    }
  } catch (error) {
    console.error('Error updating evaluation in file system:', error);
  }
}

// Helper function to save report to file system
function saveReportToFileSystem(evaluationCount, newOverallReport) {
  try {
    const reportsData = JSON.parse(fs.readFileSync(reportsFile));
    
    reportsData.lastReportCount = evaluationCount;
    reportsData.reports.push({
      timestamp: new Date().toISOString(),
      studentCount: evaluationCount,
      report: newOverallReport
    });
    
    fs.writeFileSync(reportsFile, JSON.stringify(reportsData, null, 2));
  } catch (error) {
    console.error('Error saving report to file system:', error);
  }
}

// Delete an evaluation
app.delete('/api/evaluations/:id', ensureAuthenticated, async (req, res) => {
  try {
    let deleted = false;
    
    // Try MongoDB first
    if (mongoose.connection.readyState === 1) {
      try {
        const result = await Evaluation.deleteOne({ id: req.params.id });
        if (result.deletedCount > 0) {
          deleted = true;
        }
      } catch (mongoError) {
        console.error('MongoDB delete failed:', mongoError);
      }
    }
    
    // If MongoDB failed or is not connected, try file system
    if (!deleted) {
      const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
      const filteredEvaluations = evaluations.filter(eval => eval.id !== req.params.id);
      
      if (filteredEvaluations.length < evaluations.length) {
        fs.writeFileSync(evaluationsFile, JSON.stringify(filteredEvaluations, null, 2));
        deleted = true;
      }
    }
    
    if (deleted) {
      res.status(200).json({ message: 'Değerlendirme silindi.' });
    } else {
      res.status(404).json({ error: 'Değerlendirme bulunamadı.' });
    }
  } catch (error) {
    console.error('Error deleting evaluation:', error);
    res.status(500).json({ error: 'Değerlendirme silinirken bir hata oluştu.' });
  }
});

// Get saved reports and current overall report
app.get('/api/report', ensureAuthenticated, async (req, res) => {
  try {
    let evaluations = [];
    let reports = [];
    let lastReportCount = 0;
    
    // Try to get data from MongoDB first
    if (mongoose.connection.readyState === 1) {
      try {
        evaluations = await Evaluation.find();
        const reportDocs = await Report.find().sort({ timestamp: -1 });
        reports = reportDocs;
        lastReportCount = reportDocs.length > 0 ? reportDocs[0].studentCount : 0;
      } catch (mongoError) {
        console.error('MongoDB report fetch failed:', mongoError);
        // Fallback to file system
        evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
        const reportsData = JSON.parse(fs.readFileSync(reportsFile));
        reports = reportsData.reports;
        lastReportCount = reportsData.lastReportCount;
      }
    } else {
      // Fallback to file system
      evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
      const reportsData = JSON.parse(fs.readFileSync(reportsFile));
      reports = reportsData.reports;
      lastReportCount = reportsData.lastReportCount;
    }
    
    // Check if we need to generate a new report (every 5 evaluations)
    if (evaluations.length >= 5 && evaluations.length - lastReportCount >= 5) {
      // Time to generate a new report
      const newReport = await generateOverallReport(evaluations);
      
      // Save the new report
      if (mongoose.connection.readyState === 1) {
        try {
          await new Report({
            timestamp: new Date(),
            studentCount: evaluations.length,
            report: newReport
          }).save();
        } catch (mongoError) {
          console.error('MongoDB report save failed:', mongoError);
          // Fallback to file system
          saveReportToFileSystem(evaluations.length, newReport);
        }
      } else {
        // Fallback to file system
        saveReportToFileSystem(evaluations.length, newReport);
      }
      
      res.json({ report: newReport, reportHistory: reports });
    } else {
      // Return the most recent report if exists, otherwise a placeholder
      const latestReport = reports.length > 0 
        ? reports[0].report 
        : evaluations.length < 5 
          ? `Henüz yeterli değerlendirme bulunmamaktadır. İlk rapor 5 öğrenci değerlendirmesinden sonra oluşturulacaktır. Şu ana kadar ${evaluations.length} değerlendirme yapılmıştır.` 
          : `Bir sonraki rapor ${5 - (evaluations.length - lastReportCount)} değerlendirme daha yapıldıktan sonra oluşturulacaktır.`;
      
      res.json({ report: latestReport, reportHistory: reports });
    }
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Rapor oluşturulurken bir hata oluştu.' });
  }
});

// Serve the student page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Protect teacher routes
app.use(['/teacher', '/teacher.html'], (req, res, next) => {
  if (!req.session.authenticated) {
    return res.redirect('/login.html');
  }
  next();
});

// Serve the teacher page
app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});



// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Authentication: Only fakimozdemir@gmail.com can access teacher panel`);
});
