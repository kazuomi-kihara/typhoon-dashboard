/**
 * app.js
 * 台風情報ダッシュボード 全統合スクリプト
 */

// ============================================================
// bst-parser.js 
// ============================================================
function gradeLabel(code) {
    const grades = {
        '2': '熱帯低気圧 (TD)',
        '3': '台風 (TS)',
        '4': '強い台風 (STS)',
        '5': '非常に強い台風 (TY)',
        '6': '温帯低気圧 (L)',
        '7': '領域に入った',
        '9': 'TS以上の熱帯低気圧'
    };
    return grades[code] || '不明';
}

function directionLabel(code) {
    const dirs = {
        '0': 'なし', '1': '北東', '2': '東', '3': '南東',
        '4': '南', '5': '南西', '6': '西', '7': '北西',
        '8': '北', '9': '対称円'
    };
    return dirs[code] || '不明';
}

function parseBestTrack(text, startYear, endYear) {
    const lines = text.split('\n');
    const typhoons = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trimEnd();
        if (!line.startsWith('66666')) {
            i++;
            continue;
        }

        const header = parseHeaderLine(line);
        if (!header) {
            i++;
            continue;
        }

        const year = header.year;
        if (startYear && year < startYear) {
            i += 1 + header.dataLineCount;
            continue;
        }
        if (endYear && year > endYear) {
            i += 1 + header.dataLineCount;
            continue;
        }

        const dataPoints = [];
        for (let j = 0; j < header.dataLineCount; j++) {
            i++;
            if (i >= lines.length) break;
            const dataLine = lines[i].trimEnd();
            const point = parseDataLine(dataLine);
            if (point) {
                dataPoints.push(point);
            }
        }

        typhoons.push({
            id: header.internationalId,
            name: header.name,
            year: header.year,
            tcNumber: header.tcNumber,
            lastFlag: header.lastFlag,
            revisionDate: header.revisionDate,
            track: dataPoints,
            maxWind: Math.max(...dataPoints.map(p => p.maxWind).filter(w => w > 0), 0),
            minPressure: Math.min(...dataPoints.map(p => p.pressure).filter(p => p > 0), 9999),
            maxGrade: Math.max(...dataPoints.map(p => parseInt(p.grade) || 0), 0),
            landfall: dataPoints.some(p => p.landfall),
            startDate: dataPoints.length > 0 ? dataPoints[0].datetime : null,
            endDate: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].datetime : null
        });
        i++;
    }
    return typhoons;
}

function parseHeaderLine(line) {
    try {
        const internationalId = line.substring(6, 10).trim();
        const dataLineCount = parseInt(line.substring(12, 15).trim(), 10);
        const tcNumber = line.substring(16, 20).trim();
        const lastFlag = line.substring(26, 27).trim();
        const name = line.substring(30, 50).trim();
        const revisionDate = line.substring(64, 72).trim();

        const idNum = parseInt(internationalId, 10);
        let year;
        if (idNum >= 5100) {
            year = 1900 + Math.floor(idNum / 100);
        } else {
            year = 2000 + Math.floor(idNum / 100);
        }

        return { internationalId, dataLineCount, tcNumber, lastFlag, name: name || '(名称なし)', revisionDate, year };
    } catch (e) { return null; }
}

function parseDataLine(line) {
    try {
        const timeStr = line.substring(0, 8).trim();
        const grade = line.substring(13, 14).trim();
        const latRaw = parseInt(line.substring(15, 18).trim(), 10);
        const lonRaw = parseInt(line.substring(19, 23).trim(), 10);
        const pressure = parseInt(line.substring(24, 28).trim(), 10);
        const maxWind = parseInt(line.substring(33, 36).trim(), 10);

        const dir50 = line.substring(41, 42).trim();
        const longRadius50 = parseInt(line.substring(42, 46).trim(), 10) || 0;
        const shortRadius50 = parseInt(line.substring(47, 51).trim(), 10) || 0;

        const dir30 = line.substring(52, 53).trim();
        const longRadius30 = parseInt(line.substring(53, 57).trim(), 10) || 0;
        const shortRadius30 = parseInt(line.substring(58, 62).trim(), 10) || 0;

        const landfallFlag = line.length > 71 ? line.substring(71, 72).trim() : '';

        const lat = latRaw / 10;
        const lon = lonRaw / 10;

        let fullYear;
        const yy = parseInt(timeStr.substring(0, 2), 10);
        if (yy >= 51) {
            fullYear = 1900 + yy;
        } else {
            fullYear = 2000 + yy;
        }
        const month = timeStr.substring(2, 4);
        const day = timeStr.substring(4, 6);
        const hour = timeStr.substring(6, 8);
        const datetime = `${fullYear}-${month}-${day}T${hour}:00:00Z`;

        return {
            datetime, grade, gradeLabel: gradeLabel(grade), lat, lon,
            pressure: isNaN(pressure) ? 0 : pressure,
            maxWind: isNaN(maxWind) ? 0 : maxWind,
            maxWindMs: isNaN(maxWind) ? 0 : Math.round(maxWind * 0.5144 * 10) / 10,
            wind50: { direction: directionLabel(dir50), longRadius: longRadius50, shortRadius: shortRadius50 },
            wind30: { direction: directionLabel(dir30), longRadius: longRadius30, shortRadius: shortRadius30 },
            landfall: landfallFlag === '#'
        };
    } catch (e) { return null; }
}

// ============================================================
// jma-realtime.js 
// ============================================================
function getSampleTyphoonData() {
    return [{
        id: 'SAMPLE_2026_01',
        name: 'サンプル台風',
        internationalId: '2601',
        isActive: true,
        current: {
            datetime: new Date().toISOString(),
            lat: 25.3, lon: 131.5, pressure: 965, maxWind: 75, maxWindMs: 38.6,
            grade: '5', gradeLabel: '非常に強い台風 (TY)', direction: '北北西', speed: 20
        },
        track: [
            { lat: 15.2, lon: 140.5, datetime: '2026-07-08T00:00:00Z', pressure: 1002, maxWind: 30, maxWindMs: 15.4 },
            { lat: 16.8, lon: 139.2, datetime: '2026-07-08T06:00:00Z', pressure: 998, maxWind: 35, maxWindMs: 18.0 },
            { lat: 18.1, lon: 137.8, datetime: '2026-07-08T12:00:00Z', pressure: 992, maxWind: 45, maxWindMs: 23.1 },
            { lat: 19.5, lon: 136.5, datetime: '2026-07-09T00:00:00Z', pressure: 985, maxWind: 55, maxWindMs: 28.3 },
            { lat: 21.0, lon: 135.0, datetime: '2026-07-09T12:00:00Z', pressure: 975, maxWind: 65, maxWindMs: 33.4 },
            { lat: 22.8, lon: 133.8, datetime: '2026-07-10T00:00:00Z', pressure: 970, maxWind: 70, maxWindMs: 36.0 },
            { lat: 24.1, lon: 132.5, datetime: '2026-07-10T12:00:00Z', pressure: 967, maxWind: 73, maxWindMs: 37.5 },
            { lat: 25.3, lon: 131.5, datetime: '2026-07-11T00:00:00Z', pressure: 965, maxWind: 75, maxWindMs: 38.6 }
        ],
        forecast: [
            { label: '12時間後', hours: 12, lat: 26.8, lon: 130.2, pressure: 960, maxWind: 80, maxWindMs: 41.1, errorRadius: 80 },
            { label: '24時間後', hours: 24, lat: 28.5, lon: 129.0, pressure: 955, maxWind: 85, maxWindMs: 43.7, errorRadius: 150 },
            { label: '48時間後', hours: 48, lat: 31.2, lon: 130.5, pressure: 965, maxWind: 70, maxWindMs: 36.0, errorRadius: 280 }
        ],
        warnings: [
            { area: '沖縄本島地方', level: 'warning', type: '暴風警報' },
            { area: '鹿児島県奄美地方', level: 'advisory', type: '強風注意報' },
            { area: '宮崎県', level: 'advisory', type: '波浪注意報' }
        ]
    }];
}

async function fetchRealtimeTyphoons() {
    const TYPHOON_LIST_URL = 'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json';
    const PROXY_URL = `https://api.allorigins.win/get?url=${encodeURIComponent(TYPHOON_LIST_URL)}`;
    
    // 1. 直接取得（タイムアウト 3秒）
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(TYPHOON_LIST_URL, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                const typhoons = [];
                for (const entry of data) {
                    try {
                        const detail = await fetchTyphoonDetail(entry);
                        if (detail) typhoons.push(detail);
                    } catch (e) {}
                }
                if (typhoons.length > 0) return typhoons;
            }
        }
    } catch (e) {
        console.warn('直接データ取得失敗/タイムアウト。プロキシで再試行中...', e);
    }

    // 2. プロキシ経由で試行（タイムアウト 4秒）
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(PROXY_URL, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();
            const data = JSON.parse(result.contents);
            if (Array.isArray(data) && data.length > 0) {
                const typhoons = [];
                for (const entry of data) {
                    try {
                        const detail = await fetchTyphoonDetail(entry);
                        if (detail) typhoons.push(detail);
                    } catch (e) {}
                }
                if (typhoons.length > 0) return typhoons;
            }
        }
    } catch (e) {
        console.warn('プロキシデータ取得失敗:', e);
    }

    return [];
}

async function fetchTyphoonDetail(entry) {
    try {
        const eventId = entry.eventId || entry.id || entry.tropicalCyclone;
        const url = `https://www.jma.go.jp/bosai/typhoon/data/${eventId}/specifications.json`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return normalizeJMAData(data, entry);
    } catch (e) { return normalizeBasicEntry(entry); }
}

function normalizeJMAData(data, entry) {
    if (!Array.isArray(data)) return normalizeBasicEntry(entry);
    const titlePart = data.find(d => d.part === 'title' || d.typhoonNumber);
    const nameStr = titlePart?.name?.jp || titlePart?.name?.en || entry.name || '名称不明';
    
    let rawNumber = titlePart?.typhoonNumber || entry.internationalId || entry.typhoonNumber || '';
    if (rawNumber && rawNumber.length === 4) {
        rawNumber = parseInt(rawNumber.slice(-2), 10).toString();
    }
    
    return {
        id: entry.eventId || entry.id || entry.tropicalCyclone || 'UNKNOWN',
        name: nameStr,
        internationalId: rawNumber,
        isActive: true,
        current: extractCurrentPosition(data),
        track: extractTrack(data),
        forecast: extractForecast(data),
        warnings: []
    };
}

function normalizeBasicEntry(entry) {
    return {
        id: entry.eventId || entry.id || entry.tropicalCyclone || 'UNKNOWN',
        name: entry.name || '名称不明',
        internationalId: entry.internationalId || entry.typhoonNumber || '',
        isActive: true,
        current: {
            datetime: new Date().toISOString(), lat: entry.lat || 0, lon: entry.lon || 0,
            pressure: entry.pressure || 0, maxWind: entry.maxWind || 0,
            maxWindMs: (entry.maxWind || 0) * 0.5144, grade: '3', gradeLabel: '台風'
        },
        track: [], forecast: [], warnings: []
    };
}

function extractCurrentPosition(data) {
    if (!Array.isArray(data)) return { lat: 0, lon: 0 };
    const analysis = data.find(d => d.part?.en === 'Analysis' || d.part?.jp === '実況');
    if (!analysis) return { lat: 0, lon: 0 };
    return {
        datetime: analysis.validtime?.UTC || new Date().toISOString(),
        lat: analysis.position?.deg?.[0] || 0,
        lon: analysis.position?.deg?.[1] || 0,
        pressure: parseInt(analysis.pressure) || 0,
        maxWind: parseInt(analysis.maximumWind?.sustained?.kt) || 0,
        maxWindMs: parseInt(analysis.maximumWind?.sustained?.['m/s']) || 0,
        grade: '3',
        gradeLabel: analysis.category?.jp || '台風'
    };
}

function extractTrack(data) {
    if (!Array.isArray(data)) return [];
    const analysis = data.find(d => d.part?.en === 'Analysis' || d.part?.jp === '実況');
    if (analysis && analysis.position) {
        return [{
            lat: analysis.position.deg?.[0] || 0,
            lon: analysis.position.deg?.[1] || 0,
            datetime: analysis.validtime?.UTC || '',
            pressure: parseInt(analysis.pressure) || 0,
            maxWind: parseInt(analysis.maximumWind?.sustained?.kt) || 0,
            maxWindMs: parseInt(analysis.maximumWind?.sustained?.['m/s']) || 0
        }];
    }
    return [];
}

function extractForecast(data) {
    if (!Array.isArray(data)) return [];
    const forecasts = data.filter(d => d.part?.en?.startsWith('Forecast') || d.part?.jp?.startsWith('予報'));
    return forecasts.map(f => ({
        label: f.part?.jp || f.part?.en || `${f.advancedHours}時間後`,
        hours: f.advancedHours || 0,
        lat: f.position?.deg?.[0] || 0,
        lon: f.position?.deg?.[1] || 0,
        pressure: parseInt(f.pressure) || 0,
        maxWind: parseInt(f.maximumWind?.sustained?.kt) || 0,
        maxWindMs: parseInt(f.maximumWind?.sustained?.['m/s']) || 0,
        errorRadius: f.probabilityCircleRadius?.km || 100
    }));
}

function extractWarnings(data) {
    return [];
}

function getRadarTileUrl() { return 'https://www.jma.go.jp/bosai/jmatile/data/nowc/{time}/none/{z}/{x}/{y}.png'; }
function getRainViewerTileUrl() { return 'https://tilecache.rainviewer.com/v2/radar/{ts}/256/{z}/{x}/{y}/2/1_1.png'; }
async function fetchRainViewerTimestamps() {
    try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.radar?.past?.map(item => item.path) || [];
    } catch (e) { return []; }
}

// ============================================================
// data-manager.js 
// ============================================================
const DB_NAME = 'TyphoonDashboardDB';
const DB_VERSION = 1;
const STORE_TYPHOONS = 'typhoons';
const STORE_META = 'metadata';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_TYPHOONS)) {
                const store = db.createObjectStore(STORE_TYPHOONS, { keyPath: 'id' });
                store.createIndex('year', 'year', { unique: false });
                store.createIndex('maxWind', 'maxWind', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveMeta(key, value) {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

async function getMeta(key) {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const request = tx.objectStore(STORE_META).get(key);
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result?.value ?? null); request.onerror = () => reject(request.error); });
}

async function saveTyphoons(typhoons) {
    const db = await openDB();
    const tx = db.transaction(STORE_TYPHOONS, 'readwrite');
    const store = tx.objectStore(STORE_TYPHOONS);
    for (const t of typhoons) store.put(t);
    return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

async function getAllTyphoons() {
    const db = await openDB();
    const tx = db.transaction(STORE_TYPHOONS, 'readonly');
    const request = tx.objectStore(STORE_TYPHOONS).getAll();
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function getTyphoonsByYearRange(startYear, endYear) {
    const db = await openDB();
    const tx = db.transaction(STORE_TYPHOONS, 'readonly');
    const index = tx.objectStore(STORE_TYPHOONS).index('year');
    const range = IDBKeyRange.bound(startYear, endYear);
    const request = index.getAll(range);
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function getTyphoonCount() {
    const db = await openDB();
    const tx = db.transaction(STORE_TYPHOONS, 'readonly');
    const request = tx.objectStore(STORE_TYPHOONS).count();
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function clearAllData() {
    const db = await openDB();
    const tx = db.transaction([STORE_TYPHOONS, STORE_META], 'readwrite');
    tx.objectStore(STORE_TYPHOONS).clear();
    tx.objectStore(STORE_META).clear();
    return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

async function downloadAndParseBestTrack(startYear, endYear, onProgress) {
    const BST_URL = 'https://www.jma.go.jp/jma/jma-eng/jma-center/rsmc-hp-pub-eg/Besttracks/bst_all.zip';
    onProgress?.('ベストトラックデータをダウンロード中...');
    let zipData;
    try {
        const response = await fetch(BST_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        zipData = await response.arrayBuffer();
    } catch (e) {
        onProgress?.('⚠ CORSエラーのため、手動で取得してください。');
        throw new Error('直接ダウンロードがブロックされました。');
    }
    onProgress?.('ZIPを解凍中...');
    const zip = await JSZip.loadAsync(zipData);
    let textContent = '';
    for (const [filename, file] of Object.entries(zip.files)) {
        if (filename.endsWith('.txt') || filename.includes('bst')) {
            textContent += await file.async('text');
            textContent += '\n';
        }
    }
    if (!textContent) throw new Error('データが見つかりません');
    const typhoons = parseBestTrack(textContent, startYear, endYear);
    await saveTyphoons(typhoons);
    await saveMeta('lastUpdate', new Date().toISOString());
    await saveMeta('yearRange', { start: startYear, end: endYear });
    await saveMeta('totalCount', typhoons.length);
    onProgress?.(`✅ ${typhoons.length} 件保存完了`);
    return typhoons.length;
}

// ============================================================
// map-renderer.js 
// ============================================================
const COLORS = {
    track: '#ff6b4a', trackPast: '#ff9a76', forecast12h: '#00d4ff', forecast24h: '#4dd0e1',
    forecast48h: '#80cbc4', forecastLine: 'rgba(0, 212, 255, 0.6)', warningHigh: '#ef5350',
    warningMid: '#ffa726', warningLow: '#ffd54f',
    heatmapGradient: { 0.2: '#0d47a1', 0.4: '#1565c0', 0.6: '#ffa726', 0.8: '#ff6b4a', 1.0: '#ef5350' },
    comparisonColors: ['#ab47bc', '#26a69a', '#ec407a']
};

let map = null;
let layerGroups = { currentTrack: null, currentPosition: null, forecastCircles: null, forecastLine: null, warnings: null, radar: null, heatmap: null, comparison: [], userLocation: null, anim: null };

function initMap(containerId) {
    map = L.map(containerId, { center: [34, 136], zoom: 4.5, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ | Weather by <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a>'
    }).addTo(map);
    Object.keys(layerGroups).forEach(key => { if (key === 'comparison') { layerGroups[key] = []; } else { layerGroups[key] = L.layerGroup().addTo(map); } });
    return map;
}

function getMap() { return map; }

function createTyphoonIcon(grade) {
    const size = grade >= 5 ? 40 : grade >= 3 ? 32 : 24;
    const color = grade >= 5 ? COLORS.warningHigh : grade >= 4 ? COLORS.warningMid : COLORS.track;
    return L.divIcon({
        html: `<div class="typhoon-icon" style="width:${size}px;height:${size}px;"><svg viewBox="0 0 100 100" width="${size}" height="${size}"><circle cx="50" cy="50" r="8" fill="${color}" /><path d="M50 10 C70 30, 90 50, 50 50 C90 50, 70 70, 50 90 C30 70, 10 50, 50 50 C10 50, 30 30, 50 10Z" fill="none" stroke="${color}" stroke-width="3" opacity="0.8"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/></path><circle cx="50" cy="50" r="30" fill="none" stroke="${color}" stroke-width="2" opacity="0.4"><animate attributeName="r" values="25;35;25" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite"/></circle></svg></div>`,
        className: 'typhoon-div-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2]
    });
}

function drawTrack(track) {
    layerGroups.currentTrack.clearLayers();
    if (!track || track.length === 0) return;
    const latlngs = track.map(p => [p.lat, p.lon]);
    L.polyline(latlngs, { color: COLORS.track, weight: 6, opacity: 0.2, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroups.currentTrack);
    L.polyline(latlngs, { color: COLORS.track, weight: 3, opacity: 0.8, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroups.currentTrack);
    track.forEach((p, i) => {
        if (i !== track.length - 1) {
            L.circleMarker([p.lat, p.lon], { radius: 3, color: COLORS.track, fillColor: COLORS.track, fillOpacity: 0.6, weight: 1 })
                .bindPopup(`<div class="map-popup"><strong>${p.datetime ? new Date(p.datetime).toLocaleString('ja-JP') : ''}</strong><br>気圧: ${p.pressure || '-'} hPa<br>最大風速: ${p.maxWindMs || '-'} m/s</div>`)
                .addTo(layerGroups.currentTrack);
        }
    });
}

function drawCurrentPosition(current) {
    layerGroups.currentPosition.clearLayers();
    if (!current || !current.lat || !current.lon) return;
    const grade = parseInt(current.grade) || 3;
    const icon = createTyphoonIcon(grade);
    L.marker([current.lat, current.lon], { icon }).bindPopup(`<div class="map-popup"><strong>現在位置</strong><br>${current.gradeLabel || ''}<br>緯度: ${current.lat.toFixed(1)}° 経度: ${current.lon.toFixed(1)}°<br>中心気圧: <strong>${current.pressure || '-'} hPa</strong><br>最大風速: <strong>${current.maxWindMs || '-'} m/s</strong></div>`).addTo(layerGroups.currentPosition);
}

function drawForecast(current, forecast) {
    layerGroups.forecastCircles.clearLayers();
    layerGroups.forecastLine.clearLayers();
    if (!forecast || forecast.length === 0 || !current) return;
    const forecastColors = [COLORS.forecast12h, COLORS.forecast24h, COLORS.forecast48h];
    const forecastTrack = [[current.lat, current.lon]];
    forecast.forEach((f, i) => {
        if (!f.lat || !f.lon) return;
        forecastTrack.push([f.lat, f.lon]);
        const color = forecastColors[i] || COLORS.forecast48h;
        const radiusKm = f.errorRadius || 100;
        L.circle([f.lat, f.lon], { radius: radiusKm * 1000, color: color, fillColor: color, fillOpacity: 0.08, weight: 2, dashArray: '6, 4', opacity: 0.6 })
            .bindPopup(`<div class="map-popup"><strong>${f.label || f.hours + '時間後'}</strong><br>予測位置: ${f.lat.toFixed(1)}° / ${f.lon.toFixed(1)}°<br>予測気圧: ${f.pressure || '-'} hPa<br>予測風速: ${f.maxWindMs || '-'} m/s<br>予報円半径: ${radiusKm} km</div>`)
            .addTo(layerGroups.forecastCircles);
        L.circleMarker([f.lat, f.lon], { radius: 5, color: color, fillColor: color, fillOpacity: 0.8, weight: 2 }).addTo(layerGroups.forecastCircles);
    });
    if (forecastTrack.length > 1) {
        L.polyline(forecastTrack, { color: COLORS.forecastLine, weight: 2, dashArray: '8, 6', opacity: 0.7 }).addTo(layerGroups.forecastLine);
    }
}

/**
 * 気温ヒートマップ：Open-Meteoから日本各地の現在気温を取得して描画
 * 高温(38℃+)→濃赤、中温(31℃)→黄、低温(25℃-)→青紫
 */
async function drawHeatmap() {
    layerGroups.heatmap.clearLayers();

    // 日本をカバーするグリッド（緯度24〜46、経度123〜148、2度間隔）
    const gridPoints = [];
    for (let lat = 24; lat <= 46; lat += 2) {
        for (let lon = 123; lon <= 148; lon += 2) {
            gridPoints.push({ lat, lon });
        }
    }

    // 個別リクエストで各地点の気温を取得（10件ずつ並列実行）
    const fetchTemp = async (pt) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt.lat}&longitude=${pt.lon}&current=temperature_2m&timezone=Asia%2FTokyo&forecast_days=1`;
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            const temp = data.current && data.current.temperature_2m;
            if (temp == null) return null;
            return { lat: pt.lat, lon: pt.lon, temp };
        } catch (e) { return null; }
    };

    const CHUNK = 10;
    const allTemps = [];
    for (let i = 0; i < gridPoints.length; i += CHUNK) {
        const chunk = gridPoints.slice(i, i + CHUNK);
        const results = await Promise.all(chunk.map(fetchTemp));
        results.forEach(r => { if (r) allTemps.push(r); });
    }

    if (allTemps.length === 0) {
        alert('気温データの取得に失敗しました。\nネットワーク環境を確認してください。');
        return;
    }

    // 夏向けスケール：25℃=0（青）〜 38℃=1（濃赤）
    const MIN_TEMP = 25, MAX_TEMP = 38;
    const heatPoints = allTemps.map(function(d) {
        const intensity = Math.max(0, Math.min(1, (d.temp - MIN_TEMP) / (MAX_TEMP - MIN_TEMP)));
        return [d.lat, d.lon, intensity];
    });

    if (typeof L.heatLayer === 'function') {
        layerGroups.heatmap.addLayer(L.heatLayer(heatPoints, {
            radius: 80,
            blur: 60,
            maxZoom: 12,
            max: 1.0,
            minOpacity: 0.3,
            gradient: {
                0.0:  '#313695',
                0.2:  '#4575b4',
                0.4:  '#74add1',
                0.5:  '#fee090',
                0.7:  '#f46d43',
                0.85: '#d73027',
                1.0:  '#a50026'
            }
        }));
    }

    // コンソールに統計表示
    var temps = allTemps.map(function(d) { return d.temp; });
    console.log('[気温マップ] ' + allTemps.length + '地点取得完了 / 最高 ' + Math.max.apply(null, temps).toFixed(1) + '℃ / 最低 ' + Math.min.apply(null, temps).toFixed(1) + '℃');
}

async function toggleRadar(show) {
    layerGroups.radar.clearLayers();
    if (!show) return;
    try {
        const paths = await fetchRainViewerTimestamps();
        if (paths.length === 0) return;
        L.tileLayer(`https://tilecache.rainviewer.com${paths[paths.length - 1]}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0.5, attribution: '&copy; RainViewer', maxZoom: 18 }).addTo(layerGroups.radar);
    } catch (e) { console.warn('レーダーエラー:', e); }
}

function drawComparisonTracks(typhoons) {
    layerGroups.comparison.forEach(lg => { if (map.hasLayer(lg)) map.removeLayer(lg); });
    layerGroups.comparison = [];
    if (!typhoons || typhoons.length === 0) return;
    typhoons.forEach((t, idx) => {
        const color = COLORS.comparisonColors[idx] || '#888';
        const lg = L.layerGroup();
        if (t.track && t.track.length > 0) {
            L.polyline(t.track.map(p => [p.lat, p.lon]), { color: color, weight: 2.5, opacity: 0.7, dashArray: '4, 4' }).addTo(lg);
            
            // 暴風域・強風域の描画（データ量が多いので24時間毎=4データ毎に間引く）
            t.track.forEach((p, pIdx) => {
                if (pIdx % 4 === 0) {
                    if (p.wind50 && p.wind50.longRadius > 0) {
                        // 暴風域 (赤)
                        L.circle([p.lat, p.lon], { radius: p.wind50.longRadius * 1852, color: '#ef5350', weight: 1, fillColor: '#ef5350', fillOpacity: 0.05, opacity: 0.4 }).addTo(lg);
                    } else if (p.wind30 && p.wind30.longRadius > 0) {
                        // 強風域 (黄)
                        L.circle([p.lat, p.lon], { radius: p.wind30.longRadius * 1852, color: '#ffa726', weight: 1, fillColor: '#ffa726', fillOpacity: 0.05, opacity: 0.4 }).addTo(lg);
                    }
                }
            });

            const start = t.track[0];
            L.circleMarker([start.lat, start.lon], { radius: 4, color: color, fillColor: color, fillOpacity: 0.8 }).bindPopup(`<div class="map-popup"><strong>${t.name || t.id}</strong> (${t.year}年)<br>最大風速: ${t.maxWind || '-'} kt<br>最低気圧: ${t.minPressure || '-'} hPa</div>`).addTo(lg);
        }
        // 初期状態はマップに追加しない（レイヤーグループのみ保持）
        layerGroups.comparison.push(lg);
    });
}

function clearAllLayers() {
    Object.keys(layerGroups).forEach(key => {
        if (key === 'comparison') { layerGroups[key].forEach(lg => { if (map.hasLayer(lg)) map.removeLayer(lg); }); layerGroups[key] = []; } else { layerGroups[key]?.clearLayers(); }
    });
}

function focusOnPosition(lat, lon, zoom = 7) { if (map && lat && lon) { map.setView([lat, lon], zoom, { animate: true, duration: 1 }); } }

// ============================================================
// comparison.js 
// ============================================================
function calculateSimilarity(current, past) {
    if (!current || !past || !past.track || past.track.length === 0) return { total: 0, reasons: [] };

    // 【進路予想・季節気圧配置重視の重み設定】
    // 予報進路コース一致度: 45%, 発生季節・気圧配置一致度: 25%, 現在位置の近さ: 20%, 勢力（気圧・風速）: 10%
    const WEIGHT_FORECAST_ROUTE = 0.45;
    const WEIGHT_SEASON = 0.25;
    const WEIGHT_CURRENT_POS = 0.20;
    const WEIGHT_PRESSURE = 0.05;
    const WEIGHT_WIND = 0.05;

    let score = 0;
    const reasons = [];

    // ----------------------------------------------------
    // 1. 今後の「進路予想コース」とのルート一致度 (45%)
    // ----------------------------------------------------
    let forecastPoints = [];
    if (current.current && current.current.lat) {
        forecastPoints.push({ lat: current.current.lat, lon: current.current.lon });
    }
    if (current.forecast && current.forecast.length > 0) {
        current.forecast.forEach(f => forecastPoints.push({ lat: f.lat, lon: f.lon }));
    }

    if (forecastPoints.length > 0) {
        let totalDist = 0;
        forecastPoints.forEach(fPt => {
            let minDist = Infinity;
            past.track.forEach(pPt => {
                const dist = Math.sqrt(Math.pow(fPt.lat - pPt.lat, 2) + Math.pow(fPt.lon - pPt.lon, 2));
                if (dist < minDist) minDist = dist;
            });
            totalDist += minDist;
        });

        const avgDegreeDist = totalDist / forecastPoints.length;
        const avgKm = Math.round(avgDegreeDist * 111);

        const routeScore = Math.max(0, 1 - (avgDegreeDist / 15)) * WEIGHT_FORECAST_ROUTE;
        score += routeScore;

        if (avgKm < 150) {
            reasons.push(`🎯 **予想進路コースと酷似** (平均ズレ僅か 約${avgKm}km)`);
        } else if (avgKm < 350) {
            reasons.push(`🗺️ **予想進路と同じルートを通過** (平均ズレ 約${avgKm}km)`);
        } else {
            reasons.push(`↩️ 予想進路に近い進行方向`);
        }
    } else {
        score += WEIGHT_FORECAST_ROUTE * 0.3;
    }

    // ----------------------------------------------------
    // 2. 発生時期・季節による広域気圧配置の一致度 (25%)
    // ----------------------------------------------------
    let currentDate = null;
    if (current.current && current.current.datetime) {
        currentDate = new Date(current.current.datetime);
    } else {
        currentDate = new Date();
    }

    let pastDate = null;
    if (past.startDate) {
        pastDate = new Date(past.startDate);
    } else if (past.track && past.track[0] && past.track[0].datetime) {
        pastDate = new Date(past.track[0].datetime);
    }

    if (currentDate && pastDate && !isNaN(currentDate) && !isNaN(pastDate)) {
        // 通年での「日（1〜365日）」の差分を計算（太平洋高気圧の張り出し強度の季節類似性）
        const getDayOfYear = (d) => {
            const start = new Date(d.getFullYear(), 0, 0);
            const diff = d - start;
            const oneDay = 1000 * 60 * 60 * 24;
            return Math.floor(diff / oneDay);
        };

        const currentDay = getDayOfYear(currentDate);
        const pastDay = getDayOfYear(pastDate);

        let dayDiff = Math.abs(currentDay - pastDay);
        if (dayDiff > 182) dayDiff = 365 - dayDiff; // 年をまたぐ補正

        // 30日（1ヶ月）以内の発生であれば高評価
        const seasonScore = Math.max(0, 1 - (dayDiff / 60)) * WEIGHT_SEASON;
        score += seasonScore;

        const currentMonth = currentDate.getMonth() + 1;
        const pastMonth = pastDate.getMonth() + 1;
        if (dayDiff <= 15) {
            reasons.push(`☀️ **気圧配置パターンが酷似** (${currentMonth}月〜${pastMonth}月の同時期に発生)`);
        } else if (dayDiff <= 30) {
            reasons.push(`🌤️ **季節・気圧配置傾向が近い** (発生時期のズレ 約${dayDiff}日)`);
        }
    } else {
        score += WEIGHT_SEASON * 0.5;
    }

    // ----------------------------------------------------
    // 3. 現在地付近の通過有無 (20%)
    // ----------------------------------------------------
    if (current.current && current.current.lat && current.current.lon) {
        let minCurrentDist = Infinity;
        past.track.forEach(pPt => {
            const dist = Math.sqrt(Math.pow(current.current.lat - pPt.lat, 2) + Math.pow(current.current.lon - pPt.lon, 2));
            if (dist < minCurrentDist) minCurrentDist = dist;
        });
        const posScore = Math.max(0, 1 - (minCurrentDist / 12)) * WEIGHT_CURRENT_POS;
        score += posScore;
        const curKm = Math.round(minCurrentDist * 111);
        if (curKm < 200) {
            reasons.push(`📍 現在地付近を過去に通過 (最接近 約${curKm}km)`);
        }
    } else {
        score += WEIGHT_CURRENT_POS * 0.5;
    }

    // ----------------------------------------------------
    // 4. 勢力（中心気圧・風速）の比較 (計 10%)
    // ----------------------------------------------------
    if (current.current && current.current.pressure && past.minPressure) {
        const diffPres = Math.abs(current.current.pressure - past.minPressure);
        const presScore = Math.max(0, 1 - (diffPres / 120)) * WEIGHT_PRESSURE;
        score += presScore;
    } else {
        score += WEIGHT_PRESSURE * 0.5;
    }

    if (current.current && current.current.maxWind && past.maxWind) {
        const pastWindKt = past.pastWindKt || past.maxWind;
        const diffWind = Math.abs(current.current.maxWind - pastWindKt);
        const windScore = Math.max(0, 1 - (diffWind / 60)) * WEIGHT_WIND;
        score += windScore;
    } else {
        score += WEIGHT_WIND * 0.5;
    }

    return { total: score, reasons };
}

function findSimilarTyphoons(currentTyphoon, pastTyphoons, topN = 3) {
    if (!currentTyphoon || !pastTyphoons || pastTyphoons.length === 0) return [];
    const scored = pastTyphoons.map(past => {
        const sim = calculateSimilarity(currentTyphoon, past);
        return { ...past, similarityScore: sim.total, similarityReasons: sim.reasons };
    });
    scored.sort((a, b) => b.similarityScore - a.similarityScore);
    return scored.slice(0, topN);
}

function renderComparisonCard(typhoon, index) {
    const color = ['#ab47bc', '#26a69a', '#ec407a'][index % 3];
    const scorePct = Math.round(typhoon.similarityScore * 100);

    // デジタル台風URL用の番号フォーマット (西暦4桁 + 2桁の台風番号、例: 201408)
    const rawTc = String(typhoon.tcNumber || typhoon.internationalId || '1').trim();
    const tcNumFormatted = (rawTc.length >= 2 ? rawTc.slice(-2) : rawTc).padStart(2, '0');
    const fullDtId = `${typhoon.year}${tcNumFormatted}`;
    const dtUrl = `https://agora.ex.nii.ac.jp/digital-typhoon/summary/wnp/s/${fullDtId}.html.ja`;
    const searchUrl = `https://www.google.com/search?q=${typhoon.year}年+台風${tcNumFormatted}号+被害`;
    const reasonsHtml = (typhoon.similarityReasons && typhoon.similarityReasons.length > 0)
        ? `<div class="similarity-reasons">
            <div class="similarity-reasons-title">💡 類似判定の根拠</div>
            <ul>${typhoon.similarityReasons.map(r => `<li>${r}</li>`).join('')}</ul>
           </div>`
        : '';

    return `
        <div class="comparison-card" style="border-top: 3px solid ${color};">
            <h4>${typhoon.year}年 台風${tcNumFormatted}号</h4>
            <div class="typhoon-name">${typhoon.name}</div>
            <div class="score-badge">類似度: ${scorePct}%</div>
            ${reasonsHtml}
            <div class="comparison-stats">
                <div class="stat-row"><span class="stat-label">最大風速</span><span class="stat-value">${typhoon.maxWind || '-'} kt</span></div>
                <div class="stat-row"><span class="stat-label">最低気圧</span><span class="stat-value">${typhoon.minPressure || '-'} hPa</span></div>
                <div class="stat-row"><span class="stat-label">活動期間</span><span class="stat-value-small">${typhoon.startDate ? new Date(typhoon.startDate).toLocaleDateString('ja-JP') : '-'} ~ ${typhoon.endDate ? new Date(typhoon.endDate).toLocaleDateString('ja-JP') : '-'}</span></div>
                ${typhoon.landfall ? '<div class="landfall-badge">日本上陸</div>' : ''}
            </div>
            <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn-damage-detail" data-year="${typhoon.year}" data-tc="${tcNumFormatted}" data-name="${typhoon.name}">
                    <i class="fas fa-house-damage"></i> 被害詳細を見る
                </button>
            </div>
            <div class="dt-link" style="margin-top: 8px;"><a href="${dtUrl}" target="_blank">デジタル台風で公式データを見る <i class="fas fa-external-link-alt"></i></a></div>
            <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                <label style="cursor: pointer; font-size: 0.9em; display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" class="toggle-track-cb" data-index="${index}">
                    マップに表示
                </label>
                <button class="action-btn btn-animate" data-id="${typhoon.id}" style="padding: 6px 12px; font-size: 0.85em; background: rgba(38, 166, 154, 0.2); border: 1px solid rgba(38, 166, 154, 0.5); border-radius: 4px; color: #fff; cursor: pointer;">▶ 再生</button>
            </div>
        </div>
    `;
}

// 被害情報をデジタル台風HTMLから取得・解析する関数
async function openDamageDetailModal(year, tcNumber, name) {
    const modal = document.getElementById('damage-modal');
    const titleEl = document.getElementById('damage-modal-title');
    const bodyEl = document.getElementById('damage-modal-body');
    if (!modal || !bodyEl) return;

    titleEl.textContent = `${year}年 台風${tcNumber}号 (${name}) の被害情報`;
    bodyEl.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
            <i class="fas fa-spinner fa-spin fa-2x"></i>
            <p style="margin-top: 10px;">デジタル台風 (Digital Typhoon) から被害データを取得中...</p>
        </div>
    `;
    modal.classList.remove('hidden');

    const dtUrl = `https://agora.ex.nii.ac.jp/digital-typhoon/summary/wnp/s/${year}${tcNumber}.html.ja`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(dtUrl)}`;
    const googleSearchUrl = `https://www.google.com/search?q=${year}年+台風${tcNumber}号+被害状況+浸水+死者`;

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('ネットワークエラー');
        const data = await response.json();
        const htmlText = data.contents;

        if (!htmlText) throw new Error('データ空');

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // デジタル台風の被害テーブル解析
        let dead = '-', missing = '-', injured = '-', houseTotal = '-', housePartial = '-', flooded = '-';
        let damageSummary = '';

        const tables = doc.querySelectorAll('table');
        tables.forEach(table => {
            const text = table.textContent;
            if (text.includes('死者') || text.includes('全壊') || text.includes('被害')) {
                const rows = table.querySelectorAll('tr');
                rows.forEach(r => {
                    const cells = r.querySelectorAll('th, td');
                    if (cells.length >= 2) {
                        const label = cells[0].textContent.trim();
                        const val = cells[1].textContent.trim();
                        if (label.includes('死者')) dead = val;
                        if (label.includes('行方不明')) missing = val;
                        if (label.includes('負傷者')) injured = val;
                        if (label.includes('全壊') || label.includes('倒壊')) houseTotal = val;
                        if (label.includes('半壊') || label.includes('一部破損')) housePartial = val;
                        if (label.includes('床上浸水') || label.includes('浸水')) flooded = val;
                    }
                });
            }
        });

        // 概要テキストの抽出
        const pList = doc.querySelectorAll('.summary, p, .desc');
        pList.forEach(p => {
            if (p.textContent.includes('被害') || p.textContent.includes('観測') || p.textContent.includes('上陸')) {
                if (!damageSummary && p.textContent.length > 20) {
                    damageSummary = p.textContent.trim();
                }
            }
        });

        bodyEl.innerHTML = `
            <div class="damage-container">
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 15px;">
                    国立情報学研究所 (NII)「デジタル台風」公式記録より取得した災害統計です。
                </p>
                <div class="damage-grid">
                    <div class="damage-stat-card">
                        <div class="damage-stat-label">死者・行方不明者</div>
                        <div class="damage-stat-num danger">${dead !== '-' ? dead : (missing !== '-' ? missing : 'データなし')}</div>
                    </div>
                    <div class="damage-stat-card">
                        <div class="damage-stat-label">負傷者</div>
                        <div class="damage-stat-num">${injured !== '-' ? injured : 'データなし'}</div>
                    </div>
                    <div class="damage-stat-card">
                        <div class="damage-stat-label">住家全壊・全焼</div>
                        <div class="damage-stat-num">${houseTotal !== '-' ? houseTotal : 'データなし'}</div>
                    </div>
                    <div class="damage-stat-card">
                        <div class="damage-stat-label">浸水被害 (床上/床下)</div>
                        <div class="damage-stat-num">${flooded !== '-' ? flooded : 'データなし'}</div>
                    </div>
                </div>

                ${damageSummary ? `
                    <div class="damage-summary-box">
                        <strong>📝 災害概要・解説 (デジタル台風)</strong><br>
                        ${damageSummary}
                    </div>
                ` : ''}

                <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <a href="${dtUrl}" target="_blank" style="color: var(--accent-primary); font-size: 0.88rem; text-decoration: none;">
                        <i class="fas fa-external-link-alt"></i> デジタル台風で詳細記録を閲覧
                    </a>
                    <a href="${googleSearchUrl}" target="_blank" style="color: #ffb74d; font-size: 0.88rem; text-decoration: none;">
                        <i class="fas fa-search"></i> Googleで詳細被害ニュースを検索
                    </a>
                </div>
            </div>
        `;
    } catch (e) {
        console.warn('デジタル台風データの通信取得に失敗。代替表示に切替:', e);
        bodyEl.innerHTML = `
            <div style="padding: 10px 0;">
                <p style="color: #ef5350; font-size: 0.9rem; margin-bottom: 15px;">
                    <i class="fas fa-exclamation-triangle"></i> デジタル台風からの自動データ抽出中に一時的なエラーが発生しました。
                </p>
                <div class="damage-summary-box">
                    <strong>💡 該当台風の記録ページへ直接アクセスできます：</strong><br>
                    ${year}年 台風${tcNumber}号 (${name}) の詳細な人的・物的被害記録、当時の気象チャートは公式データベースでご確認いただけます。
                </div>
                    <a href="${googleSearchUrl}" target="_blank" class="primary-btn" style="background: rgba(255,152,0,0.2); border-color: rgba(255,152,0,0.5); color: #ffb74d; text-align: center; text-decoration: none;">
                        <i class="fas fa-search"></i> Googleで被害報道ニュースを検索
                    </a>
                </div>
            </div>
        `;
    }
}

// ============================================================
// app.js main logic
// ============================================================
const state = { realtimeTyphoons: [], pastTyphoons: [], currentTyphoonId: null, isRadarOn: false, isHeatmapOn: false };
const els = {};

async function init() {
    els.viewJma = document.getElementById('view-jma');
    els.viewWn = document.getElementById('view-wn');
    els.btnJma = document.getElementById('btn-source-jma');
    els.btnWn = document.getElementById('btn-source-wn');
    els.btnSettings = document.getElementById('btn-settings');
    els.settingsModal = document.getElementById('settings-modal');
    els.btnCloseSettings = document.getElementById('btn-close-settings');
    els.typhoonSelect = document.getElementById('typhoon-select');
    els.valPressure = document.getElementById('val-pressure');
    els.valWind = document.getElementById('val-wind');
    els.valLocation = document.getElementById('val-location');
    els.valGrade = document.getElementById('val-grade');
    els.currentTime = document.getElementById('current-time');
    els.warningsList = document.getElementById('warnings-list');
    els.btnRadar = document.getElementById('btn-toggle-radar');
    els.btnHeatmap = document.getElementById('btn-toggle-heatmap');
    els.btnCenter = document.getElementById('btn-center-map');
    els.compareStatus = document.getElementById('comparison-status');
    els.compareCards = document.getElementById('comparison-cards-container');
    els.btnRefreshCompare = document.getElementById('btn-refresh-compare');
    els.lblDataCount = document.getElementById('lbl-data-count');
    els.lblDataYears = document.getElementById('lbl-data-years');
    els.inputYearStart = document.getElementById('input-year-start');
    els.inputYearEnd = document.getElementById('input-year-end');
    els.btnDownloadData = document.getElementById('btn-download-data');
    els.btnClearData = document.getElementById('btn-clear-data');
    els.dataProgress = document.getElementById('data-progress');
    els.btnGetLocation = document.getElementById('btn-get-location');
    els.distanceResult = document.getElementById('distance-result');
    els.tempLegend = document.getElementById('temp-legend');
    els.headerComparison = document.getElementById('header-comparison');
    els.comparisonBody = document.getElementById('comparison-body');
    els.iconToggleCompare = document.getElementById('icon-toggle-compare');

    initMap('map');
    setupEventListeners();
    
    // データ初期化を非同期並列実行
    loadRealtimeData().catch(e => console.error(e));
    loadDataStatus().catch(e => console.error(e));
}

function setupEventListeners() {
    els.btnJma?.addEventListener('click', () => switchSource('jma'));
    els.btnWn?.addEventListener('click', () => switchSource('wn'));
    els.typhoonSelect?.addEventListener('change', (e) => selectTyphoon(e.target.value));
    els.btnRadar?.addEventListener('click', async () => {
        state.isRadarOn = !state.isRadarOn;
        els.btnRadar.classList.toggle('active', state.isRadarOn);
        await toggleRadar(state.isRadarOn);
    });
    els.btnHeatmap?.addEventListener('click', async () => {
        state.isHeatmapOn = !state.isHeatmapOn;
        els.btnHeatmap.classList.toggle('active', state.isHeatmapOn);
        if (state.isHeatmapOn) {
            els.btnHeatmap.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 取得中...';
            els.btnHeatmap.disabled = true;
            await drawHeatmap();
            els.btnHeatmap.innerHTML = '<i class="fas fa-thermometer-half"></i> 気温マップ';
            els.btnHeatmap.disabled = false;
            if (els.tempLegend) els.tempLegend.classList.remove('hidden');
        } else {
            layerGroups.heatmap.clearLayers();
            if (els.tempLegend) els.tempLegend.classList.add('hidden');
        }
    });
    els.btnCenter?.addEventListener('click', () => {
        const current = getCurrentTyphoon();
        if (current && current.current) { focusOnPosition(current.current.lat, current.current.lon); }
    });
    els.btnRefreshCompare?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateComparison();
    });
    if (els.headerComparison) {
        els.headerComparison.addEventListener('click', () => {
            if (els.comparisonBody) {
                els.comparisonBody.classList.toggle('collapsed');
            }
            if (els.iconToggleCompare) {
                els.iconToggleCompare.classList.toggle('icon-toggle-collapsed');
            }
        });
    }
    els.btnSettings?.addEventListener('click', () => els.settingsModal?.classList.remove('hidden'));
    els.btnCloseSettings?.addEventListener('click', () => els.settingsModal?.classList.add('hidden'));
    els.btnDownloadData?.addEventListener('click', handleDataDownload);
    els.btnClearData?.addEventListener('click', handleDataClear);

    const btnCloseDamage = document.getElementById('btn-close-damage');
    const damageModal = document.getElementById('damage-modal');
    if (btnCloseDamage && damageModal) {
        btnCloseDamage.addEventListener('click', () => damageModal.classList.add('hidden'));
    }
}

function switchSource(source) {
    if (source === 'jma') {
        els.btnJma.classList.add('active'); els.btnWn.classList.remove('active');
        els.viewJma.classList.remove('hidden'); els.viewJma.classList.add('active');
        els.viewWn.classList.add('hidden'); els.viewWn.classList.remove('active');
        setTimeout(() => { const map = getMap(); if (map) map.invalidateSize(); }, 100);
    } else {
        els.btnWn.classList.add('active'); els.btnJma.classList.remove('active');
        els.viewWn.classList.remove('hidden'); els.viewWn.classList.add('active');
        els.viewJma.classList.add('hidden'); els.viewJma.classList.remove('active');
    }
}

async function loadDataStatus() {
    try {
        const count = await getTyphoonCount();
        const yearRange = await getMeta('yearRange');
        els.lblDataCount.textContent = count;
        if (yearRange) {
            els.lblDataYears.textContent = `(対象年度: ${yearRange.start}年〜${yearRange.end}年)`;
            els.inputYearStart.value = yearRange.start; els.inputYearEnd.value = yearRange.end;
        } else { els.lblDataYears.textContent = '(対象年度: 未設定)'; }
        
        if (count > 0) {
            state.pastTyphoons = await getAllTyphoons();
        } else {
            state.pastTyphoons = [];
        }
    } catch (e) {
        console.error('データ読み込み失敗:', e);
        state.pastTyphoons = [];
    }
}

async function loadRealtimeData() {
    try {
        state.realtimeTyphoons = await fetchRealtimeTyphoons();
    } catch (e) {
        console.error('loadRealtimeDataエラー:', e);
        state.realtimeTyphoons = [];
    }

    els.typhoonSelect.innerHTML = '';
    if (state.realtimeTyphoons.length === 0) {
        els.typhoonSelect.innerHTML = '<option value="none">現在発生している台風はありません</option>';
        els.currentTime.textContent = '-';
        els.valPressure.textContent = '---';
        els.valWind.textContent = '---';
        els.valLocation.textContent = '---';
        els.valGrade.textContent = '---';
        els.warningsList.innerHTML = '<div class="no-data">情報はありません</div>';
        
        // 比較パネルのクリアメッセージ
        els.compareStatus.textContent = '現在発生している台風がないため、比較データはありません。';
        els.compareCards.innerHTML = '';
        
        clearAllLayers();
        return;
    }

    state.realtimeTyphoons.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = `${t.name} (台風${t.internationalId}号)`;
        els.typhoonSelect.appendChild(option);
    });
    selectTyphoon(state.realtimeTyphoons[0].id, false);
}

function selectTyphoon(id, focusOnTyphoon = true) {
    if (id === 'none') return;
    state.currentTyphoonId = id;
    const current = getCurrentTyphoon();
    if (!current) return;
    updateInfoPanel(current);
    clearAllLayers();
    if (current.track) drawTrack(current.track);
    if (current.current) drawCurrentPosition(current.current);
    if (current.forecast) drawForecast(current.current, current.forecast);
    if (focusOnTyphoon && current.current && current.current.lat && current.current.lon) {
        focusOnPosition(current.current.lat, current.current.lon, 7);
    }
    updateComparison();
}

function getCurrentTyphoon() { return state.realtimeTyphoons.find(t => t.id === state.currentTyphoonId); }

function updateInfoPanel(typhoon) {
    if (!typhoon || !typhoon.current) return;
    const curr = typhoon.current;
    els.currentTime.textContent = new Date(curr.datetime).toLocaleString('ja-JP');
    els.valPressure.textContent = curr.pressure || '---';
    els.valWind.textContent = curr.maxWindMs ? curr.maxWindMs.toFixed(1) : '---';
    els.valLocation.textContent = `北緯${curr.lat.toFixed(1)}° 東経${curr.lon.toFixed(1)}°`;
    els.valGrade.textContent = curr.gradeLabel || '---';
    els.warningsList.innerHTML = '';
    if (typhoon.warnings && typhoon.warnings.length > 0) {
        typhoon.warnings.forEach(w => {
            const div = document.createElement('div');
            div.className = `warning-item level-${w.level}`;
            div.innerHTML = `<span class="warning-area">${w.area}</span><span class="warning-type">${w.type}</span>`;
            els.warningsList.appendChild(div);
        });
    } else { els.warningsList.innerHTML = '<div class="no-data">警報・注意報は発表されていません</div>'; }
}

function updateComparison() {
    const current = getCurrentTyphoon();
    if (!current) return;
    if (!state.pastTyphoons || state.pastTyphoons.length === 0) {
        els.compareStatus.textContent = 'データがありません。設定から過去データをダウンロードしてください。';
        els.compareCards.innerHTML = '';
        return;
    }
    els.compareStatus.textContent = '類似度を計算中...';
    const similar = findSimilarTyphoons(current, state.pastTyphoons, 3);
    if (similar.length === 0) {
        els.compareStatus.textContent = '類似する台風が見つかりませんでした。';
        els.compareCards.innerHTML = '';
        return;
    }
    els.compareStatus.textContent = '現在位置と勢力に基づく類似台風トップ3';

    // 1. レイヤーグループ（layerGroups.comparison）を作成
    drawComparisonTracks(similar);

    // 2. カードHTMLを生成
    els.compareCards.innerHTML = similar.map((t, i) => renderComparisonCard(t, i)).join('');
    
    // 3. チェックボックスイベントバインド
    document.querySelectorAll('.toggle-track-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'), 10);
            const lg = layerGroups.comparison[idx];
            if (lg) {
                if (e.target.checked) map.addLayer(lg);
                else map.removeLayer(lg);
            }
        });
    });

    document.querySelectorAll('.btn-animate').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            const targetTyphoon = state.pastTyphoons.find(t => t.id === id);
            if(targetTyphoon) playAnimation(targetTyphoon, e.target);
        });
    });

    document.querySelectorAll('.btn-damage-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const year = target.getAttribute('data-year');
            const tc = target.getAttribute('data-tc');
            const name = target.getAttribute('data-name');
            openDamageDetailModal(year, tc, name);
        });
    });
}

async function handleDataDownload() {
    const startYear = parseInt(els.inputYearStart.value, 10);
    const endYear = parseInt(els.inputYearEnd.value, 10);
    if (isNaN(startYear) || isNaN(endYear) || startYear > endYear) { alert('正しい年度範囲を入力してください。'); return; }
    els.btnDownloadData.disabled = true;
    els.dataProgress.classList.remove('hidden');
    const onProgress = (msg) => { els.dataProgress.textContent = msg; };
    try {
        await downloadAndParseBestTrack(startYear, endYear, onProgress);
        await loadDataStatus();
        updateComparison();
        setTimeout(() => { els.dataProgress.classList.add('hidden'); }, 3000);
    } catch (e) { console.error(e); els.dataProgress.textContent = `エラー: ${e.message}`; }
    finally { els.btnDownloadData.disabled = false; }
}

async function handleDataClear() {
    if (!confirm('保存されているすべての過去台風データを削除しますか？')) return;
    try {
        await clearAllData();
        state.pastTyphoons = [];
        await loadDataStatus();
        updateComparison();
        alert('データを削除しました。');
    } catch (e) { console.error(e); alert('データの削除に失敗しました。'); }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function handleGetLocation() {
    const current = getCurrentTyphoon();
    if (!current || !current.current || !current.current.lat) {
        alert('現在比較できる台風がありません。');
        return;
    }
    
    els.btnGetLocation.textContent = '取得中...';
    els.btnGetLocation.disabled = true;
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            els.btnGetLocation.innerHTML = '<i class="fas fa-map-marker-alt"></i> 現在地からの距離を更新';
            els.btnGetLocation.disabled = false;
            
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;
            
            if (!layerGroups.userLocation) layerGroups.userLocation = L.layerGroup().addTo(map);
            layerGroups.userLocation.clearLayers();
            L.marker([userLat, userLon], {
                icon: L.divIcon({ html: '<div style="font-size: 24px; text-shadow: 0 0 5px black;">📍</div>', className: 'user-location-icon', iconSize: [24, 24], iconAnchor: [12, 24] })
            }).bindPopup('あなたの現在地').addTo(layerGroups.userLocation);
            
            const dist = calculateDistance(userLat, userLon, current.current.lat, current.current.lon);
            els.distanceResult.classList.remove('hidden');
            els.distanceResult.innerHTML = `現在地から中心まで：約 <span style="font-size:1.5em; color: #ffa726;">${Math.round(dist)}</span> km`;
        },
        (error) => {
            els.btnGetLocation.innerHTML = '<i class="fas fa-map-marker-alt"></i> 現在地からの距離を測る';
            els.btnGetLocation.disabled = false;
            alert('位置情報の取得に失敗しました。ブラウザの設定で許可されているか確認してください。');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

let animationInterval = null;
function playAnimation(typhoon, btnElement) {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }

    if (layerGroups.anim) {
        if (map.hasLayer(layerGroups.anim)) map.removeLayer(layerGroups.anim);
        layerGroups.anim = null;
    }
    
    if (btnElement.textContent.includes('停止')) {
        btnElement.textContent = '▶ 再生';
        return;
    }
    
    document.querySelectorAll('.btn-animate').forEach(b => b.textContent = '▶ 再生');
    btnElement.textContent = '⏹ 停止';
    
    const track = typhoon.track;
    if (!track || track.length === 0) return;
    
    const lg = L.layerGroup().addTo(map);
    layerGroups.anim = lg;
    
    let currentIndex = 0;
    const color = '#26a69a';
    
    const marker = L.circleMarker([track[0].lat, track[0].lon], { radius: 6, color: color, fillColor: color, fillOpacity: 0.8 }).addTo(lg);
    const lineLatlngs = [];
    const polyline = L.polyline(lineLatlngs, { color: color, weight: 3, opacity: 0.8 }).addTo(lg);
    
    animationInterval = setInterval(() => {
        if (currentIndex >= track.length) {
            clearInterval(animationInterval);
            animationInterval = null;
            btnElement.textContent = '▶ 再生';
            setTimeout(() => {
                if (layerGroups.anim && map.hasLayer(layerGroups.anim)) {
                    map.removeLayer(layerGroups.anim);
                    layerGroups.anim = null;
                }
            }, 3000);
            return;
        }
        
        const p = track[currentIndex];
        marker.setLatLng([p.lat, p.lon]);
        marker.bindPopup(`<strong>${typhoon.name} (${typhoon.year}年)</strong><br>${new Date(p.datetime).toLocaleString('ja-JP')}<br>風速: ${p.maxWind} kt<br>気圧: ${p.pressure} hPa`).openPopup();
        
        lineLatlngs.push([p.lat, p.lon]);
        polyline.setLatLngs(lineLatlngs);
        
        if (p.wind50 && p.wind50.longRadius > 0) {
            L.circle([p.lat, p.lon], { radius: p.wind50.longRadius * 1852, color: '#ef5350', weight: 1, fillColor: '#ef5350', fillOpacity: 0.1 }).addTo(lg);
        }
        
        currentIndex++;
    }, 150);
}

document.addEventListener('DOMContentLoaded', init);
