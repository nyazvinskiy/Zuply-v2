(function() {
  'use strict';

  // ========== CONFIG ==========
  const TOTAL_FRAMES = 76;
  const FRAME_PATH = 'assets/frames/frame_';

  // ========== FRAME PRELOADING ==========
  const frames = [];
  let loadedCount = 0;
  const loaderBar = document.getElementById('loaderBar');
  const loader = document.getElementById('loader');

  function preloadFrames() {
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      const num = String(i).padStart(4, '0');
      img.src = FRAME_PATH + num + '.jpg';
      img.onload = () => {
        loadedCount++;
        const pct = (loadedCount / TOTAL_FRAMES) * 100;
        if (loaderBar) loaderBar.style.width = pct + '%';
        if (loadedCount === TOTAL_FRAMES) {
          setTimeout(() => {
            if (loader) loader.classList.add('hidden');
            drawFrame(0);
          }, 400);
        }
      };
      img.onerror = img.onload;
      frames.push(img);
    }
  }

  // ========== CANVAS SETUP ==========
  const canvas = document.getElementById('scrollCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  let lastDrawnFrame = -1;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);
    lastDrawnFrame = -1;
    if (loadedCount === TOTAL_FRAMES) {
      drawFrame(getCurrentFrameIndex());
    }
  }

  function drawFrame(index) {
    if (!ctx || index === lastDrawnFrame) return;
    lastDrawnFrame = index;
    const img = frames[index];
    if (!img || !img.complete) return;

    const cw = window.innerWidth;
    const ch = window.innerHeight;
    ctx.clearRect(0, 0, cw, ch);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);

    const isMobile = cw < 768;
    const zoom = isMobile ? 1.15 : 1;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = cw / ch;

    let drawW, drawH;
    if (imgAspect > canvasAspect) {
      drawW = cw * zoom;
      drawH = drawW / imgAspect;
    } else {
      drawH = ch * zoom;
      drawW = drawH * imgAspect;
    }
    const drawX = (cw - drawW) / 2;
    const drawY = (ch - drawH) / 2;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }

  // ========== SCROLL → FRAME MAPPING ==========
  const scrollAnimEl = document.getElementById('scrollAnimation');

  function getCurrentFrameIndex() {
    if (!scrollAnimEl) return 0;
    const rect = scrollAnimEl.getBoundingClientRect();
    const scrollLength = scrollAnimEl.offsetHeight - window.innerHeight;
    const scrolled = -rect.top;
    const progress = Math.max(0, Math.min(1, scrolled / scrollLength));
    return Math.min(TOTAL_FRAMES - 1, Math.floor(progress * TOTAL_FRAMES));
  }

  function getScrollProgress() {
    if (!scrollAnimEl) return 0;
    const rect = scrollAnimEl.getBoundingClientRect();
    const scrollLength = scrollAnimEl.offsetHeight - window.innerHeight;
    const scrolled = -rect.top;
    return Math.max(0, Math.min(1, scrolled / scrollLength));
  }

  // ========== ANNOTATION CARDS ==========
  const annotCards = document.querySelectorAll('.annotation-card');

  function updateAnnotations(progress) {
    annotCards.forEach(card => {
      const show = parseFloat(card.dataset.show);
      const hide = parseFloat(card.dataset.hide);
      if (progress >= show && progress <= hide) {
        card.classList.add('visible');
      } else {
        card.classList.remove('visible');
      }
    });
  }

  // ========== SCROLL HANDLER ==========
  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        const idx = getCurrentFrameIndex();
        drawFrame(idx);

        const progress = getScrollProgress();
        updateAnnotations(progress);

        const navbar = document.getElementById('navbar');
        if (navbar) {
          if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
          } else {
            navbar.classList.remove('scrolled');
          }
        }

        const progressEl = document.getElementById('scrollProgress');
        if (progressEl) {
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const scrollPct = (window.scrollY / docHeight) * 100;
          progressEl.style.width = scrollPct + '%';
        }

        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resizeCanvas);

  // ========== SPECS COUNT-UP ==========
  function easeOutExpo(x) {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
  }

  function countUp(el, target, suffix, duration) {
    const start = performance.now();
    el.classList.add('counting');
    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutExpo(progress);
      const current = Math.round(eased * target);
      el.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target + suffix;
        setTimeout(() => el.classList.remove('counting'), 300);
      }
    }
    requestAnimationFrame(update);
  }

  let specsCounted = false;
  const specsEl = document.getElementById('specs');
  if (specsEl) {
    const specsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !specsCounted) {
          specsCounted = true;
          const nums = document.querySelectorAll('.spec-number');
          nums.forEach((el, i) => {
            const target = parseInt(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            setTimeout(() => countUp(el, target, suffix, 1800), i * 200);
          });
        }
      });
    }, { threshold: 0.3 });
    specsObserver.observe(specsEl);
  }

  // ========== DROP ZONE & 3D PREVIEW ==========
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  let stlReqAnimId;

  function initSTLPreview(file) {
    if (!window.THREE || !window.THREE.STLLoader || !dropZone) return;

    const existing = dropZone.querySelector('canvas');
    if (existing) existing.remove();
    if (stlReqAnimId) cancelAnimationFrame(stlReqAnimId);
    dropZone.classList.add('has-model');

    const reader = new FileReader();
    reader.onload = function(e) {
      const width = dropZone.clientWidth;
      const height = dropZone.clientHeight;
      
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      dropZone.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
      const addLight = (x,y,z) => {
        const d = new THREE.DirectionalLight(0xffffff, 0.8);
        d.position.set(x,y,z);
        scene.add(d);
      };
      addLight(1, 1, 1); addLight(-1, -1, -1);

      const loader = new THREE.STLLoader();
      const geometry = loader.parse(e.target.result);
      geometry.center();
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x0066FF, roughness: 0.3, metalness: 0.1 
      });
      const mesh = new THREE.Mesh(geometry, material);
      
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      const size = box.getSize(new THREE.Vector3()).length();
      const scale = (height * 0.45) / size;
      mesh.scale.set(scale, scale, scale);
      
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      camera.position.z = Math.max(width, height) * 0.6;

      new ResizeObserver(() => {
        const nw = dropZone.clientWidth;
        const nh = dropZone.clientHeight;
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        camera.position.z = Math.max(nw, nh) * 0.6;
        mesh.scale.set((nh * 0.45)/size, (nh * 0.45)/size, (nh * 0.45)/size);
      }).observe(dropZone);

      function render() {
        stlReqAnimId = requestAnimationFrame(render);
        mesh.rotation.z += 0.01;
        renderer.render(scene, camera);
      }
      render();
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFile(file) {
    if (!file || !dropZone) return;
    const dzText = dropZone.querySelector('.drop-zone-text');
    const dzHint = dropZone.querySelector('.drop-zone-hint');
    if (dzText) dzText.textContent = file.name;
    if (dzHint) dzHint.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB ✓';

    const name = file.name.toLowerCase();
    if (name.endsWith('.stl')) {
      initSTLPreview(file);
    } else {
      const existing = dropZone.querySelector('canvas');
      if (existing) existing.remove();
      if (stlReqAnimId) cancelAnimationFrame(stlReqAnimId);
      dropZone.classList.add('has-model');
    }
  }

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFile(fileInput.files[0]);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) {
        handleFile(fileInput.files[0]);
      }
    });
  }

  // ========== PHONE MASK ==========
  const phoneInput = document.getElementById('phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', function (e) {
      let x = e.target.value.replace(/\D/g, '').match(/(\d{0,1})(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})/);
      if (!x[1]) { e.target.value = ''; return; }
      if (x[1] !== '7' && x[1] !== '8') x[1] = '7';
      e.target.value = '+7' + (x[2] ? ' (' + x[2] : '') + (x[3] ? ') ' + x[3] : '') + (x[4] ? '-' + x[4] : '') + (x[5] ? '-' + x[5] : '');
    });
  }

  // ========== NDA MODAL LOGIC ==========
  const ndaModal = document.getElementById('ndaModal');
  const openNda = document.getElementById('openNda');
  const closeNda = document.getElementById('closeNda');

  if(openNda && ndaModal) {
    openNda.addEventListener('click', (e) => {
      e.preventDefault();
      ndaModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  }
  
  const closeModalFunc = () => {
    if(ndaModal) ndaModal.classList.remove('open');
    document.body.style.overflow = 'auto';
  };

  if(closeNda) closeNda.addEventListener('click', closeModalFunc);
  
  if(ndaModal) ndaModal.addEventListener('click', (e) => {
    if (e.target === ndaModal) closeModalFunc();
  });

  // ========== FAQ ACCORDION ==========
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const q = item.querySelector('.faq-q');
    q.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });

  // ========== SMOOTH SCROLL FOR NAV LINKS ==========
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#' || !href.startsWith('#')) return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ========== PORTFOLIO CAROUSEL LOGIC ==========
  const track = document.getElementById('casesTrack');
  const btnPrev = document.getElementById('casePrev');
  const btnNext = document.getElementById('caseNext');
  
  if (track && btnPrev && btnNext) {
    let currentTranslate = 0;
    const gap = 32;
    const cardWidth = 320;
    const step = cardWidth + gap;
    
    const updateButtons = () => {
      const containerWidth = track.parentElement.clientWidth;
      const maxTranslate = -(track.scrollWidth - containerWidth);
      btnPrev.disabled = currentTranslate >= 0;
      btnNext.disabled = currentTranslate <= maxTranslate;
    };

    btnNext.addEventListener('click', () => {
      const maxTranslate = -(track.scrollWidth - track.parentElement.clientWidth);
      currentTranslate -= step;
      if (currentTranslate < maxTranslate) currentTranslate = maxTranslate;
      track.style.transform = `translateX(${currentTranslate}px)`;
      updateButtons();
    });

    btnPrev.addEventListener('click', () => {
      currentTranslate += step;
      if (currentTranslate > 0) currentTranslate = 0;
      track.style.transform = `translateX(${currentTranslate}px)`;
      updateButtons();
    });

    window.addEventListener('resize', () => {
      currentTranslate = 0;
      track.style.transform = `translateX(0px)`;
      updateButtons();
    });
    
    setTimeout(updateButtons, 100);
  }

  // ========== TELEGRAM BOT INTEGRATION ==========
  const leadForm = document.getElementById('leadForm');
  const submitBtn = leadForm ? leadForm.querySelector('.form-submit') : null;

  const TG_CONFIG = {
    token: '8690599672:AAHSjFI50OLXxSnYv7cuAPyN5HDYM2Qi_qw',
    chatId: 'YOUR_CHAT_ID' // User still needs to provide ChatID or I use a placeholder
  };

  if (leadForm && submitBtn) {
    leadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const ndaChecked = document.getElementById('ndaCheck')?.checked;
      if (!ndaChecked) {
        alert('Пожалуйста, подтвердите согласие с NDA перед отправкой.');
        return;
      }

      const originalBtnText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Отправка...';

      const formData = {
        name: document.getElementById('name').value,
        phone: document.getElementById('phone').value,
        telegram: document.getElementById('telegram').value,
        material: document.getElementById('material').value,
        qty: document.getElementById('qty').value,
        comment: document.getElementById('comment').value,
        file: document.getElementById('fileInput').files[0]?.name || 'Нет файла'
      };

      const message = `
🚀 *Новая заявка Zuply!*
👤 *Имя:* ${formData.name || 'Не указано'}
📞 *Телефон:* ${formData.phone || 'Не указано'}
📱 *Telegram:* ${formData.telegram || 'Не указано'}
🛠 *Материал:* ${formData.material}
📦 *Тираж:* ${formData.qty || 'Не указано'}
📝 *Комментарий:* ${formData.comment || '—'}
📂 *Файл:* ${formData.file}
      `;

      try {
        const response = await fetch(`https://api.telegram.org/bot${TG_CONFIG.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TG_CONFIG.chatId,
            text: message,
            parse_mode: 'Markdown'
          })
        });

        if (response.ok) {
          submitBtn.textContent = 'Успешно отправлено! ✓';
          submitBtn.style.background = '#00c853';
          leadForm.reset();
          const dzText = document.querySelector('.drop-zone-text');
          if (dzText) dzText.textContent = 'Перетащите 3D-модель сюда';
          const canvas = document.querySelector('.drop-zone canvas');
          if (canvas) canvas.remove();
        } else {
          throw new Error('Ошибка API');
        }
      } catch (err) {
        console.error(err);
        submitBtn.textContent = 'Ошибка отправки ❌';
        submitBtn.style.background = '#ff1744';
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          submitBtn.style.background = '';
        }, 3000);
      }
    });
  }

  // ========== INIT ==========
  resizeCanvas();
  preloadFrames();

})();
