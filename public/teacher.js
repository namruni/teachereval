document.addEventListener('DOMContentLoaded', () => {
    const evaluationListContainer = document.getElementById('evaluation-list');
    const overallReportContainer = document.getElementById('overall-report-content');
    const overallScoreDisplay = document.getElementById('overall-score-display');
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Add logout button to header
    const header = document.querySelector('header');
    if (header) {
        const logoutButton = document.createElement('a');
        logoutButton.href = '/logout';
        logoutButton.className = 'logout-button';
        logoutButton.innerHTML = '<i class="fas fa-sign-out-alt"></i> Çıkış Yap';
        header.appendChild(logoutButton);
    }
    
    // Set up auto-refresh for real-time updates
    let autoRefreshInterval;
    const REFRESH_INTERVAL = 2000; // Refresh every 2 seconds
    
    // Tab switching functionality
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });
        });
    });
    
    // Load all evaluations
    async function loadEvaluations(showLoading = true) {
        try {
            const response = await fetch('/api/evaluations');
            if (!response.ok) {
                throw new Error('Değerlendirmeler yüklenirken bir hata oluştu.');
            }
            
            const evaluations = await response.json();
            
            if (evaluations.length === 0) {
                if (showLoading || evaluationListContainer.innerHTML === '') {
                    evaluationListContainer.innerHTML = '<p>Henüz hiç değerlendirme bulunmamaktadır.</p>';
                }
                return;
            }
            
            // Render evaluations
            const evaluationsHTML = evaluations.map(evaluation => {
                const date = new Date(evaluation.timestamp).toLocaleString('tr-TR');
                
                return `
                <div class="evaluation-item" data-id="${evaluation.id}">
                    <div class="evaluation-header">
                        <h3>Değerlendirme #${evaluation.id.slice(-4)}</h3>
                        <span class="evaluation-date">${date}</span>
                    </div>
                    
                    <div class="evaluation-scores">
                        <div class="score-item">
                            <div class="score-label">Ders Anlatım</div>
                            <div class="score-value">${evaluation.criteria.teaching}/10</div>
                        </div>
                        <div class="score-item">
                            <div class="score-label">İletişim</div>
                            <div class="score-value">${evaluation.criteria.communication}/10</div>
                        </div>
                        <div class="score-item">
                            <div class="score-label">Alan Bilgisi</div>
                            <div class="score-value">${evaluation.criteria.knowledge}/10</div>
                        </div>
                        <div class="score-item">
                            <div class="score-label">Öğrenci Desteği</div>
                            <div class="score-value">${evaluation.criteria.support}/10</div>
                        </div>
                        <div class="score-item">
                            <div class="score-label">Sınıf Yönetimi</div>
                            <div class="score-value">${evaluation.criteria.management}/10</div>
                        </div>
                    </div>
                    
                    <div class="evaluation-comment">
                        <strong>Öğrenci Yorumu:</strong>
                        <p>${evaluation.comments || 'Yorum yapılmamış'}</p>
                    </div>
                    
                    <div class="evaluation-report">
                        <strong>Gemini Raporu:</strong>
                        ${evaluation.report && evaluation.report.includes('loading-text') ? 
                            `<div class="report-spinner-container">
                                <div class="spinner medium-spinner"></div>
                                <p class="student-loading-text">Gemini öğrenci değerlendirmesi oluşturuyor...</p>
                            </div>` : 
                            `<p>${evaluation.report || 'Rapor yüklenemedi'}</p>`
                        }
                    </div>
                    
                    <div class="action-buttons">
                        <button class="delete-btn" data-id="${evaluation.id}">Değerlendirmeyi Sil</button>
                    </div>
                </div>
                `;
            }).join('');
            
            // Only update if content has changed or we're showing loading
            const currentEvals = evaluationListContainer.innerHTML;
            if (showLoading || currentEvals !== evaluationsHTML) {
                evaluationListContainer.innerHTML = evaluationsHTML;
                
                // Add event listeners to delete buttons
                document.querySelectorAll('.delete-btn').forEach(button => {
                    button.addEventListener('click', deleteEvaluation);
                });
            }
            
            // Event listeners are now added in the block above
            
        } catch (error) {
            console.error('Error:', error);
            if (showLoading) {
                evaluationListContainer.innerHTML = '<div class="loading-text"><div class="spinner"></div>Değerlendirmeler yükleniyor...</div>';
            }
        }
    }
    
    // Load overall report
    async function loadOverallReport(showLoading = true) {
        try {
            const response = await fetch('/api/report');
            if (!response.ok) {
                throw new Error('Rapor yüklenirken bir hata oluştu.');
            }
            
            const responseData = await response.json();
            const reportContent = responseData.report;
            const reportHistory = responseData.reportHistory || [];
            const evaluationCount = responseData.evaluationCount || 0;
            
            // Update the evaluation count display
            const evaluationCountElement = document.getElementById('evaluation-count');
            if (evaluationCountElement) {
                evaluationCountElement.textContent = evaluationCount;
                
                // Add visual indication if below threshold
                if (evaluationCount < 5) {
                    evaluationCountElement.classList.add('below-threshold');
                } else {
                    evaluationCountElement.classList.remove('below-threshold');
                }
            }
            
            // Create overall report content
            let reportHTML = '';
            
            // Öğrenci sayısı 5'ten az ise güncel rapor yerine uyarı göster, ancak geçmiş raporları göstermeye devam et
            const showCurrentReportWarning = evaluationCount < 5;
            
            if (showCurrentReportWarning) {
                reportHTML = `<div class="minimum-evaluations-warning">
                    <h3>Yetersiz Değerlendirme Sayısı</h3>
                    <p>Güncel toplu değerlendirme raporu oluşturulamadı. En az 5 öğrenci değerlendirmesi gereklidir.</p>
                    <p>Şu anda sadece ${evaluationCount} değerlendirme bulunmaktadır.</p>
                    <p>5 değerlendirmeye ulaşıldığında güncel rapor otomatik olarak oluşturulacaktır.</p>
                </div>`;
                
                // Puanı kaldır ya da sıfırla
                const scoreDisplay = document.getElementById('overall-score-display');
                if (scoreDisplay) {
                    scoreDisplay.textContent = '--';
                }
            }
            
            if (reportHistory.length > 0) {
                // Add report history container
                reportHTML += `<div class="report-history-container">`;
                
                // İlk raporu (güncel rapor) öğrenci sayısı 5'in altındaysa uyarı olarak, değilse normal göster
                if (showCurrentReportWarning) {
                    reportHTML += `
                        <div class="minimum-evaluations-warning">
                            <h3>Yetersiz Değerlendirme Sayısı</h3>
                            <p>Güncel toplu değerlendirme raporu oluşturulamadı. En az 5 öğrenci değerlendirmesi gereklidir.</p>
                            <p>Şu anda sadece ${evaluationCount} değerlendirme bulunmaktadır.</p>
                            <p>5 değerlendirmeye ulaşıldığında güncel rapor otomatik olarak oluşturulacaktır.</p>
                        </div>
                    `;
                    
                    // Eğer sadece bir rapor varsa ve o da yetersiz sayıda öğrenci varsa, puanı kaldır
                    if (reportHistory.length === 1) {
                        overallScoreDisplay.textContent = '--';
                    }
                } else {
                    reportHTML += `<div class="current-report">${reportHistory[0].report}</div>`;
                }
                
                // Rapor geçmişi seçiciyi sadece birden fazla rapor varsa göster
                if (reportHistory.length > 1) {
                    reportHTML += `
                        <div class="report-batch-info">
                            <h3>📈 Rapor Geçmişi</h3>
                            <p>Her 5 öğrenci değerlendirmesi sonrasında yeni bir rapor oluşurulmuştur.</p>
                            <select id="report-history-select" class="report-selector">
                    `;
                    
                    // Add options for each report batch
                    reportHistory.forEach((report, index) => {
                        const date = new Date(report.timestamp).toLocaleDateString('tr-TR');
                        const time = new Date(report.timestamp).toLocaleTimeString('tr-TR');
                        
                        // Eğer güncel rapor (index 0) ve öğrenci sayısı 5'in altındaysa bu raporu devre dışı bırak
                        const disabledAttr = (index === 0 && showCurrentReportWarning) ? 'disabled' : '';
                        const warningText = (index === 0 && showCurrentReportWarning) ? ' (Yetersiz Değerlendirme)' : '';
                        
                        // İlk rapor seçili olmamalı, en son rapor seçili olmalı
                        const selectedAttr = (index === 0 && showCurrentReportWarning) ? '' : (index === reportHistory.length - 1 ? 'selected' : '');
                        
                        reportHTML += `<option value="${index}" ${disabledAttr} ${selectedAttr}>
                            Rapor #${index + 1} - ${report.studentCount} Öğrenci${warningText} (${date} ${time})
                        </option>`;
                    });
                    
                    reportHTML += `</select></div>`;
                }
                
                // Extract score from the current report
                const scoreMatch = reportContent.match(/(\d+)\/100|(\d+)\s*\/\s*100|(\d+)\s*puan/i);
                if (scoreMatch) {
                    // Get the first matched group that has a value
                    const score = scoreMatch[1] || scoreMatch[2] || scoreMatch[3];
                    overallScoreDisplay.textContent = score;
                } else {
                    overallScoreDisplay.textContent = '??';
                }
                
                // Check if waiting for more evaluations or generating report
                if (reportContent.includes('<div class="loading-text">') || reportContent.includes('Gemini yanıtlıyor')) {
                    reportHTML += `
                        <div class="loading-report">
                            <div class="spinner-container">
                                <div class="spinner large-spinner"></div>
                            </div>
                            <p class="loading-text">Gemini yanıtlıyor...</p>
                            <p class="loading-subtext">Genel değerlendirme raporu oluşturuluyor</p>
                        </div>
                    `;
                } else if (reportContent.includes('sonraki rapor') || reportContent.includes('değerlendirme daha yapıldıktan sonra')) {
                    reportHTML += `
                        <div class="next-batch-info">
                            <div class="batch-indicator">
                                <div class="batch-progress"></div>
                            </div>
                            <p>${reportContent}</p>
                        </div>
                    `;
                } else {
                    // Add the current report content
                    reportHTML += `<div class="current-report">${reportContent}</div>`;
                }
                
                reportHTML += `</div>`;
            } else {
                // No reports yet
                overallScoreDisplay.textContent = '--';
                
                // Check if waiting for Gemini to respond
                if (reportContent.includes('Henüz yeterli değerlendirme')) {
                    reportHTML = `<div class="no-reports-message">${reportContent}</div>`;
                } else {
                    reportHTML = `<div class="loading-report">
                        <div class="spinner-container">
                            <div class="spinner large-spinner"></div>
                        </div>
                        <p class="loading-text">Gemini yanıtlıyor...</p>
                        <p class="loading-subtext">Genel değerlendirme raporu oluşturuluyor</p>
                    </div>`;
                }
            }
            
            // Only update if content has changed or we're showing loading
            if (showLoading || overallReportContainer.innerHTML !== reportHTML) {
                overallReportContainer.innerHTML = reportHTML;
                
                // Add event listener to the report history selector if it exists
                const historySelect = document.getElementById('report-history-select');
                if (historySelect) {
                    historySelect.addEventListener('change', (e) => {
                        const selectedIndex = parseInt(e.target.value);
                        const selectedReport = reportHistory[selectedIndex];
                        
                        // Eğer seçilen rapor en son rapor (indeks 0) ve öğrenci sayısı 5'ten az ise uyarı göster
                        if (selectedIndex === 0 && showCurrentReportWarning) {
                            document.querySelector('.current-report').innerHTML = `<div class="minimum-evaluations-warning">
                                <h3>Yetersiz Değerlendirme Sayısı</h3>
                                <p>Güncel toplu değerlendirme raporu oluşturulamadı. En az 5 öğrenci değerlendirmesi gereklidir.</p>
                                <p>Şu anda sadece ${evaluationCount} değerlendirme bulunmaktadır.</p>
                                <p>5 değerlendirmeye ulaşıldığında güncel rapor otomatik olarak oluşturulacaktır.</p>
                            </div>`;
                            
                            // Puanı kaldır
                            overallScoreDisplay.textContent = '--';
                        } else {
                            // Update the displayed report
                            document.querySelector('.current-report').innerHTML = selectedReport.report;
                            
                            // Update the score
                            const scoreMatch = selectedReport.report.match(/(\d+)\/100|(\d+)\s*\/\s*100|(\d+)\s*puan/i);
                            if (scoreMatch) {
                                const score = scoreMatch[1] || scoreMatch[2] || scoreMatch[3];
                                overallScoreDisplay.textContent = score;
                            }
                        }
                    });
                }
            }
            
        } catch (error) {
            console.error('Error:', error);
            if (showLoading) {
                overallReportContainer.innerHTML = `
                    <div class="loading-report">
                        <div class="spinner-container">
                            <div class="spinner large-spinner"></div>
                        </div>
                        <p class="loading-text">Gemini yanıtlıyor...</p>
                        <p class="loading-subtext">Genel değerlendirme raporu oluşturuluyor</p>
                    </div>
                `;
            }
        }
    }
    
    // Delete an evaluation
    async function deleteEvaluation(event) {
        const evaluationId = event.target.getAttribute('data-id');
        
        if (!confirm('Bu değerlendirmeyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/evaluations/${evaluationId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Değerlendirme silinirken bir hata oluştu.');
            }
            
            // Get the updated information from the deletion response
            const result = await response.json();
            const remainingCount = result.remainingCount;
            const belowThreshold = result.belowThreshold;
            const updatedScore = result.updatedScore;
            
            // Update evaluation count display
            const evaluationCountElement = document.getElementById('evaluation-count');
            if (evaluationCountElement) {
                evaluationCountElement.textContent = remainingCount;
                
                // Add visual indication if below threshold
                if (belowThreshold) {
                    evaluationCountElement.classList.add('below-threshold');
                } else {
                    evaluationCountElement.classList.remove('below-threshold');
                }
            }
            
            // Genel performans puanını güncelleyelim
            const scoreDisplay = document.getElementById('overall-score-display');
            if (scoreDisplay) {
                // Eğer değerlendirme sayısı 0 ise veya 5'in altındaysa puan gösterme
                if (remainingCount === 0 || belowThreshold) {
                    scoreDisplay.textContent = '--';
                } else {
                    // Puanla ilgili görsel efekt ekleyelim
                    scoreDisplay.textContent = updatedScore;
                    
                    // Puan değişti efekti
                    scoreDisplay.classList.add('score-changed');
                    setTimeout(() => {
                        scoreDisplay.classList.remove('score-changed');
                    }, 1500);
                }
            }
            
            // Remove from UI
            const evaluationItem = document.querySelector(`.evaluation-item[data-id="${evaluationId}"]`);
            if (evaluationItem) {
                evaluationItem.remove();
            }
            
            // Reload the overall report - this will check for minimum 5 evaluations
            loadOverallReport();
            
            // Check if there are any evaluations left
            if (remainingCount === 0) {
                evaluationListContainer.innerHTML = '<p>Henüz hiç değerlendirme bulunmamaktadır.</p>';
            }
            
            // Show feedback message with current count information
            if (belowThreshold) {
                alert(`Değerlendirme başarıyla silindi. \n\nDikkat: Toplam değerlendirme sayısı ${remainingCount} olarak güncellendi. \nGenel rapor için en az 5 değerlendirme gereklidir.`);
            } else {
                alert(`Değerlendirme başarıyla silindi. \nToplam değerlendirme sayısı: ${remainingCount}`);
            }
            
        } catch (error) {
            console.error('Error:', error);
            alert('Değerlendirme silinirken bir hata oluştu.');
        }
    }
    
    // Function to start auto-refresh
    function startAutoRefresh() {
        // Clear any existing interval
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
        
        // Set up new interval
        autoRefreshInterval = setInterval(() => {
            const activeTab = document.querySelector('.tab.active').getAttribute('data-tab');
            
            if (activeTab === 'evaluations') {
                loadEvaluations(false); // false = don't show loading indicator
            } else if (activeTab === 'overall-report') {
                loadOverallReport(false); // false = don't show loading indicator
            }
        }, REFRESH_INTERVAL);
    }
    
    // Initial load
    loadEvaluations();
    loadOverallReport();
    
    // Start auto-refresh
    startAutoRefresh();
});
