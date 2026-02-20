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
const CSS_COLOR_TEST_ELEMENT = document.createElement('span');

function normalizeBackgroundColor(value = '') {
  const raw = value.trim();
  if (!raw) {
    return 'transparent';
  }

  if (/^transparent$/i.test(raw)) {
    return 'transparent';
  }

  const isShorthandHex = /^#([\da-f]{3}|[\da-f]{4})$/i.test(raw);
  const isFullHex = /^#([\da-f]{6}|[\da-f]{8})$/i.test(raw);

  if (isShorthandHex || isFullHex) {
    return raw.toLowerCase();
  }

  CSS_COLOR_TEST_ELEMENT.style.color = '';
  CSS_COLOR_TEST_ELEMENT.style.color = raw;
  if (!CSS_COLOR_TEST_ELEMENT.style.color) {
    return null;
  }

  return raw.toLowerCase();
}


function colorDistanceSquared(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function getBorderReferenceColor(imageData) {
  const { data, width, height } = imageData;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 60));

  for (let x = 0; x < width; x += sampleStep) {
    let top = (x * 4);
    let bottom = ((height - 1) * width + x) * 4;
    if (data[top + 3] > 0) {
      r += data[top];
      g += data[top + 1];
      b += data[top + 2];
      count += 1;
    }
    if (data[bottom + 3] > 0) {
      r += data[bottom];
      g += data[bottom + 1];
      b += data[bottom + 2];
      count += 1;
    }
  }

  for (let y = 0; y < height; y += sampleStep) {
    let left = (y * width) * 4;
    let right = (y * width + (width - 1)) * 4;
    if (data[left + 3] > 0) {
      r += data[left];
      g += data[left + 1];
      b += data[left + 2];
      count += 1;
    }
    if (data[right + 3] > 0) {
      r += data[right];
      g += data[right + 1];
      b += data[right + 2];
      count += 1;
    }
  }

  if (!count) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

function removeBackgroundLikeBgremove(imageData, tolerance = 45) {
  const { data, width, height } = imageData;
  const reference = getBorderReferenceColor(imageData);
  const threshold = Math.max(10, Math.min(160, tolerance));
  const thresholdSquared = threshold * threshold;
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (data[i + 3] === 0) {
      visited[idx] = 1;
      return;
    }

    const dist = colorDistanceSquared(data[i], data[i + 1], data[i + 2], reference.r, reference.g, reference.b);
    if (dist <= thresholdSquared) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = Math.floor(idx / width);

    const alphaIndex = idx * 4 + 3;
    data[alphaIndex] = 0;

    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return imageData;
}

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

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getDimensionsFromPercent(originalWidth, originalHeight, percent) {
  const ratio = clamp(percent, 1, 100) / 100;
  return {
    width: Math.max(1, Math.round(originalWidth * ratio)),
    height: Math.max(1, Math.round(originalHeight * ratio)),
  };
}

function getDimensionsFromPixels(originalWidth, originalHeight, targetWidth, targetHeight, keepProportions) {
  if (keepProportions) {
    const widthRatio = targetWidth ? targetWidth / originalWidth : Infinity;
    const heightRatio = targetHeight ? targetHeight / originalHeight : Infinity;
    const ratio = Math.min(widthRatio, heightRatio, 1);

    return {
      width: Math.max(1, Math.round(originalWidth * ratio)),
      height: Math.max(1, Math.round(originalHeight * ratio)),
    };
  }

  return {
    width: Math.max(1, Math.min(targetWidth || originalWidth, originalWidth)),
    height: Math.max(1, Math.min(targetHeight || originalHeight, originalHeight)),
  };
}

function createCard(file, dataUrl) {
  const { content } = template;
  const card = content.firstElementChild.cloneNode(true);
  const thumbnail = card.querySelector('.card__thumbnail');
  const title = card.querySelector('.card__title');
  const meta = card.querySelector('.card__meta');
  const slider = card.querySelector('.compression-slider');
  const compressionValue = card.querySelector('.compression-value') || card.querySelector('.slider-value');
  const sizeTabButtons = [...card.querySelectorAll('.size-tab-btn')];
  const sizePanels = [...card.querySelectorAll('.size-panel')];
  const percentRadios = [...card.querySelectorAll('.percent-radio')];
  const keepProportionsCheckbox = card.querySelector('.keep-proportions-checkbox');
  const originalSize = card.querySelector('.original-size');
  const convertedSize = card.querySelector('.converted-size');
  const originalDim = card.querySelector('.original-dimensions');
  const newDim = card.querySelector('.new-dimensions');
  const resizeWidthInput = card.querySelector('.resize-width-input');
  const resizeHeightInput = card.querySelector('.resize-height-input');
  const downloadBtn = card.querySelector('.download-btn');
  const filenameInput = card.querySelector('.filename-input');
  const removeBtn = card.querySelector('.card__remove');
  const outputFormatSelect = card.querySelector('.output-format-select');
  const filenameSuffix = card.querySelector('.filename-suffix');
  const backgroundColorInput = card.querySelector('.background-color-input');
  const backgroundColorPicker = card.querySelector('.background-color-picker');
  const backgroundRemoveCheckbox = card.querySelector('.background-remove-checkbox');
  const backgroundToleranceSlider = card.querySelector('.background-tolerance-slider');
  const backgroundToleranceValue = card.querySelector('.background-tolerance-value');

  const baseName = getFileBaseName(file.name);
  const radioGroupName = `percentPreset_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  percentRadios.forEach((radio) => {
    radio.name = radioGroupName;
  });

  title.textContent = file.name;
  meta.textContent = `Format: ${(file.type || 'image/jpeg').split('/')[1]?.toUpperCase() ?? 'JPG'}`;
  originalSize.textContent = formatBytes(file.size);
  if (compressionValue) {
    compressionValue.textContent = `${slider.value}%`;
  }
  if (backgroundToleranceValue) {
    backgroundToleranceValue.textContent = backgroundToleranceSlider.value;
  }
  filenameInput.value = baseName;

  const cardData = {
    file,
    card,
    slider,
    compressionValue,
    sizeTabButtons,
    sizePanels,
    percentRadios,
    keepProportionsCheckbox,
    originalSize,
    convertedSize,
    originalDim,
    newDim,
    resizeWidthInput,
    resizeHeightInput,
    downloadBtn,
    filenameInput,
    removeBtn,
    outputFormatSelect,
    filenameSuffix,
    backgroundColorInput,
    backgroundColorPicker,
    backgroundRemoveCheckbox,
    backgroundToleranceSlider,
    backgroundToleranceValue,
    baseName,
    imageElement: new Image(),
    originalWidth: 0,
    originalHeight: 0,
    convertedDataUrl: dataUrl,
    originalBytes: file.size,
    convertedBytes: file.size,
    outputFormat: 'webp',
    backgroundColor: 'transparent',
    backgroundRemovalEnabled: false,
    backgroundTolerance: 45,
    sizeMode: 'pixels',
    keepProportions: true,
    maxWidth: null,
    maxHeight: null,
    percentPreset: 75,
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

  const updateActiveSizeTab = (mode) => {
    cardData.sizeMode = mode;
    sizeTabButtons.forEach((button) => {
      const isActive = button.dataset.sizeTab === mode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    sizePanels.forEach((panel) => {
      panel.classList.toggle('is-hidden', panel.dataset.sizePanel !== mode);
    });
    debounceUpdate(cardData);
  };

  sizeTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      updateActiveSizeTab(button.dataset.sizeTab === 'percent' ? 'percent' : 'pixels');
    });
  });

  const updateResizeConstraint = (field, input, oppositeInput = null) => {
    const parsed = parsePositiveInteger(input.value);
    if (input.value.trim() === '') {
      cardData[field] = null;
      input.classList.remove('is-invalid');
      debounceUpdate(cardData);
      return;
    }

    if (!parsed) {
      input.classList.add('is-invalid');
      return;
    }

    cardData[field] = parsed;
    input.value = String(parsed);
    input.classList.remove('is-invalid');

    if (cardData.keepProportions && oppositeInput && cardData.originalWidth && cardData.originalHeight) {
      if (field === 'maxWidth') {
        const computedHeight = Math.round((parsed / cardData.originalWidth) * cardData.originalHeight);
        cardData.maxHeight = Math.max(1, computedHeight);
        oppositeInput.value = String(cardData.maxHeight);
      } else if (field === 'maxHeight') {
        const computedWidth = Math.round((parsed / cardData.originalHeight) * cardData.originalWidth);
        cardData.maxWidth = Math.max(1, computedWidth);
        oppositeInput.value = String(cardData.maxWidth);
      }
      oppositeInput.classList.remove('is-invalid');
    }

    debounceUpdate(cardData);
  };

  resizeWidthInput.addEventListener('input', () => {
    updateResizeConstraint('maxWidth', resizeWidthInput, resizeHeightInput);
  });

  resizeHeightInput.addEventListener('input', () => {
    updateResizeConstraint('maxHeight', resizeHeightInput, resizeWidthInput);
  });

  keepProportionsCheckbox.addEventListener('change', () => {
    cardData.keepProportions = keepProportionsCheckbox.checked;
    debounceUpdate(cardData);
  });

  percentRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) {
        return;
      }
      cardData.percentPreset = clamp(Number(radio.value) || 75, 1, 100);
      debounceUpdate(cardData);
    });
  });

  filenameInput.addEventListener('input', () => {
    updateDownloadFilename(cardData);
  });

  outputFormatSelect.addEventListener('change', () => {
    cardData.outputFormat = resolveOutputFormat(outputFormatSelect.value);
    updateDownloadFilename(cardData);
    updateConversion(cardData);
  });

  backgroundColorInput.addEventListener('input', () => {
    const normalized = normalizeBackgroundColor(backgroundColorInput.value);
    if (!normalized) {
      backgroundColorInput.classList.add('is-invalid');
      return;
    }

    backgroundColorInput.classList.remove('is-invalid');
    cardData.backgroundColor = normalized;
    if (/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(normalized)) {
      backgroundColorPicker.value = normalized;
    }
    debounceUpdate(cardData);
  });

  backgroundColorPicker.addEventListener('input', () => {
    const normalized = normalizeBackgroundColor(backgroundColorPicker.value);
    cardData.backgroundColor = normalized || '#ffffff';
    backgroundColorInput.value = cardData.backgroundColor;
    backgroundColorInput.classList.remove('is-invalid');
    debounceUpdate(cardData);
  });

  backgroundRemoveCheckbox.addEventListener('change', () => {
    cardData.backgroundRemovalEnabled = backgroundRemoveCheckbox.checked;
    debounceUpdate(cardData);
  });

  backgroundToleranceSlider.addEventListener('input', () => {
    const tolerance = clamp(Number(backgroundToleranceSlider.value) || 45, 10, 160);
    backgroundToleranceSlider.value = tolerance;
    cardData.backgroundTolerance = tolerance;
    if (backgroundToleranceValue) {
      backgroundToleranceValue.textContent = `${tolerance}`;
    }
    debounceUpdate(cardData);
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
    convertedSize,
    newDim,
    downloadBtn,
    card,
    outputFormat,
    backgroundColor,
    backgroundRemovalEnabled,
    backgroundTolerance,
    sizeMode,
    maxWidth,
    maxHeight,
    keepProportions,
    percentPreset,
  } = cardData;

  if (!gallery.contains(card)) {
    return;
  }

  if (!imageElement.naturalWidth || !imageElement.naturalHeight) {
    return;
  }

  const qualityPercent = clamp(Number(slider.value) || 80, 1, 100);
  const quality = clamp(qualityPercent / 100, 0.01, 1);

  const dimensions = sizeMode === 'percent'
    ? getDimensionsFromPercent(imageElement.naturalWidth, imageElement.naturalHeight, percentPreset)
    : getDimensionsFromPixels(imageElement.naturalWidth, imageElement.naturalHeight, maxWidth, maxHeight, keepProportions);

  const newWidth = dimensions.width;
  const newHeight = dimensions.height;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = Math.max(newWidth, 1);
  sourceCanvas.height = Math.max(newHeight, 1);
  const sourceCtx = sourceCanvas.getContext('2d');
  sourceCtx.drawImage(imageElement, 0, 0, sourceCanvas.width, sourceCanvas.height);

  let processedImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  if (backgroundRemovalEnabled) {
    processedImageData = removeBackgroundLikeBgremove(processedImageData, backgroundTolerance);
  }

  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext('2d');
  if (backgroundColor && backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.putImageData(processedImageData, 0, 0);

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
  updateDownloadFilename(cardData, { qualityPercent });
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
    filenameInput,
    downloadBtn,
    baseName,
    outputFormatSelect,
    filenameSuffix,
    sizeMode,
    percentPreset,
    maxWidth,
    maxHeight,
  } = cardData;
  const qualityPercent = clamp(Number(slider.value) || 80, 1, 100);
  const resolvedQuality = options.qualityPercent ?? qualityPercent;

  const selectedFormat = resolveOutputFormat(outputFormatSelect?.value || cardData.outputFormat);
  cardData.outputFormat = selectedFormat;
  const outputConfig = OUTPUT_FORMATS[selectedFormat];

  const sizeToken = sizeMode === 'percent'
    ? `${percentPreset}pct`
    : `${maxWidth || 'auto'}x${maxHeight || 'auto'}px`;
  const fallbackBase = `${baseName}_${sizeToken}_${resolvedQuality}qual`;
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
