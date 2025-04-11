const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

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

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

if (!fs.existsSync(evaluationsFile)) {
  fs.writeFileSync(evaluationsFile, JSON.stringify([]));
}

if (!fs.existsSync(reportsFile)) {
  fs.writeFileSync(reportsFile, JSON.stringify({
    lastReportCount: 0,
    reports: []
  }));
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to generate report using Gemini
async function generateStudentReport(evaluation) {
  try {
    // Add a delay to make the spinner visible (at least 1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
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
    return `<div class="api-error">Gemini raporu oluşturulamadı.<br>Hata: ${error.message || 'Bilinmeyen hata'}</div>`;
  }
}

async function generateOverallReport(evaluations) {
  try {
    // Add a delay to make the spinner visible
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Calculate average scores
    const totalEvaluations = evaluations.length;
    if (totalEvaluations === 0) return "Henüz değerlendirme bulunmamaktadır.";
    
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
    // Return a more informative error message
    return `Toplu rapor oluşturulurken bir hata oluştu: ${error.message || 'Bilinmeyen hata'}. Lütfen daha sonra tekrar deneyiniz.`;
  }
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
app.get('/api/evaluations', ensureAuthenticated, (req, res) => {
  const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
  res.json(evaluations);
});

// Submit a new evaluation
app.post('/api/evaluations', async (req, res) => {
  try {
    const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
    
    const newEvaluation = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      criteria: req.body.criteria,
      comments: req.body.comments,
      report: '<div class="report-spinner-container"><div class="spinner medium-spinner"></div><p class="student-loading-text">Gemini öğrenci değerlendirmesi oluşturuyor...</p></div>' // Improved student report placeholder
    };
    
    // Add evaluation immediately to database
    evaluations.push(newEvaluation);
    fs.writeFileSync(evaluationsFile, JSON.stringify(evaluations, null, 2));
    
    // Return the evaluation immediately without waiting for Gemini
    res.status(201).json(newEvaluation);
    
    // Generate report asynchronously
    generateStudentReport(newEvaluation).then(report => {
      // Update the evaluation with the generated report
      const updatedEvaluations = JSON.parse(fs.readFileSync(evaluationsFile));
      const evalIndex = updatedEvaluations.findIndex(e => e.id === newEvaluation.id);
      
      if (evalIndex !== -1) {
        updatedEvaluations[evalIndex].report = report;
        fs.writeFileSync(evaluationsFile, JSON.stringify(updatedEvaluations, null, 2));
      }
      
      // Check if we've hit a new batch of 5 evaluations
      const reportsData = JSON.parse(fs.readFileSync(reportsFile));
      if (updatedEvaluations.length >= 5 && updatedEvaluations.length - reportsData.lastReportCount >= 5) {
        // Trigger a new overall report generation asynchronously
        generateOverallReport(updatedEvaluations).then(newOverallReport => {
          const currentReportsData = JSON.parse(fs.readFileSync(reportsFile));
          
          currentReportsData.lastReportCount = updatedEvaluations.length;
          currentReportsData.reports.push({
            timestamp: new Date().toISOString(),
            studentCount: updatedEvaluations.length,
            report: newOverallReport
          });
          
          fs.writeFileSync(reportsFile, JSON.stringify(currentReportsData, null, 2));
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

// Delete an evaluation
app.delete('/api/evaluations/:id', ensureAuthenticated, (req, res) => {
  try {
    const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
    const filteredEvaluations = evaluations.filter(eval => eval.id !== req.params.id);
    
    fs.writeFileSync(evaluationsFile, JSON.stringify(filteredEvaluations, null, 2));
    res.status(200).json({ message: 'Değerlendirme silindi.' });
  } catch (error) {
    console.error('Error deleting evaluation:', error);
    res.status(500).json({ error: 'Değerlendirme silinirken bir hata oluştu.' });
  }
});

// Get saved reports and current overall report
app.get('/api/report', ensureAuthenticated, async (req, res) => {
  try {
    const evaluations = JSON.parse(fs.readFileSync(evaluationsFile));
    const reportsData = JSON.parse(fs.readFileSync(reportsFile));
    
    // Check if we need to generate a new report (every 5 evaluations)
    if (evaluations.length >= 5 && evaluations.length - reportsData.lastReportCount >= 5) {
      // Time to generate a new report
      const newReport = await generateOverallReport(evaluations);
      
      // Save the new report
      reportsData.lastReportCount = evaluations.length;
      reportsData.reports.push({
        timestamp: new Date().toISOString(),
        studentCount: evaluations.length,
        report: newReport
      });
      
      fs.writeFileSync(reportsFile, JSON.stringify(reportsData, null, 2));
      
      res.json({ report: newReport, reportHistory: reportsData.reports });
    } else {
      // Return the most recent report if exists, otherwise a placeholder
      const latestReport = reportsData.reports.length > 0 
        ? reportsData.reports[reportsData.reports.length - 1].report 
        : evaluations.length < 5 
          ? `Henüz yeterli değerlendirme bulunmamaktadır. İlk rapor 5 öğrenci değerlendirmesinden sonra oluşturulacaktır. Şu ana kadar ${evaluations.length} değerlendirme yapılmıştır.` 
          : `Bir sonraki rapor ${5 - (evaluations.length - reportsData.lastReportCount)} değerlendirme daha yapıldıktan sonra oluşturulacaktır.`;
      
      res.json({ report: latestReport, reportHistory: reportsData.reports });
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
