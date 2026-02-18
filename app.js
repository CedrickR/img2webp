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

const OUTPUT_FORMATS = {
  webp: { mimeType: 'image/webp', extension: 'webp', label: 'WebP' },
  jpg: { mimeType: 'image/jpeg', extension: 'jpg', label: 'JPG' },
  png: { mimeType: 'image/png', extension: 'png', label: 'PNG' },
};

function resolveOutputFormat(format) {
  return OUTPUT_FORMATS[format] ? format : 'webp';
}

function ensureFileExtension(name, extension) {
  return name.toLowerCase().endsWith(`.${extension}`) ? name : `${name}.${extension}`;
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
  const compressionValue = card.querySelector('.compression-value') || card.querySelector('.slider-value');
  const scaleSlider = card.querySelector('.scale-slider');
  const scaleValue = card.querySelector('.scale-value');
  const originalSize = card.querySelector('.original-size');
  const convertedSize = card.querySelector('.converted-size');
  const originalDim = card.querySelector('.original-dimensions');
  const newDim = card.querySelector('.new-dimensions');
  const downloadBtn = card.querySelector('.download-btn');
  const filenameInput = card.querySelector('.filename-input');
  const removeBtn = card.querySelector('.card__remove');
  const outputFormatSelect = card.querySelector('.output-format-select');
  const filenameSuffix = card.querySelector('.filename-suffix');

  const baseName = getFileBaseName(file.name);

  title.textContent = file.name;
  meta.textContent = `Format: ${(file.type || 'image/jpeg').split('/')[1]?.toUpperCase() ?? 'JPG'}`;
  originalSize.textContent = formatBytes(file.size);
  if (compressionValue) {
    compressionValue.textContent = `${slider.value}%`;
  }
  if (scaleValue) {
    scaleValue.textContent = `${scaleSlider.value}%`;
  }
  filenameInput.value = baseName;

  const cardData = {
    file,
    card,
    slider,
    compressionValue,
    scaleSlider,
    scaleValue,
    originalSize,
    convertedSize,
    originalDim,
    newDim,
    downloadBtn,
    filenameInput,
    removeBtn,
    outputFormatSelect,
    filenameSuffix,
    baseName,
    imageElement: new Image(),
    originalWidth: 0,
    originalHeight: 0,
    convertedDataUrl: dataUrl,
    originalBytes: file.size,
    convertedBytes: file.size,
    outputFormat: 'webp',
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
    if (compressionValue) {
      compressionValue.textContent = `${slider.value}%`;
    }
    debounceUpdate(cardData);
  });

  scaleSlider.addEventListener('input', () => {
    const sanitized = clamp(Number(scaleSlider.value) || 100, 10, 100);
    scaleSlider.value = sanitized;
    if (scaleValue) {
      scaleValue.textContent = `${sanitized}%`;
    }
    debounceUpdate(cardData);
  });

  filenameInput.addEventListener('input', () => {
    updateDownloadFilename(cardData);
  });

  outputFormatSelect.addEventListener('change', () => {
    cardData.outputFormat = resolveOutputFormat(outputFormatSelect.value);
    updateDownloadFilename(cardData);
    updateConversion(cardData);
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
    scaleSlider,
    convertedSize,
    newDim,
    downloadBtn,
    card,
    outputFormat,
  } = cardData;

  if (!gallery.contains(card)) {
    return;
  }

  if (!imageElement.naturalWidth || !imageElement.naturalHeight) {
    return;
  }

  const qualityPercent = clamp(Number(slider.value) || 80, 1, 100);
  const quality = clamp(qualityPercent / 100, 0.01, 1);
  const scalePercent = clamp(Number(scaleSlider.value) || 100, 10, 100);
  const scaleFactor = scalePercent / 100;

  const newWidth = Math.round(imageElement.naturalWidth * scaleFactor);
  const newHeight = Math.round(imageElement.naturalHeight * scaleFactor);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(newWidth, 1);
  canvas.height = Math.max(newHeight, 1);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

  const resolvedOutputFormat = resolveOutputFormat(outputFormat);
  const outputConfig = OUTPUT_FORMATS[resolvedOutputFormat];
  const useQuality = outputConfig.mimeType !== 'image/png';
  const dataUrl = useQuality
    ? canvas.toDataURL(outputConfig.mimeType, quality)
    : canvas.toDataURL(outputConfig.mimeType);
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
  const fallbackFormat = resolveOutputFormat(cardData.outputFormat);
  const fallbackExtension = OUTPUT_FORMATS[fallbackFormat].extension;
  link.download = cardData.downloadBtn?.dataset?.filename || `${cardData.file.name}.${fallbackExtension}`;
  document.body.appendChild(link);
  link.click();
  requestAnimationFrame(() => document.body.removeChild(link));
}

function updateDownloadFilename(cardData, options = {}) {
  const {
    slider,
    scaleSlider,
    filenameInput,
    downloadBtn,
    baseName,
    outputFormatSelect,
    filenameSuffix,
  } = cardData;
  const scalePercent = clamp(Number(scaleSlider.value) || 100, 10, 100);
  const qualityPercent = clamp(Number(slider.value) || 80, 1, 100);
  const resolvedScale = options.scalePercent ?? scalePercent;
  const resolvedQuality = options.qualityPercent ?? qualityPercent;

  const selectedFormat = resolveOutputFormat(outputFormatSelect?.value || cardData.outputFormat);
  cardData.outputFormat = selectedFormat;
  const outputConfig = OUTPUT_FORMATS[selectedFormat];

  const fallbackBase = `${baseName}_${resolvedScale}pct_${resolvedQuality}qual`;
  const rawInput = filenameInput.value ?? '';
  const trimmed = rawInput.trim();
  const knownExtensions = Object.values(OUTPUT_FORMATS).map((format) => format.extension);
  const withoutExtension = knownExtensions.reduce((value, extension) => {
    const suffix = `.${extension}`;
    return value.toLowerCase().endsWith(suffix) ? value.slice(0, -suffix.length) : value;
  }, trimmed);
  const sanitizedBase = sanitizeFilenameBase(withoutExtension) || sanitizeFilenameBase(fallbackBase);
  const finalBase = sanitizedBase || 'image-converted';
  const filename = ensureFileExtension(finalBase, outputConfig.extension);

  if (downloadBtn?.dataset) {
    downloadBtn.dataset.filename = filename;
  }
  if (filenameSuffix) {
    filenameSuffix.textContent = `.${outputConfig.extension}`;
  }
  if (downloadBtn) {
    downloadBtn.textContent = `Télécharger en ${outputConfig.label}`;
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

  let index = 1;
  for (const cardData of imagesState.values()) {
    await updateConversion(cardData);
    const dataUrl = cardData.convertedDataUrl;
    if (!dataUrl) {
      continue;
    }

    const fallbackFormat = resolveOutputFormat(cardData.outputFormat);
    const fallbackExtension = OUTPUT_FORMATS[fallbackFormat].extension;
    const filename = cardData.downloadBtn?.dataset?.filename
      || `${cardData.file.name.replace(/\.[^.]+$/, '')}_${index}.${fallbackExtension}`;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    index += 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
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
