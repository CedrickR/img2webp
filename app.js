const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_FILES = 30;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const gallery = document.getElementById('gallery');
const downloadAllBtn = document.getElementById('downloadAll');
const resetAllBtn = document.getElementById('resetAll');
const template = document.getElementById('imageCardTemplate');
const summarySection = document.getElementById('summary');
const summaryOriginal = document.querySelector('.summary__original');
const summaryConverted = document.querySelector('.summary__converted');
const summarySaving = document.querySelector('.summary__saving');

const imagesState = new Map();
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

function getFileBaseName(fileName = '') {
  return fileName.replace(/\.[^.]+$/, '');
}

function sanitizeFilenameBase(value = '') {
  return value
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
}

function ensureWebpExtension(name) {
  return name.toLowerCase().endsWith('.webp') ? name : `${name}.webp`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 o';
  }
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function getDataUrlSize(dataUrl) {
  const base64 = dataUrl.split(',')[1] ?? '';
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.round(base64.length * 0.75 - padding);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createCard(file, dataUrl) {
  const { content } = template;
  const card = content.firstElementChild.cloneNode(true);
  const thumbnail = card.querySelector('.card__thumbnail');
  const title = card.querySelector('.card__title');
  const meta = card.querySelector('.card__meta');
  const slider = card.querySelector('.compression-slider');
  const sliderValue = card.querySelector('.slider-value');
  const scaleInput = card.querySelector('.scale-input');
  const originalSize = card.querySelector('.original-size');
  const convertedSize = card.querySelector('.converted-size');
  const originalDim = card.querySelector('.original-dimensions');
  const newDim = card.querySelector('.new-dimensions');
  const downloadBtn = card.querySelector('.download-btn');
  const filenameInput = card.querySelector('.filename-input');
  const removeBtn = card.querySelector('.card__remove');

  const baseName = getFileBaseName(file.name);

  title.textContent = file.name;
  meta.textContent = `Format: ${(file.type || 'image/jpeg').split('/')[1]?.toUpperCase() ?? 'JPG'}`;
  originalSize.textContent = formatBytes(file.size);
  sliderValue.textContent = `${slider.value}%`;
  scaleInput.value = 100;
  filenameInput.value = baseName;

  const cardData = {
    file,
    card,
    slider,
    sliderValue,
    scaleInput,
    originalSize,
    convertedSize,
    originalDim,
    newDim,
    downloadBtn,
    filenameInput,
    removeBtn,
    baseName,
    imageElement: new Image(),
    originalWidth: 0,
    originalHeight: 0,
    convertedDataUrl: dataUrl,
    originalBytes: file.size,
    convertedBytes: file.size,
  };

  thumbnail.src = dataUrl;
  thumbnail.alt = `Aperçu de ${file.name}`;

  cardData.imageElement.addEventListener('load', () => {
    cardData.originalWidth = cardData.imageElement.naturalWidth;
    cardData.originalHeight = cardData.imageElement.naturalHeight;
    originalDim.textContent = `${cardData.originalWidth} × ${cardData.originalHeight} px`;
    updateConversion(cardData);
  });
  cardData.imageElement.src = dataUrl;

  slider.addEventListener('input', () => {
    sliderValue.textContent = `${slider.value}%`;
    debounceUpdate(cardData);
  });

  scaleInput.addEventListener('input', () => {
    const sanitized = clamp(Number(scaleInput.value) || 100, 10, 100);
    scaleInput.value = sanitized;
    debounceUpdate(cardData);
  });

  filenameInput.addEventListener('input', () => {
    updateDownloadFilename(cardData);
  });

  downloadBtn.addEventListener('click', () => {
    triggerDownload(cardData);
  });

  removeBtn.addEventListener('click', () => {
    removeCard(cardData);
  });

  imagesState.set(card, cardData);
  gallery.appendChild(card);
  updateDownloadFilename(cardData);
  refreshGlobalActions();
  refreshSummary();
}

function debounce(fn, delay = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const updateConversionDebouncedMap = new WeakMap();

function debounceUpdate(cardData) {
  const { card } = cardData;
  if (!updateConversionDebouncedMap.has(card)) {
    updateConversionDebouncedMap.set(card, debounce(updateConversion));
  }
  const debounced = updateConversionDebouncedMap.get(card);
  debounced(cardData);
}

async function updateConversion(cardData) {
  const {
    imageElement,
    slider,
    scaleInput,
    convertedSize,
    newDim,
    downloadBtn,
    card,
  } = cardData;

  if (!gallery.contains(card)) {
    return;
  }

  if (!imageElement.naturalWidth || !imageElement.naturalHeight) {
    return;
  }

  const qualityPercent = clamp(Number(slider.value) || 80, 1, 100);
  const quality = clamp(qualityPercent / 100, 0.01, 1);
  const scalePercent = clamp(Number(scaleInput.value) || 100, 10, 100);
  const scaleFactor = scalePercent / 100;

  const newWidth = Math.round(imageElement.naturalWidth * scaleFactor);
  const newHeight = Math.round(imageElement.naturalHeight * scaleFactor);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(newWidth, 1);
  canvas.height = Math.max(newHeight, 1);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/webp', quality);
  const sizeInBytes = getDataUrlSize(dataUrl);

  card.querySelector('.card__thumbnail').src = dataUrl;
  newDim.textContent = `${newWidth} × ${newHeight} px`;
  convertedSize.textContent = formatBytes(sizeInBytes);
  downloadBtn.dataset.url = dataUrl;
  cardData.convertedDataUrl = dataUrl;
  cardData.convertedBytes = sizeInBytes;
  updateDownloadFilename(cardData, { scalePercent, qualityPercent });
  refreshSummary();
}

function triggerDownload(cardData) {
  updateDownloadFilename(cardData);
  const dataUrl = cardData.convertedDataUrl;
  if (!dataUrl) {
    return;
  }
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = cardData.downloadBtn?.dataset?.filename || `${cardData.file.name}.webp`;
  document.body.appendChild(link);
  link.click();
  requestAnimationFrame(() => document.body.removeChild(link));
}

function updateDownloadFilename(cardData, options = {}) {
  const { slider, scaleInput, filenameInput, downloadBtn, baseName } = cardData;
  const scalePercent = clamp(Number(scaleInput.value) || 100, 10, 100);
  const qualityPercent = clamp(Number(slider.value) || 80, 1, 100);
  const resolvedScale = options.scalePercent ?? scalePercent;
  const resolvedQuality = options.qualityPercent ?? qualityPercent;

  const fallbackBase = `${baseName}_${resolvedScale}pct_${resolvedQuality}qual`;
  const rawInput = filenameInput.value ?? '';
  const trimmed = rawInput.trim();
  const withoutExtension = trimmed.toLowerCase().endsWith('.webp')
    ? trimmed.slice(0, -5)
    : trimmed;
  const sanitizedBase = sanitizeFilenameBase(withoutExtension) || sanitizeFilenameBase(fallbackBase);
  const finalBase = sanitizedBase || 'image-webp';
  const filename = ensureWebpExtension(finalBase);

  if (downloadBtn?.dataset) {
    downloadBtn.dataset.filename = filename;
  }
  cardData.currentFilename = filename;
}

async function handleFiles(files) {
  const uniqueFiles = files.filter((file) => ACCEPTED_TYPES.includes(file.type));
  if (!uniqueFiles.length) {
    return;
  }

  const availableSlots = MAX_FILES - imagesState.size;
  if (availableSlots <= 0) {
    alert(`Maximum de ${MAX_FILES} images atteint.`);
    return;
  }
  const filesToProcess = uniqueFiles.slice(0, availableSlots);

  for (const file of filesToProcess) {
    const dataUrl = await readFileAsDataUrl(file);
    createCard(file, dataUrl);
  }

  if (files.length > filesToProcess.length) {
    alert(`Seules les ${MAX_FILES} premières images ont été ajoutées.`);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsDataURL(file);
  });
}

function resetGallery() {
  gallery.innerHTML = '';
  imagesState.clear();
  refreshGlobalActions();
  refreshSummary();
}

async function downloadAll() {
  if (imagesState.size === 0) {
    return;
  }
  const zip = new JSZip();
  let index = 1;
  for (const cardData of imagesState.values()) {
    await updateConversion(cardData);
    const dataUrl = cardData.convertedDataUrl;
    if (!dataUrl) continue;
    const base64 = dataUrl.split(',')[1];
    const filename = cardData.downloadBtn?.dataset?.filename || `${cardData.file.name.replace(/\.[^.]+$/, '')}_${index}.webp`;
    zip.file(filename, base64, { base64: true });
    index += 1;
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'images-webp.zip');
}

function refreshGlobalActions() {
  const hasImages = imagesState.size > 0;
  downloadAllBtn.disabled = !hasImages;
  resetAllBtn.disabled = !hasImages;
}

function refreshSummary() {
  const hasImages = imagesState.size > 0;
  if (summarySection) {
    summarySection.hidden = !hasImages;
  }

  if (!hasImages) {
    if (summaryOriginal) summaryOriginal.textContent = '0 o';
    if (summaryConverted) summaryConverted.textContent = '0 o';
    if (summarySaving) {
      summarySaving.textContent = '0\u00a0%';
      summarySaving.classList.remove('summary__saving--negative');
    }
    return;
  }

  let totalOriginal = 0;
  let totalConverted = 0;

  for (const cardData of imagesState.values()) {
    totalOriginal += cardData.originalBytes || 0;
    totalConverted += cardData.convertedBytes || cardData.originalBytes || 0;
  }

  const gain = totalOriginal
    ? ((totalOriginal - totalConverted) / totalOriginal) * 100
    : 0;

  if (summaryOriginal) summaryOriginal.textContent = formatBytes(totalOriginal);
  if (summaryConverted) summaryConverted.textContent = formatBytes(totalConverted);
  if (summarySaving) {
    const absoluteGain = Math.abs(gain);
    const decimals = absoluteGain >= 10 ? 0 : 1;
    const prefix = gain > 0 ? '+' : gain < 0 ? '-' : '';
    const formattedValue = absoluteGain < 0.05
      ? '0'
      : absoluteGain.toFixed(decimals);
    summarySaving.textContent = `${prefix}${formattedValue}\u00a0%`;
    summarySaving.classList.toggle('summary__saving--negative', gain < 0);
  }
}

function removeCard(cardData) {
  if (!cardData?.card) {
    return;
  }
  imagesState.delete(cardData.card);
  cardData.card.remove();
  refreshGlobalActions();
  refreshSummary();
}

function preventDefault(e) {
  e.preventDefault();
  e.stopPropagation();
}

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keypress', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});

dropZone.addEventListener('dragenter', (event) => {
  preventDefault(event);
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragover', (event) => {
  preventDefault(event);
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (event) => {
  preventDefault(event);
  if (!dropZone.contains(event.relatedTarget)) {
    dropZone.classList.remove('dragover');
  }
});

dropZone.addEventListener('drop', (event) => {
  preventDefault(event);
  dropZone.classList.remove('dragover');
  const files = Array.from(event.dataTransfer?.files ?? []);
  handleFiles(files);
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files ?? []);
  handleFiles(files);
  fileInput.value = '';
});

resetAllBtn.addEventListener('click', resetGallery);
downloadAllBtn.addEventListener('click', downloadAll);
