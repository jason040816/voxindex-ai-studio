import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/daxi-logo-transparent.png';
import heroBackground from '../assets/homepage-background.jpg';
import { useLanguage } from '../context/LanguageContext';
import './Homepage.css';

export default function Homepage() {
  const { language, t } = useLanguage();
  const phrases = t('heroPhrases');
  const [typedSubtitle, setTypedSubtitle] = useState('');

  const scrollToAbout = () => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeoutId;
    const tick = () => {
      const current = phrases[phraseIndex];
      if (!deleting) {
        charIndex += 1;
        setTypedSubtitle(current.slice(0, charIndex));
        if (charIndex >= current.length) { deleting = true; timeoutId = setTimeout(tick, 1500); return; }
        timeoutId = setTimeout(tick, 48);
        return;
      }
      charIndex -= 1;
      setTypedSubtitle(current.slice(0, charIndex));
      if (charIndex <= 0) { deleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; timeoutId = setTimeout(tick, 220); return; }
      timeoutId = setTimeout(tick, 28);
    };
    tick();
    return () => clearTimeout(timeoutId);
  }, [language]);

  return (
    <main className="home-page" style={{ '--home-hero-background': `url(${heroBackground})` }}>
      <section className="home-hero" id="start">
        <div className="home-hero-content">
          <h1>{t('heroTitle')}</h1>
          <p className="home-tagline">{t('heroTagline')}</p>
          <p className="home-subtitle home-subtitle-typing" aria-live="polite">{typedSubtitle}<span className="typing-cursor" aria-hidden="true">|</span></p>
          <div className="home-cta-row">
            <Link to="/register" className="home-btn home-btn-primary">{t('start')} <span aria-hidden="true">→</span></Link>
            <button type="button" className="home-btn home-btn-ghost" onClick={scrollToAbout}>{t('viewAbout')}</button>
          </div>
          <div className="home-feature-pills" aria-label={language === 'zh' ? '平台功能' : 'Platform features'}>
            <span className="home-feature-pill"><span className="home-feature-icon" aria-hidden="true">✓</span>{language === 'zh' ? '声音克隆' : 'Voice Cloning'}</span>
            <span className="home-feature-pill"><span className="home-feature-icon" aria-hidden="true">♫</span>{language === 'zh' ? '文本转语音' : 'Text-to-Speech'}</span>
            <span className="home-feature-pill"><span className="home-feature-icon home-feature-icon-outline" aria-hidden="true">▧</span>{language === 'zh' ? '数字人视频' : 'Digital-Human Video'}</span>
          </div>
        </div>
      </section>

      <section className="home-about" id="about">
        <div className="home-about-mark"><div className="logo-card"><img src={logo} alt="DAXI 大汐" /></div></div>
        <div className="home-about-copy">
          <p className="section-kicker">DAXI · AI VOICE & DIGITAL HUMAN</p>
          <h2>{t('aboutTitle')}</h2>
          <p>{t('aboutCopy')}</p>
          <div className="home-feature-grid">
            <div className="home-feature-card"><strong>01</strong><h3>{language === 'zh' ? '声音克隆' : 'Voice cloning'}</h3><p>{language === 'zh' ? '上传授权样本，创建专属音色。' : 'Create a dedicated voice from an authorized sample.'}</p></div>
            <div className="home-feature-card"><strong>02</strong><h3>{language === 'zh' ? '文本转语音' : 'Text to speech'}</h3><p>{language === 'zh' ? '输入文案，快速生成音频。' : 'Turn scripts into downloadable audio.'}</p></div>
            <div className="home-feature-card"><strong>03</strong><h3>{language === 'zh' ? '数字人视频' : 'Digital-human video'}</h3><p>{language === 'zh' ? '上传训练视频，使用克隆声音生成数字人视频。' : 'Train a model and generate digital-human videos with your cloned voice.'}</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}
