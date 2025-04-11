document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('evaluation-form');
    const successMessage = document.getElementById('success-message');
    const ratingInputs = document.querySelectorAll('input[type="range"]');
    
    // Confetti effect for success message
    function showConfetti() {
        for (let i = 0; i < 150; i++) {
            createConfettiPiece();
        }
    }
    
    function createConfettiPiece() {
        const colors = ['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6'];
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        confetti.style.opacity = Math.random();
        confetti.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
        
        document.body.appendChild(confetti);
        
        setTimeout(() => {
            confetti.remove();
        }, 5000);
    }
    
    // Add confetti styles
    const style = document.createElement('style');
    style.innerHTML = `
        .confetti {
            position: fixed;
            width: 10px;
            height: 10px;
            top: -10px;
            z-index: 1000;
            border-radius: 0px;
            animation: fall linear forwards;
        }
        
        @keyframes fall {
            to {
                transform: translateY(100vh) rotate(720deg);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    // Update rating value display when slider is moved
    ratingInputs.forEach(input => {
        const valueDisplay = input.nextElementSibling;
        const emojiGood = input.parentElement.querySelector('.emoji-good');
        const emojiBad = input.parentElement.querySelector('.emoji-bad');
        
        // Initialize with starting value
        valueDisplay.textContent = input.value;
        
        // Update when value changes
        input.addEventListener('input', () => {
            valueDisplay.textContent = input.value;
            updateEmojis(input, emojiBad, emojiGood);
        });
        
        // Click on emoji bad sets to low value
        emojiBad.addEventListener('click', () => {
            input.value = 2;
            valueDisplay.textContent = input.value;
            updateEmojis(input, emojiBad, emojiGood);
        });
        
        // Click on emoji good sets to high value
        emojiGood.addEventListener('click', () => {
            input.value = 9;
            valueDisplay.textContent = input.value;
            updateEmojis(input, emojiBad, emojiGood);
        });
        
        // Initialize emojis
        updateEmojis(input, emojiBad, emojiGood);
    });
    
    // Update emoji sizes based on slider value
    function updateEmojis(input, badEmoji, goodEmoji) {
        const value = parseInt(input.value);
        const badSize = Math.max(0.6, 1 - (value / 10));
        const goodSize = Math.max(0.6, value / 10);
        
        badEmoji.style.transform = `scale(${badSize})`;
        goodEmoji.style.transform = `scale(${goodSize})`;
    }
    
    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Collect form data
        const formData = {
            criteria: {
                teaching: parseInt(document.getElementById('teaching').value),
                communication: parseInt(document.getElementById('communication').value),
                knowledge: parseInt(document.getElementById('knowledge').value),
                support: parseInt(document.getElementById('support').value),
                management: parseInt(document.getElementById('management').value)
            },
            comments: document.getElementById('comments').value.trim()
        };
        
        try {
            // Submit evaluation to API
            const response = await fetch('/api/evaluations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            if (!response.ok) {
                throw new Error('Değerlendirme gönderilirken bir hata oluştu.');
            }
            
            // Show success message with confetti
            successMessage.classList.remove('hidden');
            showConfetti();
            
            // Play success sound
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLHPM+N2TQwUHTo7vz6xfGwMvd+LWwYZEEgkwYPvszKJRFgcjQPjv1rNdJwECMGH83tmsTRsADzh/8evDpiUlCjV/0biWYCcNAiNc5OC5hlJGCB1L69PRoVQGBhlK4tq/mFkmAyhY48u0iTcyES1n4cmwezAwGjFpw7KFTDSlYFN20b+gWCgdFjFlzLWHRyUVKWmol3xJPDwQM1awno1hTEgVK0uWeGBHNAsXL06XioprSzslGCBQlpZ9TDITJUqHbFo9SWY6KDNQcF5FQE1VODBGbGdUSFJROTlCXl5XVFhZPDU5WGxpVUZDTFNGLUBhY1lVR0JNUDlBWFlYU1JUWU9JSlRaWFlVUk9UWEVFU1RTUVBQUFFJQ0pMTk9QUFBMR0RFRkdHSEhHRUJAQEBBQ0RFRUNBPj4/QEJDQ0NCPz4+P0BCQ0SHdmZgZHaBmqSakYZ+eHFnYGNsea6/srdenZ2aoKmxubm0qaWgm5aSjISDgH57dnRxbmtqaWhlY2JgX19eX19fYmNjZGVmZmZmZmVlZGNiYV9eXFtaWVhXV1ZWVlZXV1laW1tcXV5eX19fX19fXl5dXFtbWlpZWVhYV1dXVlZWVlVVVVRUVFRTU1NTUlJSUlJSUlJRUVFRUVFQUFBQUFBQUFBPT09PT09PT09PT09OTk5OTk5OTk1NTU1MTExMTExMTExMTExMTExMTEtLS0tLS0tLS0tLS0tLS0tLTEtLS0tLS0tLS0tLS0tLTEtLS0tLS0tLS0xMTExMTU1NTU1NTU1NTU1NTk5OTk5OTk5OTk5OTk5OTk9PT09PT09PT09PT09PUFBQUFBQUFBQUFBRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUVFRUVFRUVFRUVFRUVFRUVBQUFBQUE9PT09PT09PTk5OTk5OTk5OTk5OTk5OTk5OTk1NTU1NTU1NTU1NTU1NTU1MTExMTExMTExMTExMS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKSkpKSkpKSkpKSkpKSkpKSkpKSUpKSUpJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVF');
            audio.play();
            
            // Reset form with animation
            form.reset();
            ratingInputs.forEach(input => {
                // Animate the slider value change
                const startValue = parseInt(input.value);
                const valueDisplay = input.nextElementSibling;
                const emojiGood = input.parentElement.querySelector('.emoji-good');
                const emojiBad = input.parentElement.querySelector('.emoji-bad');
                
                // Animate reset to 5
                let currentValue = startValue;
                const targetValue = 5;
                const duration = 500; // ms
                const startTime = Date.now();
                
                const animateReset = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // Use easeOutBack for bouncy effect
                    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
                    const easedProgress = easeOut(progress);
                    
                    currentValue = startValue + (targetValue - startValue) * easedProgress;
                    const roundedValue = Math.round(currentValue);
                    
                    input.value = roundedValue;
                    valueDisplay.textContent = roundedValue;
                    updateEmojis(input, emojiBad, emojiGood);
                    
                    if (progress < 1) {
                        requestAnimationFrame(animateReset);
                    }
                };
                
                animateReset();
            });
            
            // Hide success message after 3 seconds
            setTimeout(() => {
                successMessage.classList.add('hidden');
            }, 4000);
            
        } catch (error) {
            console.error('Error:', error);
            alert('Değerlendirme gönderilirken bir hata oluştu. Lütfen tekrar deneyiniz.');
        }
    });
});
