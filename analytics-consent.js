(() => {
  if (window.location.hostname !== 'lydiatools.github.io') return;

  const measurementId = 'G-M5XZDV1PE7';
  const consentKey = 'lydiatools.analytics-consent.v1';
  const denied = {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  };
  const granted = { ...denied, analytics_storage: 'granted' };
  const copy = {
    en: {
      title: 'Optional visit analytics',
      body: 'Optional visit and referral stats, plus LydiaTools GitHub link clicks. Demo content stays local.',
      detailsTitle: 'What is measured?',
      details: 'If enabled, Google Analytics receives page path and title, referrer origin, allow-listed campaign tags, standard browser or device signals, GitHub destination paths, and a generic event when a demo save is verified. It never receives the entered title, body, saved record, or save count. Other query values and URL fragments are discarded. Google Analytics may use analytics cookies. Changing your choice applies to future collection; data already sent cannot be recalled here.',
      note: 'Off until allowed. Change later in Privacy settings.',
      none: 'No choice saved yet.',
      accepted: 'Current choice: analytics allowed.',
      rejected: 'Current choice: analytics rejected.',
      allow: 'Allow analytics', reject: 'Reject', later: 'Not now',
      settings: 'Privacy settings', label: 'Optional analytics consent'
    },
    zh: {
      title: '可选访问统计',
      body: '可选记录访问来源和 LydiaTools GitHub 点击；演示内容保留在本机。',
      detailsTitle: '具体会记录什么？',
      details: '启用后，Google Analytics 会收到页面路径和标题、来源域名、限定的活动标记、常规浏览器或设备信号、GitHub 目标路径，以及演示记录保存并核验成功这一通用事件。不会收到你输入的标题、正文、保存记录或保存次数。其他查询参数和 URL 片段会被剔除。Google Analytics 可能使用统计 Cookie。更改选择只影响后续采集，已发送的数据无法从此处撤回。',
      note: '默认关闭；以后可在“隐私设置”更改。',
      none: '尚未保存选择。',
      accepted: '当前选择：允许统计。',
      rejected: '当前选择：拒绝统计。',
      allow: '允许统计', reject: '拒绝', later: '暂不选择',
      settings: '隐私设置', label: '可选访问统计授权'
    }
  };

  function readChoice() {
    try {
      const value = window.localStorage.getItem(consentKey);
      return value === 'accepted' || value === 'rejected' ? value : '';
    } catch {
      return '';
    }
  }

  function language() {
    const queryLanguage = new URLSearchParams(window.location.search).get('lang');
    const documentLanguage = document.documentElement.lang.toLowerCase();
    return queryLanguage === 'zh' || documentLanguage.startsWith('zh') ? 'zh' : 'en';
  }

  function safePageLocation() {
    const url = new URL(window.location.href);
    const campaign = new URLSearchParams();
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      const value = url.searchParams.get(key);
      if (value) campaign.set(key, value.slice(0, 100));
    }
    const query = campaign.toString();
    return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
  }

  function safeReferrer() {
    if (!document.referrer) return '';
    try {
      return `${new URL(document.referrer).origin}/`;
    } catch {
      return '';
    }
  }

  const choice = readChoice();
  let currentChoice = choice;
  let active = false;
  let tagLoaded = false;
  let currentLanguage = language();

  const style = document.createElement('style');
  style.textContent = `
    #lydia-analytics-consent{position:fixed;z-index:99999;left:16px;right:16px;bottom:16px;max-width:620px;margin:0 auto;padding:12px 14px;background:#f8fafb;color:#173247;border:1px solid #bdcbd4;box-shadow:0 12px 34px #1024322b;font:13px/1.48 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #lydia-analytics-consent[hidden]{display:none}
    #lydia-analytics-consent h2{margin:0 0 4px;color:#173247;font:620 16px/1.3 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #lydia-analytics-consent p{margin:4px 0;color:#526a7a}
    #lydia-analytics-consent .lt-consent-details{margin-top:4px;color:#526a7a;font-size:12px}
    #lydia-analytics-consent .lt-consent-details summary{width:max-content;cursor:pointer;color:#124e7f;text-decoration:underline;text-underline-offset:2px}
    #lydia-analytics-consent .lt-consent-details p{margin:5px 0 0}
    #lydia-analytics-consent .lt-consent-status{font-size:11px}
    #lydia-analytics-consent .lt-consent-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
    #lydia-analytics-consent button,#lydia-analytics-settings{font:inherit;cursor:pointer}
    #lydia-analytics-consent button{min-height:38px;padding:7px 13px;border:1px solid #173247;background:transparent;color:#173247}
    #lydia-analytics-consent .lt-consent-allow{background:#173247;color:#fff}
    #lydia-analytics-consent button:focus-visible,#lydia-analytics-settings:focus-visible{outline:3px solid #c78117;outline-offset:3px}
    .lt-privacy-footer{display:flex;flex-wrap:wrap;align-items:center;gap:.65rem 1.4rem}
    #lydia-analytics-settings{margin:0;padding:0;border:0;background:transparent;color:inherit;text-decoration:underline;text-underline-offset:3px}
    @media(max-width:600px){#lydia-analytics-consent{left:8px;right:8px;bottom:8px;padding:10px 11px;font-size:12px}#lydia-analytics-consent h2{font-size:15px}#lydia-analytics-consent button{flex:1;min-width:0;padding:7px 9px;font-size:12px}}
  `;
  document.head.append(style);

  const footer = document.querySelector('footer');
  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.id = 'lydia-analytics-settings';
  settingsButton.addEventListener('click', () => {
    render();
    panel.hidden = false;
  });
  if (footer) {
    footer.classList.add('lt-privacy-footer');
    footer.append(settingsButton);
  }

  const panel = document.createElement('section');
  panel.id = 'lydia-analytics-consent';
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'lydia-analytics-title');
  const title = document.createElement('h2');
  title.id = 'lydia-analytics-title';
  const description = document.createElement('p');
  const details = document.createElement('details');
  details.className = 'lt-consent-details';
  const detailsSummary = document.createElement('summary');
  const detailsCopy = document.createElement('p');
  details.append(detailsSummary, detailsCopy);
  const note = document.createElement('p');
  const status = document.createElement('p');
  status.className = 'lt-consent-status';
  const actions = document.createElement('div');
  actions.className = 'lt-consent-actions';
  const allowButton = document.createElement('button');
  allowButton.type = 'button';
  allowButton.className = 'lt-consent-allow';
  const rejectButton = document.createElement('button');
  rejectButton.type = 'button';
  const laterButton = document.createElement('button');
  laterButton.type = 'button';
  actions.append(allowButton, rejectButton, laterButton);
  panel.append(title, description, details, note, status, actions);
  document.body.append(panel);

  function render() {
    const text = copy[currentLanguage];
    settingsButton.textContent = text.settings;
    settingsButton.setAttribute('aria-label', text.settings);
    panel.setAttribute('aria-label', text.label);
    title.textContent = text.title;
    description.textContent = text.body;
    detailsSummary.textContent = text.detailsTitle;
    detailsCopy.textContent = text.details;
    note.textContent = text.note;
    status.textContent = currentChoice ? text[currentChoice] : text.none;
    status.hidden = !currentChoice;
    allowButton.textContent = text.allow;
    rejectButton.textContent = text.reject;
    laterButton.textContent = text.later;
  }

  function applyConsent() {
    if (currentChoice !== 'accepted') {
      if (tagLoaded && typeof window.gtag === 'function') window.gtag('consent', 'update', denied);
      active = false;
      window.__lydiaAnalyticsActive = false;
      return;
    }

    if (!tagLoaded) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
      window.gtag('consent', 'default', denied);
      window.gtag('consent', 'update', granted);
      window.gtag('js', new Date());
      window.gtag('config', measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
      const script = document.createElement('script');
      script.async = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      document.head.append(script);
      tagLoaded = true;
    } else window.gtag('consent', 'update', granted);

    if (!active) window.gtag('event', 'page_view', {
      page_location: safePageLocation(),
      page_title: document.title,
      page_referrer: safeReferrer()
    });
    active = true;
    window.__lydiaAnalyticsActive = true;
  }

  function saveChoice(nextChoice) {
    currentChoice = nextChoice;
    try { window.localStorage.setItem(consentKey, currentChoice); } catch { /* This-page choice still applies. */ }
    render();
    applyConsent();
    panel.hidden = true;
  }

  allowButton.addEventListener('click', () => saveChoice('accepted'));
  rejectButton.addEventListener('click', () => saveChoice('rejected'));
  laterButton.addEventListener('click', () => { panel.hidden = true; });
  document.addEventListener('click', (event) => {
    if (!active || typeof window.gtag !== 'function') return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const destination = new URL(anchor.href, window.location.href);
    if (destination.hostname !== 'github.com' || !/^\/lydiatools(?:\/|$)/i.test(destination.pathname)) return;
    window.gtag('event', 'github_outbound_click', { github_path: destination.pathname });
  });
  document.addEventListener('lydia-demo-save-verified', () => {
    if (active && typeof window.gtag === 'function') window.gtag('event', 'demo_save_verified');
  });
  new MutationObserver(() => {
    const nextLanguage = language();
    if (nextLanguage !== currentLanguage) {
      currentLanguage = nextLanguage;
      render();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  render();
  if (!currentChoice) panel.hidden = false;
  applyConsent();
})();
