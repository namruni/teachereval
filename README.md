# Öğretmen Değerlendirme Sistemi

Öğrencilerin öğretmenlerini değerlendirebildiği ve öğretmenlerin bu değerlendirmeleri görebildiği bir web uygulaması.

## Özellikler

- Öğrenciler 5 farklı kritere göre öğretmen değerlendirmesi yapabilir (1-10 puan)
- Öğrenciler ek yorumlar ekleyebilir
- Öğretmenler tüm değerlendirmeleri görüntüleyebilir
- Gemini AI kullanılarak her değerlendirme için otomatik rapor oluşturulur
- Gemini AI kullanılarak tüm değerlendirmelerden genel bir rapor oluşturulur
- Öğretmenler istedikleri değerlendirmeleri silebilir

## Kurulum

1. Node.js ve npm'in yüklü olduğundan emin olun
2. Bağımlılıkları yükleyin:
   ```
   npm install
   ```
3. `.env` dosyasını düzenleyerek Gemini API anahtarınızı ekleyin:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
   Gemini API anahtarını [Google AI Studio](https://makersuite.google.com/app/apikey)'dan alabilirsiniz.

## Uygulamayı Çalıştırma

```
npm start
```

Uygulama varsayılan olarak [http://localhost:3000](http://localhost:3000) adresinde çalışacaktır.

## Kullanım

- Ana sayfa: Öğrencilerin değerlendirme yapabileceği form
- Öğretmen paneli: Öğretmenlerin tüm değerlendirmeleri ve genel raporu görebileceği panel

## Değerlendirme Kriterleri

1. Ders Anlatım Kalitesi: Öğretmenin dersi açık ve anlaşılır şekilde anlatma yeteneği
2. İletişim Becerisi: Öğrencilerle etkili iletişim kurabilme
3. Alan Bilgisi: Öğretmenin konu alanındaki bilgi seviyesi
4. Öğrenci Desteği: Öğrencilere yardımcı olma ve destek sağlama
5. Sınıf Yönetimi: Sınıfı kontrol etme ve verimli bir öğrenme ortamı oluşturma
